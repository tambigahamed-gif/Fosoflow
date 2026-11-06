-- FasoFlow 015 — marketplace de services et modes de vente produits.
-- Migration additive/idempotente : aucune table ni ligne existante n'est supprimée.
-- À examiner avec le schéma réellement installé avant toute application distante.
begin;

-- Prestataire : rôle non privilégié. L'inscription ne peut jamais créer un admin.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('client','merchant','courier','service_provider','admin')) not valid;
alter table public.profiles validate constraint profiles_role_check;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare requested text;
begin
  requested := coalesce(new.raw_user_meta_data->>'role', 'client');
  if requested not in ('client','merchant','courier','service_provider') then requested := 'client'; end if;
  insert into public.profiles(id, role, full_name, phone)
  values (new.id, requested, coalesce(nullif(left(new.raw_user_meta_data->>'full_name',120),''),''), nullif(left(new.raw_user_meta_data->>'phone',32),''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.admin_set_profile_role(p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  if p_role not in ('client','merchant','courier','service_provider','admin') then raise exception 'Rôle invalide'; end if;
  update public.profiles set role=p_role,updated_at=now() where id=p_user_id;
  if not found then raise exception 'Profil introuvable'; end if;
end;
$$;
revoke all on function public.admin_set_profile_role(uuid,text) from public;
grant execute on function public.admin_set_profile_role(uuid,text) to authenticated;

-- Les catégories des services sont séparées des catégories de produits.
create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists service_categories_active_order_idx on public.service_categories(is_active,sort_order,name);
insert into public.service_categories(name,slug,description,sort_order) values
  ('Maison & bâtiment','maison-batiment','Travaux, entretien, réparation et aménagement.',1),
  ('Automobile','automobile','Entretien, réparation et services automobiles.',2),
  ('Beauté','beaute','Soins et prestations de beauté.',3),
  ('Mode','mode','Couture, retouches et services de mode.',4),
  ('Informatique','informatique','Dépannage, assistance et solutions numériques.',5),
  ('Création','creation','Création visuelle, artisanale et contenu.',6),
  ('Événementiel','evenementiel','Services pour événements et cérémonies.',7),
  ('Éducation','education','Cours, soutien et formation.',8),
  ('Transport','transport','Transport et services de déplacement.',9)
on conflict do nothing;

create table if not exists public.service_provider_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 120),
  bio text not null default '' check (char_length(bio) <= 2500),
  city text not null default '' check (char_length(city) <= 100),
  service_area text[] not null default '{}',
  public_contact_phone text check (public_contact_phone is null or char_length(public_contact_phone) <= 32),
  review_status text not null default 'pending_review' check (review_status in ('pending_review','active','suspended','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_provider_profiles_public_idx on public.service_provider_profiles(review_status,city);

create or replace function public.guard_service_provider_profile()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.user_id is distinct from old.user_id then raise exception 'Le propriétaire du profil prestataire ne peut pas être modifié'; end if;
    if new.review_status is distinct from old.review_status
      or new.display_name is distinct from old.display_name
      or new.bio is distinct from old.bio
      or new.city is distinct from old.city
      or new.service_area is distinct from old.service_area
      or new.public_contact_phone is distinct from old.public_contact_phone then
      new.review_status := 'pending_review';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists guard_service_provider_profile_trigger on public.service_provider_profiles;
create trigger guard_service_provider_profile_trigger before update on public.service_provider_profiles
  for each row execute function public.guard_service_provider_profile();

create table if not exists public.service_listings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_provider_profiles(user_id) on delete restrict,
  category_id uuid references public.service_categories(id) on delete set null,
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  city text not null default '' check (char_length(city) <= 100),
  service_area text[] not null default '{}',
  price_min_xof bigint check (price_min_xof is null or price_min_xof >= 0),
  price_max_xof bigint check (price_max_xof is null or price_max_xof >= 0),
  price_unit text check (price_unit is null or char_length(price_unit) <= 80),
  image_urls text[] not null default '{}',
  status text not null default 'pending_review' check (status in ('pending_review','active','rejected','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (price_min_xof is null or price_max_xof is null or price_max_xof >= price_min_xof),
  check (cardinality(image_urls) <= 8)
);
create index if not exists service_listings_public_idx on public.service_listings(status,category_id,city,created_at desc);
create index if not exists service_listings_provider_idx on public.service_listings(provider_id,created_at desc);

create or replace function public.guard_service_listing()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.provider_id is distinct from old.provider_id then raise exception 'Le propriétaire de la prestation ne peut pas être modifié'; end if;
    if new.status is distinct from old.status then new.status := old.status; end if;
    if new.category_id is distinct from old.category_id
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.city is distinct from old.city
      or new.service_area is distinct from old.service_area
      or new.price_min_xof is distinct from old.price_min_xof
      or new.price_max_xof is distinct from old.price_max_xof
      or new.price_unit is distinct from old.price_unit
      or new.image_urls is distinct from old.image_urls then
      new.status := 'pending_review';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists guard_service_listing_trigger on public.service_listings;
create trigger guard_service_listing_trigger before update on public.service_listings
  for each row execute function public.guard_service_listing();

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.service_listings(id) on delete restrict,
  client_id uuid not null references public.profiles(id) on delete restrict,
  provider_id uuid not null references public.service_provider_profiles(user_id) on delete restrict,
  message text not null check (char_length(message) between 5 and 2000),
  requested_at timestamptz,
  requested_location text check (requested_location is null or char_length(requested_location) <= 500),
  status text not null default 'requested' check (status in ('requested','quoted','accepted','completed','cancelled','declined')),
  quoted_price_xof bigint check (quoted_price_xof is null or quoted_price_xof >= 0),
  quote_message text check (quote_message is null or char_length(quote_message) <= 2000),
  agreed_at timestamptz,
  agreed_location text check (agreed_location is null or char_length(agreed_location) <= 500),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_requests_client_idx on public.service_requests(client_id,created_at desc);
create index if not exists service_requests_provider_idx on public.service_requests(provider_id,status,created_at desc);
create index if not exists service_requests_service_idx on public.service_requests(service_id,created_at desc);

alter table public.conversations add column if not exists service_request_id uuid references public.service_requests(id) on delete cascade;
alter table public.conversations drop constraint if exists conversations_check;
alter table public.conversations add constraint conversations_check
  check (product_id is not null or order_id is not null or service_request_id is not null) not valid;
alter table public.conversations validate constraint conversations_check;
create unique index if not exists conversations_service_request_unique_idx
  on public.conversations(service_request_id) where service_request_id is not null;
create index if not exists conversations_service_request_idx on public.conversations(service_request_id);

create table if not exists public.service_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.service_requests(id) on delete restrict,
  service_id uuid not null references public.service_listings(id) on delete restrict,
  client_id uuid not null references public.profiles(id) on delete restrict,
  provider_id uuid not null references public.service_provider_profiles(user_id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 2000),
  status text not null default 'pending_review' check (status in ('pending_review','published','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists service_reviews_public_idx on public.service_reviews(service_id,status,created_at desc);
create index if not exists service_reviews_provider_idx on public.service_reviews(provider_id,status,created_at desc);

-- Écritures métier réservées aux RPC : rôle, participant, annonce et transitions sont revérifiés.
create or replace function public.get_or_create_service_conversation(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_request public.service_requests%rowtype; v_id uuid;
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  select * into v_request from public.service_requests where id=p_request_id;
  if not found or v_user not in (v_request.client_id,v_request.provider_id) then raise exception 'Demande de devis inaccessible'; end if;
  select id into v_id from public.conversations where service_request_id=p_request_id;
  if v_id is null then
    insert into public.conversations(service_request_id,title)
      values(p_request_id,'Devis service #'||left(p_request_id::text,8)) returning id into v_id;
    insert into public.conversation_participants(conversation_id,user_id)
      values(v_id,v_request.client_id),(v_id,v_request.provider_id) on conflict do nothing;
  end if;
  return v_id;
end;
$$;
revoke all on function public.get_or_create_service_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_service_conversation(uuid) to authenticated;

create or replace function public.create_service_request(
  p_service_id uuid,p_message text,p_requested_at timestamptz default null,p_requested_location text default null
)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_provider uuid; v_request uuid; v_conversation uuid;
begin
  if v_user is null or not exists(select 1 from public.profiles where id=v_user and role='client') then raise exception 'Compte client requis'; end if;
  if char_length(trim(coalesce(p_message,''))) not between 5 and 2000 then raise exception 'Décrivez votre besoin en 5 à 2 000 caractères'; end if;
  if p_requested_location is not null and char_length(p_requested_location)>500 then raise exception 'Lieu trop long'; end if;
  select sl.provider_id into v_provider from public.service_listings sl
    join public.service_provider_profiles spp on spp.user_id=sl.provider_id and spp.review_status='active'
    where sl.id=p_service_id and sl.status='active';
  if v_provider is null then raise exception 'Prestation ou prestataire indisponible'; end if;
  insert into public.service_requests(service_id,client_id,provider_id,message,requested_at,requested_location)
    values(p_service_id,v_user,v_provider,trim(p_message),p_requested_at,nullif(trim(coalesce(p_requested_location,'')),'')) returning id into v_request;
  insert into public.conversations(service_request_id,title)
    values(v_request,'Devis service #'||left(v_request::text,8)) returning id into v_conversation;
  insert into public.conversation_participants(conversation_id,user_id) values(v_conversation,v_user),(v_conversation,v_provider);
  insert into public.messages(conversation_id,sender_id,body) values(v_conversation,v_user,trim(p_message));
  insert into public.notifications(user_id,kind,title,body,link)
    values(v_provider,'service_quote_request','Nouvelle demande de devis','Un client demande un devis pour une prestation.','/provider/requests');
  return v_request;
end;
$$;
revoke all on function public.create_service_request(uuid,text,timestamptz,text) from public, anon;
grant execute on function public.create_service_request(uuid,text,timestamptz,text) to authenticated;

create or replace function public.respond_service_request(p_request_id uuid,p_status text,p_quoted_price_xof bigint default null,p_quote_message text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_request public.service_requests%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='service_provider') then raise exception 'Compte prestataire requis'; end if;
  select * into v_request from public.service_requests where id=p_request_id for update;
  if not found or v_request.provider_id<>auth.uid() then raise exception 'Demande de devis inaccessible'; end if;
  if v_request.status not in ('requested','quoted') then raise exception 'Cette demande ne peut plus être modifiée'; end if;
  if p_status='quoted' then
    if p_quoted_price_xof is null or p_quoted_price_xof<0 then raise exception 'Indiquez un prix de devis valide en XOF'; end if;
    if char_length(coalesce(p_quote_message,''))>2000 then raise exception 'Le message de devis est trop long'; end if;
    update public.service_requests set status='quoted',quoted_price_xof=p_quoted_price_xof,quote_message=nullif(trim(coalesce(p_quote_message,'')),''),updated_at=now() where id=p_request_id;
    insert into public.notifications(user_id,kind,title,body,link)
      values(v_request.client_id,'service_quote_ready','Votre devis est prêt','Le prestataire a répondu à votre demande.','/client/service-requests');
  elsif p_status='declined' then
    update public.service_requests set status='declined',updated_at=now() where id=p_request_id;
    insert into public.notifications(user_id,kind,title,body,link)
      values(v_request.client_id,'service_request_declined','Demande non disponible','Le prestataire ne peut pas répondre à cette demande.','/client/service-requests');
  else
    raise exception 'Réponse de prestataire invalide';
  end if;
end;
$$;
revoke all on function public.respond_service_request(uuid,text,bigint,text) from public, anon;
grant execute on function public.respond_service_request(uuid,text,bigint,text) to authenticated;

create or replace function public.decide_service_quote(p_request_id uuid,p_accept boolean,p_agreed_at timestamptz default null,p_agreed_location text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_request public.service_requests%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='client') then raise exception 'Compte client requis'; end if;
  select * into v_request from public.service_requests where id=p_request_id for update;
  if not found or v_request.client_id<>auth.uid() then raise exception 'Demande de devis inaccessible'; end if;
  if v_request.status<>'quoted' then raise exception 'Le devis n’est plus en attente de décision'; end if;
  if p_accept then
    if p_agreed_at is null or p_agreed_at<now() then raise exception 'Choisissez une date future convenue avec le prestataire'; end if;
    if char_length(trim(coalesce(p_agreed_location,''))) not between 3 and 500 then raise exception 'Indiquez le lieu convenu (3 à 500 caractères)'; end if;
    update public.service_requests set status='accepted',agreed_at=p_agreed_at,agreed_location=trim(p_agreed_location),updated_at=now() where id=p_request_id;
  else
    update public.service_requests set status='cancelled',updated_at=now() where id=p_request_id;
  end if;
  insert into public.notifications(user_id,kind,title,body,link)
    values(v_request.provider_id,'service_quote_decision',case when p_accept then 'Devis accepté' else 'Devis refusé' end,
      case when p_accept then 'Le client a confirmé la date et le lieu convenus. Le paiement de la prestation n’est pas géré par FasoFlow.' else 'Le client a décliné le devis.' end,'/provider/requests');
end;
$$;
revoke all on function public.decide_service_quote(uuid,boolean,timestamptz,text) from public, anon;
grant execute on function public.decide_service_quote(uuid,boolean,timestamptz,text) to authenticated;

create or replace function public.complete_service_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_request public.service_requests%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='client') then raise exception 'Compte client requis'; end if;
  select * into v_request from public.service_requests where id=p_request_id for update;
  if not found or v_request.client_id<>auth.uid() then raise exception 'Demande de devis inaccessible'; end if;
  if v_request.status<>'accepted' then raise exception 'Seule une prestation convenue peut être confirmée terminée'; end if;
  update public.service_requests set status='completed',completed_at=now(),updated_at=now() where id=p_request_id;
end;
$$;
revoke all on function public.complete_service_request(uuid) from public, anon;
grant execute on function public.complete_service_request(uuid) to authenticated;

create or replace function public.admin_set_service_provider_status(p_user_id uuid,p_status text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  if p_status not in ('pending_review','active','suspended','rejected') then raise exception 'Statut prestataire invalide'; end if;
  update public.service_provider_profiles set review_status=p_status,updated_at=now() where user_id=p_user_id;
  if not found then raise exception 'Profil prestataire introuvable'; end if;
end;
$$;
revoke all on function public.admin_set_service_provider_status(uuid,text) from public;
grant execute on function public.admin_set_service_provider_status(uuid,text) to authenticated;

create or replace function public.admin_set_service_status(p_service_id uuid,p_status text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  if p_status not in ('pending_review','active','rejected','archived') then raise exception 'Statut de prestation invalide'; end if;
  update public.service_listings set status=p_status,updated_at=now() where id=p_service_id;
  if not found then raise exception 'Prestation introuvable'; end if;
end;
$$;
revoke all on function public.admin_set_service_status(uuid,text) from public;
grant execute on function public.admin_set_service_status(uuid,text) to authenticated;

create or replace function public.admin_set_service_review_status(p_review_id uuid,p_status text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  if p_status not in ('pending_review','published','rejected') then raise exception 'Statut d’avis invalide'; end if;
  update public.service_reviews set status=p_status where id=p_review_id;
  if not found then raise exception 'Avis de service introuvable'; end if;
end;
$$;
revoke all on function public.admin_set_service_review_status(uuid,text) from public;
grant execute on function public.admin_set_service_review_status(uuid,text) to authenticated;

-- Attributs optionnels préservent l'historique : les anciennes fiches restent à NULL (inconnu).
alter table public.products add column if not exists condition text;
alter table public.products add column if not exists sale_mode text;
alter table public.products add column if not exists minimum_order_quantity integer;
alter table public.products add column if not exists lead_time_days integer;
alter table public.products drop constraint if exists products_condition_015_check;
alter table public.products add constraint products_condition_015_check
  check (condition is null or condition in ('new','used','refurbished')) not valid;
alter table public.products validate constraint products_condition_015_check;
alter table public.products drop constraint if exists products_sale_mode_015_check;
alter table public.products add constraint products_sale_mode_015_check
  check (sale_mode is null or sale_mode in ('retail','wholesale','made_to_order')) not valid;
alter table public.products validate constraint products_sale_mode_015_check;
alter table public.products drop constraint if exists products_minimum_order_015_check;
alter table public.products add constraint products_minimum_order_015_check
  check (minimum_order_quantity is null or minimum_order_quantity between 1 and 100) not valid;
alter table public.products validate constraint products_minimum_order_015_check;
alter table public.products drop constraint if exists products_retail_minimum_015_check;
alter table public.products add constraint products_retail_minimum_015_check
  check (sale_mode is distinct from 'retail' or coalesce(minimum_order_quantity,1)=1) not valid;
alter table public.products validate constraint products_retail_minimum_015_check;
alter table public.products drop constraint if exists products_wholesale_minimum_015_check;
alter table public.products add constraint products_wholesale_minimum_015_check
  check (sale_mode is distinct from 'wholesale' or coalesce(minimum_order_quantity,0)>=2) not valid;
alter table public.products validate constraint products_wholesale_minimum_015_check;
alter table public.products drop constraint if exists products_lead_time_015_check;
alter table public.products add constraint products_lead_time_015_check
  check (lead_time_days is null or lead_time_days between 0 and 365) not valid;
alter table public.products validate constraint products_lead_time_015_check;

create or replace function public.default_new_product_modes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.condition := coalesce(new.condition,'new');
  new.sale_mode := coalesce(new.sale_mode,'retail');
  new.minimum_order_quantity := coalesce(new.minimum_order_quantity,case when new.sale_mode='wholesale' then 2 else 1 end);
  return new;
end;
$$;
drop trigger if exists default_new_product_modes_trigger on public.products;
create trigger default_new_product_modes_trigger before insert on public.products
  for each row execute function public.default_new_product_modes();

alter table public.order_items add column if not exists condition_snapshot text;
alter table public.order_items add column if not exists sale_mode_snapshot text;
alter table public.order_items add column if not exists minimum_order_quantity_snapshot integer;
alter table public.order_items add column if not exists lead_time_days_snapshot integer;

-- Extension des catégories, sans renommer ni retirer les valeurs historiques.
insert into public.categories(name,slug,description,sort_order) values
  ('Téléphones & informatique','telephones-informatique','Téléphones, accessoires et matériel informatique.',10),
  ('Mode & accessoires','mode-accessoires','Vêtements et accessoires du quotidien.',11),
  ('Maison & meubles','maison-meubles','Mobilier, équipement et décoration.',12),
  ('Véhicules & pièces','vehicules-pieces','Véhicules, pièces détachées et accessoires.',13),
  ('Agriculture','agriculture','Matériel et produits agricoles.',14),
  ('Sport & loisirs','sport-loisirs','Équipement, jeux et loisirs.',15),
  ('Bébé & enfants','bebe-enfants','Articles pour bébés et enfants.',16),
  ('Artisanat','artisanat','Créations et savoir-faire artisanaux.',17),
  ('Matériel & équipements','materiel-equipements','Équipements professionnels et domestiques.',18)
on conflict do nothing;

-- place_order conserve les validations/transactions Business 013 et ajoute minimum, mode,
-- stock cohérent et snapshots publics non sensibles. Les coûts d'achat restent privés.
create or replace function public.place_order(p_shop_id uuid,p_items jsonb,p_delivery_address jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare
  v_user uuid := auth.uid(); v_order uuid; v_order_item uuid; v_total bigint := 0;
  v_item jsonb; v_product public.products%rowtype; v_purchase_cost bigint;
  v_qty int; v_minimum int; v_mode text; v_count int := 0;
begin
  if v_user is null or not exists(select 1 from public.profiles where id=v_user and role='client') then
    raise exception 'Compte client requis';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Le panier doit contenir entre 1 et 30 lignes';
  end if;
  if exists (
    select 1 from (select item.value->>'product_id' as product_id
      from jsonb_array_elements(p_items) as item(value)
      group by item.value->>'product_id' having count(*)>1) duplicate_items
  ) then raise exception 'Un même produit apparaît plusieurs fois dans le panier'; end if;
  if not exists(select 1 from public.shops where id=p_shop_id and status='active') then raise exception 'Boutique indisponible'; end if;
  if p_delivery_address is null or jsonb_typeof(p_delivery_address) <> 'object'
    or coalesce(length(p_delivery_address->>'city'),0) < 2
    or coalesce(length(p_delivery_address->>'address'),0) < 3
    or coalesce(length(p_delivery_address->>'phone'),0) < 6 then
    raise exception 'Adresse et téléphone requis';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_count := v_count + 1;
    if v_count > 30 then raise exception 'Trop de lignes dans la commande'; end if;
    v_qty := (v_item->>'quantity')::int;
    if v_qty < 1 or v_qty > 100 then raise exception 'Quantité invalide'; end if;
    select * into v_product from public.products
      where id=(v_item->>'product_id')::uuid and shop_id=p_shop_id and status='active' for update;
    if not found then raise exception 'Produit indisponible'; end if;
    v_minimum := coalesce(v_product.minimum_order_quantity,1);
    v_mode := coalesce(v_product.sale_mode,'retail');
    if v_qty < v_minimum then raise exception 'Quantité minimale de % pour %', v_minimum, v_product.name; end if;
    if v_mode <> 'made_to_order' and v_product.stock_quantity < v_qty then raise exception 'Stock insuffisant pour %', v_product.name; end if;
    v_total := v_total + v_product.price_xof * v_qty;
  end loop;
  insert into public.orders(customer_id,shop_id,subtotal_xof,total_xof,delivery_address)
    values(v_user,p_shop_id,v_total,v_total,p_delivery_address) returning id into v_order;
  perform set_config('fasoflow.business_order_id',v_order::text,true);
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and shop_id=p_shop_id for update;
    v_mode := coalesce(v_product.sale_mode,'retail');
    if v_mode <> 'made_to_order' then
      update public.products set stock_quantity=stock_quantity-v_qty where id=v_product.id;
    end if;
    insert into public.order_items(order_id,product_id,product_name_snapshot,unit_price_xof,quantity,line_total_xof,
      condition_snapshot,sale_mode_snapshot,minimum_order_quantity_snapshot,lead_time_days_snapshot)
      values(v_order,v_product.id,v_product.name,v_product.price_xof,v_qty,v_product.price_xof*v_qty,
        v_product.condition,v_product.sale_mode,v_product.minimum_order_quantity,v_product.lead_time_days)
      returning id into v_order_item;
    v_purchase_cost := null;
    select pc.purchase_cost_xof into v_purchase_cost from public.product_costs pc
      where pc.product_id=v_product.id and pc.shop_id=p_shop_id;
    insert into public.order_item_costs(order_item_id,shop_id,purchase_cost_xof)
      values(v_order_item,p_shop_id,v_purchase_cost);
  end loop;
  perform set_config('fasoflow.business_order_id','',true);
  insert into public.conversations(product_id,order_id,shop_id,title)
    values(null,v_order,p_shop_id,'Commande #'||left(v_order::text,8));
  insert into public.conversation_participants(conversation_id,user_id)
    select id,v_user from public.conversations where order_id=v_order;
  insert into public.conversation_participants(conversation_id,user_id)
    select c.id,s.owner_id from public.conversations c join public.shops s on s.id=c.shop_id where c.order_id=v_order;
  insert into public.notifications(user_id,kind,title,body,link)
    select s.owner_id,'new_order','Nouvelle commande','Une commande vient d’être passée.','/merchant/orders' from public.shops s where s.id=p_shop_id;
  return v_order;
end;
$$;
revoke all on function public.place_order(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.place_order(uuid,jsonb,jsonb) to authenticated;

-- Conserver les transitions de 013, mais ne restituer que le stock effectivement réservé.
create or replace function public.merchant_update_order_status(p_order_id uuid,p_status text)
returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_shop_id uuid; v_owner uuid; v_old text; v_customer uuid;
begin
  select shop_id,status,customer_id into v_shop_id,v_old,v_customer from public.orders where id=p_order_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  select owner_id into v_owner from public.shops where id=v_shop_id;
  if v_owner is distinct from auth.uid() and not public.is_admin() then raise exception 'Commande inaccessible'; end if;
  if not ((v_old='pending' and p_status in ('accepted','cancelled'))
    or (v_old='accepted' and p_status in ('preparing','cancelled'))
    or (v_old='preparing' and p_status in ('ready_for_delivery','cancelled'))) then
    raise exception 'Transition de commande invalide';
  end if;
  update public.orders set status=p_status,updated_at=now() where id=p_order_id;
  if p_status='cancelled' then
    perform set_config('fasoflow.business_order_id',p_order_id::text,true);
    update public.products p set stock_quantity=p.stock_quantity+items.quantity,updated_at=now()
      from (select oi.product_id,sum(oi.quantity)::integer as quantity from public.order_items oi
        where oi.order_id=p_order_id and coalesce(oi.sale_mode_snapshot,'retail')<>'made_to_order'
        group by oi.product_id) items
      where items.product_id=p.id;
    perform set_config('fasoflow.business_order_id','',true);
    update public.deliveries set status='cancelled',updated_at=now()
      where order_id=p_order_id and courier_id is null and status='pending';
    insert into public.notifications(user_id,kind,title,body,link)
      values(v_customer,'order_cancelled','Commande annulée','La boutique a annulé votre commande. Contactez-la si vous avez une question.','/client/orders');
  else
    insert into public.notifications(user_id,kind,title,body,link)
      values(v_customer,'order_status','Commande mise à jour',case when p_status='accepted' then 'La boutique a accepté votre commande.' when p_status='preparing' then 'La boutique prépare votre commande.' else 'Votre commande est prête pour un livreur.' end,'/client/orders');
  end if;
end;
$$;
revoke all on function public.merchant_update_order_status(uuid,text) from public, anon;
grant execute on function public.merchant_update_order_status(uuid,text) to authenticated;

-- RLS distincte : lecture publique des seules fiches approuvées, données privées limitées aux parties.
alter table public.service_categories enable row level security;
alter table public.service_provider_profiles enable row level security;
alter table public.service_listings enable row level security;
alter table public.service_requests enable row level security;
alter table public.service_reviews enable row level security;

drop policy if exists service_categories_public_read on public.service_categories;
create policy service_categories_public_read on public.service_categories for select to anon,authenticated
  using (is_active or public.is_admin());
drop policy if exists service_categories_admin_write on public.service_categories;
create policy service_categories_admin_write on public.service_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists service_provider_profiles_public_read on public.service_provider_profiles;
create policy service_provider_profiles_public_read on public.service_provider_profiles for select to anon,authenticated
  using ((review_status='active' and exists(select 1 from public.profiles p where p.id=user_id and p.role='service_provider')) or user_id=auth.uid() or public.is_admin());
drop policy if exists service_provider_profiles_owner_insert on public.service_provider_profiles;
create policy service_provider_profiles_owner_insert on public.service_provider_profiles for insert to authenticated
  with check (user_id=auth.uid() and review_status='pending_review'
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='service_provider'));
drop policy if exists service_provider_profiles_owner_update on public.service_provider_profiles;
create policy service_provider_profiles_owner_update on public.service_provider_profiles for update to authenticated
  using ((user_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='service_provider')) or public.is_admin())
  with check ((user_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='service_provider')) or public.is_admin());
drop policy if exists service_provider_profiles_admin_write on public.service_provider_profiles;
create policy service_provider_profiles_admin_write on public.service_provider_profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists service_listings_public_read on public.service_listings;
create policy service_listings_public_read on public.service_listings for select to anon,authenticated
  using ((status='active' and exists(select 1 from public.service_provider_profiles spp
      join public.profiles p on p.id=spp.user_id and p.role='service_provider'
      where spp.user_id=provider_id and spp.review_status='active'))
    or (provider_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='service_provider'))
    or public.is_admin());
drop policy if exists service_listings_owner_insert on public.service_listings;
create policy service_listings_owner_insert on public.service_listings for insert to authenticated
  with check (provider_id=auth.uid() and status='pending_review'
    and exists(select 1 from public.service_provider_profiles spp where spp.user_id=auth.uid())
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='service_provider'));
drop policy if exists service_listings_owner_update on public.service_listings;
create policy service_listings_owner_update on public.service_listings for update to authenticated
  using ((provider_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='service_provider')) or public.is_admin())
  with check ((provider_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='service_provider')) or public.is_admin());
drop policy if exists service_listings_admin_delete on public.service_listings;
create policy service_listings_admin_delete on public.service_listings for delete to authenticated using (public.is_admin());

-- Aucune écriture directe sur les devis : seules les fonctions ci-dessus peuvent changer les états.
drop policy if exists service_requests_parties_read on public.service_requests;
create policy service_requests_parties_read on public.service_requests for select to authenticated
  using (client_id=auth.uid() or provider_id=auth.uid() or public.is_admin());
drop policy if exists service_requests_no_direct_write on public.service_requests;
create policy service_requests_no_direct_write on public.service_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists service_reviews_public_read on public.service_reviews;
create policy service_reviews_public_read on public.service_reviews for select to anon,authenticated
  using (status='published' or client_id=auth.uid() or public.is_admin());
drop policy if exists service_reviews_completed_client_insert on public.service_reviews;
create policy service_reviews_completed_client_insert on public.service_reviews for insert to authenticated
  with check (client_id=auth.uid() and status='pending_review'
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='client')
    and exists(select 1 from public.service_requests sr where sr.id=request_id and sr.client_id=auth.uid()
      and sr.service_id=public.service_reviews.service_id and sr.provider_id=public.service_reviews.provider_id and sr.status='completed'));
drop policy if exists service_reviews_admin_update on public.service_reviews;
create policy service_reviews_admin_update on public.service_reviews for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Accès Supabase/PostgREST, toujours filtré par RLS.
grant select on public.service_categories,public.service_provider_profiles,public.service_listings,public.service_reviews to anon;
grant select on public.service_categories,public.service_requests to authenticated;
grant select,insert,update on public.service_provider_profiles,public.service_listings,public.service_reviews to authenticated;
-- Les conversations et participants sont créés par RPC SECURITY DEFINER ; le client
-- lit ces tables et insère seulement les messages. Aucun écran ne modifie/supprime le chat.
revoke insert,update,delete on public.conversations,public.conversation_participants from authenticated;
revoke update,delete on public.messages from authenticated;
grant select on public.conversations,public.conversation_participants to authenticated;
grant select,insert on public.messages to authenticated;

-- Images publiques de services ; téléversements confinés au dossier UUID du prestataire.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('service-images','service-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists service_images_public_read on storage.objects;
create policy service_images_public_read on storage.objects for select to anon,authenticated using (bucket_id='service-images');
drop policy if exists service_images_provider_insert on storage.objects;
create policy service_images_provider_insert on storage.objects for insert to authenticated
  with check (bucket_id='service-images' and (storage.foldername(name))[1]=auth.uid()::text
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='service_provider'));
drop policy if exists service_images_provider_update on storage.objects;
create policy service_images_provider_update on storage.objects for update to authenticated
  using (bucket_id='service-images' and (((storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='service_provider')) or public.is_admin()))
  with check (bucket_id='service-images' and (((storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='service_provider')) or public.is_admin()));
drop policy if exists service_images_provider_delete on storage.objects;
create policy service_images_provider_delete on storage.objects for delete to authenticated
  using (bucket_id='service-images' and (((storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='service_provider')) or public.is_admin()));

-- La publication Realtime est facultative selon le projet Supabase, les insertions restent sûres sans elle.
do $$ begin
  alter publication supabase_realtime add table public.service_requests;
exception when duplicate_object then null; when undefined_object then null; end $$;

commit;
