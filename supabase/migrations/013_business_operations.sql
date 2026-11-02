-- FasoFlow Business — migration additive. Aucune table/ligne existante n'est supprimée.
-- Les coûts d'achat sont stockés dans des tables privées, jamais dans products ou order_items.
-- Les commandes historiques gardent un coût d'achat NULL : leur coût reste inconnu.

create table if not exists public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete restrict,
  purchase_cost_xof bigint check (purchase_cost_xof is null or purchase_cost_xof >= 0),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (shop_id, product_id)
);
create index if not exists product_costs_shop_idx on public.product_costs(shop_id);

create table if not exists public.order_item_costs (
  order_item_id uuid primary key references public.order_items(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete restrict,
  purchase_cost_xof bigint check (purchase_cost_xof is null or purchase_cost_xof >= 0),
  created_at timestamptz not null default now()
);
create index if not exists order_item_costs_shop_idx on public.order_item_costs(shop_id, created_at desc);

create table if not exists public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  category text not null default 'Autre' check (char_length(btrim(category)) between 1 and 80),
  amount_xof bigint not null check (amount_xof > 0),
  spent_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_expenses_shop_date_idx
  on public.business_expenses(shop_id, spent_at desc);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  order_id uuid references public.orders(id) on delete set null,
  movement_type text not null check (movement_type in ('order_sale','order_return','adjustment')),
  quantity_delta integer not null check (quantity_delta <> 0),
  stock_before integer not null check (stock_before >= 0),
  stock_after integer not null check (stock_after >= 0),
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_shop_date_idx
  on public.stock_movements(shop_id, created_at desc);
create index if not exists stock_movements_order_idx
  on public.stock_movements(order_id) where order_id is not null;

alter table public.product_costs enable row level security;
alter table public.order_item_costs enable row level security;
alter table public.business_expenses enable row level security;
alter table public.stock_movements enable row level security;
revoke all on public.product_costs, public.order_item_costs, public.business_expenses, public.stock_movements from anon, authenticated;
grant select, insert, update on public.product_costs to authenticated;
grant select on public.order_item_costs to authenticated;
grant select, insert, update on public.business_expenses to authenticated;
grant select on public.stock_movements to authenticated;

create or replace function public.has_active_merchant_business_access()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.is_admin() or exists (
    select 1
      from public.subscriptions s
      join public.plans p on p.id=s.plan_id
     where s.user_id=auth.uid()
       and exists (
         select 1 from public.profiles profile
          where profile.id=auth.uid() and profile.role='merchant'
       )
       and s.status='active'
       and p.audience='merchant'
       and p.code='business'
       and s.current_period_end > now()
  );
$$;
revoke all on function public.has_active_merchant_business_access() from public, anon;
grant execute on function public.has_active_merchant_business_access() to authenticated;

-- Accès commercial vérifié dans les politiques SQL : masquer les coûts n'est pas une barrière RLS.
drop policy if exists product_costs_owner_read on public.product_costs;
create policy product_costs_owner_read on public.product_costs
  for select to authenticated using (
    public.is_admin() or (public.has_active_merchant_business_access() and exists (
      select 1 from public.shops s join public.products p on p.shop_id=s.id
      where s.id=product_costs.shop_id and p.id=product_costs.product_id and s.owner_id=auth.uid()
    ))
  );
drop policy if exists product_costs_owner_insert on public.product_costs;
create policy product_costs_owner_insert on public.product_costs
  for insert to authenticated with check (
    public.is_admin() or (updated_by=auth.uid() and public.has_active_merchant_business_access() and exists (
      select 1 from public.shops s join public.products p on p.shop_id=s.id
      where s.id=product_costs.shop_id and p.id=product_costs.product_id and s.owner_id=auth.uid()
    ))
  );
drop policy if exists product_costs_owner_update on public.product_costs;
create policy product_costs_owner_update on public.product_costs
  for update to authenticated using (
    public.is_admin() or (public.has_active_merchant_business_access() and exists (
      select 1 from public.shops s join public.products p on p.shop_id=s.id
      where s.id=product_costs.shop_id and p.id=product_costs.product_id and s.owner_id=auth.uid()
    ))
  ) with check (
    (updated_by=auth.uid() and public.has_active_merchant_business_access() and exists (
      select 1 from public.shops s join public.products p on p.shop_id=s.id
      where s.id=product_costs.shop_id and p.id=product_costs.product_id and s.owner_id=auth.uid()
    )) or public.is_admin()
  );

drop policy if exists order_item_costs_owner_read on public.order_item_costs;
create policy order_item_costs_owner_read on public.order_item_costs
  for select to authenticated using (
    public.is_admin() or (public.has_active_merchant_business_access() and exists(select 1 from public.shops s where s.id=order_item_costs.shop_id and s.owner_id=auth.uid()))
  );

drop policy if exists business_expenses_owner_read on public.business_expenses;
create policy business_expenses_owner_read on public.business_expenses
  for select to authenticated using (
    public.is_admin() or (public.has_active_merchant_business_access() and exists(select 1 from public.shops s where s.id=business_expenses.shop_id and s.owner_id=auth.uid()))
  );
drop policy if exists business_expenses_owner_insert on public.business_expenses;
create policy business_expenses_owner_insert on public.business_expenses
  for insert to authenticated with check (
    public.is_admin() or (created_by=auth.uid() and public.has_active_merchant_business_access() and exists(select 1 from public.shops s where s.id=business_expenses.shop_id and s.owner_id=auth.uid()))
  );
drop policy if exists business_expenses_owner_update on public.business_expenses;
create policy business_expenses_owner_update on public.business_expenses
  for update to authenticated using (
    public.is_admin() or (public.has_active_merchant_business_access() and exists(select 1 from public.shops s where s.id=business_expenses.shop_id and s.owner_id=auth.uid()))
  ) with check (
    (created_by=auth.uid() and public.has_active_merchant_business_access() and exists(select 1 from public.shops s where s.id=business_expenses.shop_id and s.owner_id=auth.uid())) or public.is_admin()
  );
drop policy if exists stock_movements_owner_read on public.stock_movements;
create policy stock_movements_owner_read on public.stock_movements
  for select to authenticated using (
    public.is_admin() or (public.has_active_merchant_business_access() and exists(select 1 from public.shops s where s.id=stock_movements.shop_id and s.owner_id=auth.uid()))
  );

-- Le contexte est transaction-local : une sortie/annulation de commande est reliée
-- à son order_id par le trigger, et ne fuit pas dans une transaction ultérieure.
create or replace function public.log_business_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_order_id uuid := nullif(current_setting('fasoflow.business_order_id', true), '')::uuid;
  v_owner uuid;
  v_role text;
  v_type text;
  v_before integer;
  v_delta integer;
begin
  if tg_op='INSERT' then
    v_before := 0;
    v_delta := new.stock_quantity;
  else
    v_before := old.stock_quantity;
    v_delta := new.stock_quantity-old.stock_quantity;
  end if;
  if v_delta=0 then return new; end if;
  if v_user is null then raise exception 'Connexion requise pour historiser le stock'; end if;
  select s.owner_id into v_owner from public.shops s where s.id=new.shop_id;
  select p.role into v_role from public.profiles p where p.id=v_user;
  if public.is_admin() then
    null;
  elsif v_owner is not distinct from v_user and v_role='merchant' then
    null;
  elsif v_order_id is not null and v_role='client' and exists(
    select 1 from public.orders o where o.id=v_order_id and o.shop_id=new.shop_id and o.customer_id=v_user
  ) then
    null;
  else
    raise exception 'Modification du stock non autorisée';
  end if;
  if v_order_id is not null then
    if v_delta < 0 then
      v_type := 'order_sale';
    else
      v_type := 'order_return';
    end if;
    if not exists(select 1 from public.orders o where o.id=v_order_id and o.shop_id=new.shop_id) then
      raise exception 'Commande de mouvement de stock incohérente';
    end if;
  else
    v_type := 'adjustment';
  end if;
  insert into public.stock_movements(shop_id,product_id,product_name_snapshot,order_id,movement_type,quantity_delta,stock_before,stock_after)
  values(new.shop_id,new.id,new.name,v_order_id,v_type,v_delta,v_before,new.stock_quantity);
  return new;
end;
$$;
revoke all on function public.log_business_stock_movement() from public, anon, authenticated;
drop trigger if exists products_business_stock_movement on public.products;
create trigger products_business_stock_movement
  after insert or update of stock_quantity on public.products
  for each row execute function public.log_business_stock_movement();

-- Reprend la dernière version métier de place_order, issue de 010 :
-- validation panier/adresse, rôle client, stock verrouillé, anti-doublons, conversations et notifications.
-- Le snapshot de coût est écrit dans une table privée, accessible seulement au propriétaire/admin.
create or replace function public.place_order(p_shop_id uuid,p_items jsonb,p_delivery_address jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_order uuid;
  v_order_item uuid;
  v_total bigint := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_purchase_cost bigint;
  v_qty int;
  v_count int := 0;
begin
  if v_user is null or not exists(select 1 from public.profiles where id=v_user and role='client') then
    raise exception 'Compte client requis';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Le panier doit contenir entre 1 et 30 lignes';
  end if;
  if exists (
    select 1 from (
      select item.value->>'product_id' as product_id
      from jsonb_array_elements(p_items) as item(value)
      group by item.value->>'product_id' having count(*)>1
    ) duplicate_items
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
    if v_product.stock_quantity < v_qty then raise exception 'Stock insuffisant pour %', v_product.name; end if;
    v_total := v_total + v_product.price_xof * v_qty;
  end loop;
  insert into public.orders(customer_id,shop_id,subtotal_xof,total_xof,delivery_address)
    values(v_user,p_shop_id,v_total,v_total,p_delivery_address) returning id into v_order;
  perform set_config('fasoflow.business_order_id',v_order::text,true);
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and shop_id=p_shop_id for update;
    update public.products set stock_quantity=stock_quantity-v_qty where id=v_product.id;
    insert into public.order_items(order_id,product_id,product_name_snapshot,unit_price_xof,quantity,line_total_xof)
      values(v_order,v_product.id,v_product.name,v_product.price_xof,v_qty,v_product.price_xof*v_qty)
      returning id into v_order_item;
    v_purchase_cost := null;
    select pc.purchase_cost_xof into v_purchase_cost
      from public.product_costs pc where pc.product_id=v_product.id and pc.shop_id=p_shop_id;
    insert into public.order_item_costs(order_item_id,shop_id,purchase_cost_xof)
      values(v_order_item,p_shop_id,v_purchase_cost);
  end loop;
  perform set_config('fasoflow.business_order_id','',true);
  insert into public.conversations(product_id,order_id,shop_id,title) values(null,v_order,p_shop_id,'Commande #'||left(v_order::text,8));
  insert into public.conversation_participants(conversation_id,user_id) select id,v_user from public.conversations where order_id=v_order;
  insert into public.conversation_participants(conversation_id,user_id)
    select c.id,s.owner_id from public.conversations c join public.shops s on s.id=c.shop_id where c.order_id=v_order;
  insert into public.notifications(user_id,kind,title,body,link)
    select s.owner_id,'new_order','Nouvelle commande','Une commande vient d’être passée.','/merchant/orders' from public.shops s where s.id=p_shop_id;
  return v_order;
end;
$$;
revoke all on function public.place_order(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.place_order(uuid,jsonb,jsonb) to authenticated;

-- Version 010 de l'annulation commerçant, conservant transitions, restitution de stock,
-- état de livraison et notification ; les retours sont historisés avec le même order_id.
create or replace function public.merchant_update_order_status(p_order_id uuid,p_status text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_shop_id uuid;
  v_owner uuid;
  v_old text;
  v_customer uuid;
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
      from (select product_id,sum(quantity)::integer as quantity from public.order_items where order_id=p_order_id group by product_id) items
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
