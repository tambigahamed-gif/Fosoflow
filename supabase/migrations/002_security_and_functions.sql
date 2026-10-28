-- FasoFlow — RLS strict, fonctions transactionnelles, politiques Storage.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare requested text;
begin
  requested := coalesce(new.raw_user_meta_data->>'role', 'client');
  if requested not in ('client','merchant','courier') then requested := 'client'; end if;
  insert into public.profiles(id, role, full_name, phone)
  values (new.id, requested, coalesce(nullif(left(new.raw_user_meta_data->>'full_name',120),''),''), nullif(left(new.raw_user_meta_data->>'phone',32),''))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.lock_profile_privileged_fields()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.is_available := old.is_available;
  end if;
  return new;
end;
$$;
drop trigger if exists profile_privileged_fields_guard on public.profiles;
create trigger profile_privileged_fields_guard before update on public.profiles for each row execute function public.lock_profile_privileged_fields();

create or replace function public.handle_new_order_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.deliveries(order_id, status, pickup_zone, dropoff_zone)
  values (new.id, 'pending', coalesce((select city from public.shops where id = new.shop_id),''), coalesce(new.delivery_address->>'city',''))
  on conflict (order_id) do nothing;
  return new;
end;
$$;
drop trigger if exists order_creates_delivery on public.orders;
create trigger order_creates_delivery after insert on public.orders for each row execute function public.handle_new_order_delivery();

create or replace function public.place_order(p_shop_id uuid, p_items jsonb, p_delivery_address jsonb)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_order uuid; v_total bigint := 0; v_item jsonb; v_product public.products%rowtype; v_qty int; v_count int := 0;
begin
  if v_user is null or (select role from public.profiles where id=v_user) <> 'client' then raise exception 'Compte client requis'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Le panier doit contenir entre 1 et 30 lignes'; end if;
  if not exists(select 1 from public.shops where id=p_shop_id and status='active') then raise exception 'Boutique indisponible'; end if;
  if jsonb_typeof(p_delivery_address) <> 'object' or coalesce(length(p_delivery_address->>'city'),0) < 2 or coalesce(length(p_delivery_address->>'address'),0) < 3 or coalesce(length(p_delivery_address->>'phone'),0) < 6 then raise exception 'Adresse et téléphone requis'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_count := v_count + 1;
    if v_count > 30 then raise exception 'Trop de lignes dans la commande'; end if;
    v_qty := (v_item->>'quantity')::int;
    if v_qty < 1 or v_qty > 100 then raise exception 'Quantité invalide'; end if;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and shop_id=p_shop_id and status='active' for update;
    if not found then raise exception 'Produit indisponible'; end if;
    if v_product.stock_quantity < v_qty then raise exception 'Stock insuffisant pour %', v_product.name; end if;
    v_total := v_total + v_product.price_xof * v_qty;
  end loop;
  insert into public.orders(customer_id,shop_id,subtotal_xof,total_xof,delivery_address)
  values(v_user,p_shop_id,v_total,v_total,p_delivery_address) returning id into v_order;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and shop_id=p_shop_id for update;
    update public.products set stock_quantity=stock_quantity-v_qty where id=v_product.id;
    insert into public.order_items(order_id,product_id,product_name_snapshot,unit_price_xof,quantity,line_total_xof)
    values(v_order,v_product.id,v_product.name,v_product.price_xof,v_qty,v_product.price_xof*v_qty);
  end loop;
  insert into public.conversations(product_id,order_id,shop_id,title)
    values(null,v_order,p_shop_id,'Commande #'||left(v_order::text,8));
  insert into public.conversation_participants(conversation_id,user_id)
    select id,v_user from public.conversations where order_id=v_order;
  insert into public.conversation_participants(conversation_id,user_id)
    select c.id,s.owner_id from public.conversations c join public.shops s on s.id=c.shop_id where c.order_id=v_order;
  insert into public.notifications(user_id,kind,title,body,link)
    select s.owner_id,'new_order','Nouvelle commande','Une commande vient d’être passée.', '/merchant/orders' from public.shops s where s.id=p_shop_id;
  return v_order;
end;
$$;
revoke all on function public.place_order(uuid,jsonb,jsonb) from public;
grant execute on function public.place_order(uuid,jsonb,jsonb) to authenticated;

create or replace function public.accept_delivery(p_delivery_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null or (select role from public.profiles where id=v_user) <> 'courier' then raise exception 'Compte livreur requis'; end if;
  update public.deliveries set courier_id=v_user,status='accepted',accepted_at=now(),updated_at=now()
   where id=p_delivery_id and courier_id is null and status='pending' returning id into v_id;
  if v_id is null then raise exception 'Cette course a déjà été prise ou n’est plus disponible'; end if;
  return v_id;
end;
$$;
revoke all on function public.accept_delivery(uuid) from public;
grant execute on function public.accept_delivery(uuid) to authenticated;

create or replace function public.update_delivery_status(p_delivery_id uuid,p_status text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_current text;
begin
  if p_status not in ('in_progress','delivered','cancelled') then raise exception 'Transition non autorisée'; end if;
  select status into v_current from public.deliveries where id=p_delivery_id and courier_id=v_user for update;
  if not found then raise exception 'Course inaccessible'; end if;
  if not ((v_current='accepted' and p_status in ('in_progress','cancelled')) or (v_current='in_progress' and p_status='delivered')) then raise exception 'Transition de statut invalide'; end if;
  update public.deliveries set status=p_status,delivered_at=case when p_status='delivered' then now() else delivered_at end,updated_at=now() where id=p_delivery_id;
  if p_status='delivered' then update public.orders set status='delivered' where id=(select order_id from public.deliveries where id=p_delivery_id); end if;
  if p_status='cancelled' then update public.deliveries set courier_id=null,accepted_at=null,status='pending' where id=p_delivery_id; end if;
end;
$$;
revoke all on function public.update_delivery_status(uuid,text) from public;
grant execute on function public.update_delivery_status(uuid,text) to authenticated;

create or replace function public.get_or_create_conversation(p_shop_id uuid,p_product_id uuid default null,p_order_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_owner uuid; v_id uuid;
begin
  if v_user is null or (select role from public.profiles where id=v_user) <> 'client' then raise exception 'Compte client requis'; end if;
  select owner_id into v_owner from public.shops where id=p_shop_id and status='active';
  if not found then raise exception 'Boutique non disponible'; end if;
  if p_order_id is not null and not exists(select 1 from public.orders where id=p_order_id and customer_id=v_user and shop_id=p_shop_id) then raise exception 'Commande inaccessible'; end if;
  if p_product_id is not null and not exists(select 1 from public.products where id=p_product_id and shop_id=p_shop_id and status='active') then raise exception 'Produit inaccessible'; end if;
  select c.id into v_id from public.conversations c join public.conversation_participants cp1 on cp1.conversation_id=c.id and cp1.user_id=v_user join public.conversation_participants cp2 on cp2.conversation_id=c.id and cp2.user_id=v_owner where c.shop_id=p_shop_id and c.product_id is not distinct from p_product_id and c.order_id is not distinct from p_order_id limit 1;
  if v_id is null then
    insert into public.conversations(shop_id,product_id,order_id,title) values(p_shop_id,p_product_id,p_order_id,coalesce((select name from public.products where id=p_product_id),'Conversation boutique')) returning id into v_id;
    insert into public.conversation_participants(conversation_id,user_id) values(v_id,v_user),(v_id,v_owner);
  end if;
  return v_id;
end;
$$;
revoke all on function public.get_or_create_conversation(uuid,uuid,uuid) from public;
grant execute on function public.get_or_create_conversation(uuid,uuid,uuid) to authenticated;

create or replace function public.respond_to_price_offer(p_offer_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_offer public.price_offers%rowtype; v_product_shop uuid; v_conversation_shop uuid; v_owner uuid;
begin
  select * into v_offer from public.price_offers where id=p_offer_id for update;
  if not found or v_offer.status <> 'pending' then raise exception 'Proposition déjà traitée ou introuvable'; end if;
  select c.shop_id into v_conversation_shop from public.conversations c join public.conversation_participants cp on cp.conversation_id=c.id and cp.user_id=v_user where c.id=v_offer.conversation_id;
  if not found then raise exception 'Conversation inaccessible'; end if;
  select owner_id into v_owner from public.shops where id=v_conversation_shop;
  if v_user = v_offer.offered_by then raise exception 'Impossible de répondre à sa propre offre'; end if;
  if v_user <> v_owner and not public.is_admin() then raise exception 'Seul le commerçant peut répondre à cette offre'; end if;
  update public.price_offers set status=case when p_accept then 'accepted' else 'rejected' end,responded_by=v_user,responded_at=now() where id=p_offer_id;
  if p_accept then update public.products set price_xof=v_offer.amount_xof where id=v_offer.product_id and shop_id=v_conversation_shop; end if;
end;
$$;
revoke all on function public.respond_to_price_offer(uuid,boolean) from public;
grant execute on function public.respond_to_price_offer(uuid,boolean) to authenticated;

create or replace function public.select_free_plan(p_plan_code text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_role text; v_plan public.plans%rowtype; v_sub uuid;
begin
  select role into v_role from public.profiles where id=v_user;
  if v_role not in ('merchant','courier') then raise exception 'Abonnement non disponible pour ce compte'; end if;
  select * into v_plan from public.plans where audience=v_role and code=p_plan_code and price_xof=0 and is_active;
  if not found then raise exception 'Offre gratuite invalide'; end if;
  update public.subscriptions set status='cancelled',updated_at=now() where user_id=v_user and status='active';
  insert into public.subscriptions(user_id,plan_id,status,current_period_end) values(v_user,v_plan.id,'active',null) returning id into v_sub;
  return v_sub;
end;
$$;
revoke all on function public.select_free_plan(text) from public;
grant execute on function public.select_free_plan(text) to authenticated;

create or replace function public.mark_payment_paid(p_payment_id uuid,p_provider_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_payment public.payments%rowtype; v_plan public.plans%rowtype;
begin
  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found or v_payment.status='paid' then return; end if;
  if v_payment.status not in ('pending','creating') or v_payment.provider <> 'saspay' then raise exception 'Paiement non éligible'; end if;
  select * into v_plan from public.plans where id=v_payment.plan_id and is_active;
  if not found or v_plan.price_xof <> v_payment.amount_xof then raise exception 'Incohérence du plan ou du montant'; end if;
  update public.payments set status='paid',provider_data=coalesce(p_provider_data,'{}'::jsonb),updated_at=now() where id=p_payment_id;
  update public.subscriptions set status='cancelled',updated_at=now() where user_id=v_payment.user_id and status='active';
  insert into public.subscriptions(user_id,plan_id,status,started_at,current_period_end)
  values(v_payment.user_id,v_payment.plan_id,'active',now(),now()+interval '1 month');
  insert into public.notifications(user_id,kind,title,body,link) values(v_payment.user_id,'subscription_paid','Abonnement activé','Votre paiement a été confirmé par SasPay.','/merchant/subscription');
end;
$$;
revoke all on function public.mark_payment_paid(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.mark_payment_paid(uuid,jsonb) to service_role;

create or replace function public.admin_review_manual_payment(p_payment_id uuid,p_approve boolean,p_note text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_payment public.payments%rowtype; v_plan public.plans%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found or v_payment.provider <> 'manual' or v_payment.status <> 'pending' then raise exception 'Paiement manuel non éligible'; end if;
  update public.payments set status=case when p_approve then 'paid' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(p_note,1000),updated_at=now() where id=p_payment_id;
  if p_approve then
    select * into v_plan from public.plans where id=v_payment.plan_id and is_active;
    if not found or v_plan.price_xof <> v_payment.amount_xof then raise exception 'Incohérence du plan ou du montant'; end if;
    update public.subscriptions set status='cancelled',updated_at=now() where user_id=v_payment.user_id and status='active';
    insert into public.subscriptions(user_id,plan_id,status,current_period_end) values(v_payment.user_id,v_payment.plan_id,'active',now()+interval '1 month');
  end if;
end;
$$;
revoke all on function public.admin_review_manual_payment(uuid,boolean,text) from public;
grant execute on function public.admin_review_manual_payment(uuid,boolean,text) to authenticated;

-- Création/écriture des tables limitées au propriétaire fonctionnel.
alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.favorites enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.price_offers enable row level security;
alter table public.deliveries enable row level security;
alter table public.reviews enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.contact_messages enable row level security;
alter table public.platform_settings enable row level security;

create policy profiles_select_self_admin on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
create policy profiles_update_self on public.profiles for update to authenticated using (id=auth.uid() or public.is_admin()) with check (id=auth.uid() or public.is_admin());
create policy profiles_admin_all on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy shops_public_read on public.shops for select to anon,authenticated using (status='active' or owner_id=auth.uid() or public.is_admin());
create policy shops_owner_insert on public.shops for insert to authenticated with check (owner_id=auth.uid() and (select role from public.profiles where id=auth.uid())='merchant');
create policy shops_owner_update on public.shops for update to authenticated using (owner_id=auth.uid() or public.is_admin()) with check (owner_id=auth.uid() or public.is_admin());
create policy shops_admin_delete on public.shops for delete to authenticated using (public.is_admin());
create policy categories_public_read on public.categories for select to anon,authenticated using (is_active or public.is_admin());
create policy categories_admin_write on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy products_public_read on public.products for select to anon,authenticated using ((status='active' and exists(select 1 from public.shops s where s.id=shop_id and s.status='active')) or exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()) or public.is_admin());
create policy products_owner_insert on public.products for insert to authenticated with check (exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()) and (select role from public.profiles where id=auth.uid())='merchant' and status='pending_review');
create policy products_owner_update on public.products for update to authenticated using (exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()) or public.is_admin()) with check ((exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()) and status in ('pending_review','archived')) or public.is_admin());
create policy products_admin_delete on public.products for delete to authenticated using (public.is_admin());
create policy favorites_self on public.favorites for all to authenticated using (user_id=auth.uid() or public.is_admin()) with check (user_id=auth.uid() or public.is_admin());
create policy orders_client_read on public.orders for select to authenticated using (customer_id=auth.uid() or public.is_admin() or exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()));
create policy orders_no_client_insert on public.orders for insert to authenticated with check (false);
create policy orders_merchant_update on public.orders for update to authenticated using (public.is_admin() or exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid())) with check (public.is_admin() or exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()));
create policy orders_admin_delete on public.orders for delete to authenticated using (public.is_admin());
create policy order_items_parties_read on public.order_items for select to authenticated using (public.is_admin() or exists(select 1 from public.orders o where o.id=order_id and o.customer_id=auth.uid()) or exists(select 1 from public.orders o join public.shops s on s.id=o.shop_id where o.id=order_id and s.owner_id=auth.uid()));
create policy conversations_participant_read on public.conversations for select to authenticated using (public.is_admin() or exists(select 1 from public.conversation_participants p where p.conversation_id=id and p.user_id=auth.uid()));
create policy conversations_participant_update on public.conversations for update to authenticated using (public.is_admin() or exists(select 1 from public.conversation_participants p where p.conversation_id=id and p.user_id=auth.uid())) with check (public.is_admin() or exists(select 1 from public.conversation_participants p where p.conversation_id=id and p.user_id=auth.uid()));
create policy participants_read on public.conversation_participants for select to authenticated using (user_id=auth.uid() or public.is_admin() or exists(select 1 from public.conversation_participants p where p.conversation_id=conversation_id and p.user_id=auth.uid()));
create policy messages_participant_read on public.messages for select to authenticated using (public.is_admin() or exists(select 1 from public.conversation_participants p where p.conversation_id=conversation_id and p.user_id=auth.uid()));
create policy messages_participant_insert on public.messages for insert to authenticated with check (sender_id=auth.uid() and exists(select 1 from public.conversation_participants p where p.conversation_id=conversation_id and p.user_id=auth.uid()));
create policy offers_participant_read on public.price_offers for select to authenticated using (public.is_admin() or exists(select 1 from public.conversation_participants p where p.conversation_id=conversation_id and p.user_id=auth.uid()));
create policy offers_participant_insert on public.price_offers for insert to authenticated with check (offered_by=auth.uid() and status='pending' and responded_by is null and exists(select 1 from public.conversation_participants p where p.conversation_id=conversation_id and p.user_id=auth.uid()) and exists(select 1 from public.conversations c where c.id=conversation_id and c.product_id=product_id));
create policy deliveries_read_parties on public.deliveries for select to authenticated using (public.is_admin() or courier_id=auth.uid() or (courier_id is null and (select role from public.profiles where id=auth.uid())='courier') or exists(select 1 from public.orders o where o.id=order_id and o.customer_id=auth.uid()) or exists(select 1 from public.orders o join public.shops s on s.id=o.shop_id where o.id=order_id and s.owner_id=auth.uid()));
create policy deliveries_no_direct_write on public.deliveries for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy reviews_public_read on public.reviews for select to anon,authenticated using (status='published' or public.is_admin());
create policy reviews_customer_insert on public.reviews for insert to authenticated with check (customer_id=auth.uid() and exists(select 1 from public.orders o where o.id=order_id and o.customer_id=auth.uid() and o.status='delivered' and o.shop_id=shop_id));
create policy reviews_admin_write on public.reviews for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy plans_public_read on public.plans for select to anon,authenticated using (is_active or public.is_admin());
create policy plans_admin_write on public.plans for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy subscriptions_self_read on public.subscriptions for select to authenticated using (user_id=auth.uid() or public.is_admin());
create policy subscriptions_admin_write on public.subscriptions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy payments_self_read on public.payments for select to authenticated using (user_id=auth.uid() or public.is_admin());
create policy payments_no_direct_write on public.payments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy payment_events_admin_read on public.payment_events for select to authenticated using (public.is_admin());
create policy notifications_self_read on public.notifications for select to authenticated using (user_id=auth.uid() or public.is_admin());
create policy notifications_self_update on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy reports_self_insert on public.reports for insert to authenticated with check (reporter_id=auth.uid() and status='open');
create policy reports_parties_admin_read on public.reports for select to authenticated using (reporter_id=auth.uid() or public.is_admin());
create policy reports_admin_update on public.reports for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy contact_public_insert on public.contact_messages for insert to anon,authenticated with check (true);
create policy contact_admin_read on public.contact_messages for select to authenticated using (public.is_admin());
create policy settings_admin_only on public.platform_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Seuls les admins autorisés utilisent le schéma privé via leurs credentials serveur.
revoke all on public.payment_events from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.categories, public.plans, public.products, public.shops, public.reviews to anon;
grant insert on public.contact_messages to anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists product_images_public_read on storage.objects;
drop policy if exists product_images_owner_insert on storage.objects;
drop policy if exists product_images_owner_update on storage.objects;
drop policy if exists product_images_owner_delete on storage.objects;
do $$ begin
  if exists(select 1 from storage.buckets where id='product-images' and public) then
    execute 'create policy product_images_public_read on storage.objects for select using (bucket_id = ''product-images'')';
  end if;
end $$;
create policy product_images_owner_insert on storage.objects for insert to authenticated with check (bucket_id='product-images' and (storage.foldername(name))[1]=auth.uid()::text and (select role from public.profiles where id=auth.uid())='merchant');
create policy product_images_owner_update on storage.objects for update to authenticated using (bucket_id='product-images' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='product-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy product_images_owner_delete on storage.objects for delete to authenticated using (bucket_id='product-images' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

-- Tables Realtime pour les conversations et notifications; rejouer si publication existe déjà.
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.price_offers;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;
