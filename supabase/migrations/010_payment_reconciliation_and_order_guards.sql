-- Le service role Vercel est le seul rôle non-authenticated autorisé à confirmer un paiement SasPay.
grant execute on function public.mark_payment_paid(uuid,jsonb) to service_role;

-- Une commande ne contient qu'une ligne par produit; la fonction place_order rejette aussi ces doublons avec un message métier.
do $$ begin
  if exists (select 1 from public.order_items group by order_id,product_id having count(*)>1) then
    raise exception 'Des lignes produit dupliquées existent dans order_items; consolidez-les avant cette migration.';
  end if;
end $$;
create unique index if not exists order_items_order_product_unique on public.order_items(order_id,product_id);

create or replace function public.merchant_update_order_status(p_order_id uuid,p_status text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_shop_id uuid; v_owner uuid; v_old text; v_customer uuid;
begin
  select shop_id,status,customer_id into v_shop_id,v_old,v_customer from public.orders where id=p_order_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  select owner_id into v_owner from public.shops where id=v_shop_id;
  if v_owner <> auth.uid() and not public.is_admin() then raise exception 'Commande inaccessible'; end if;
  if not ((v_old='pending' and p_status in ('accepted','cancelled')) or (v_old='accepted' and p_status in ('preparing','cancelled')) or (v_old='preparing' and p_status in ('ready_for_delivery','cancelled'))) then raise exception 'Transition de commande invalide'; end if;
  update public.orders set status=p_status,updated_at=now() where id=p_order_id;
  if p_status='cancelled' then
    update public.products p set stock_quantity=p.stock_quantity+items.quantity,updated_at=now()
      from (select product_id,sum(quantity)::integer as quantity from public.order_items where order_id=p_order_id group by product_id) items
      where items.product_id=p.id;
    update public.deliveries set status='cancelled',updated_at=now() where order_id=p_order_id and courier_id is null and status='pending';
    insert into public.notifications(user_id,kind,title,body,link) values(v_customer,'order_cancelled','Commande annulée','La boutique a annulé votre commande. Contactez-la si vous avez une question.','/client/orders');
  else
    insert into public.notifications(user_id,kind,title,body,link) values(v_customer,'order_status','Commande mise à jour',case when p_status='accepted' then 'La boutique a accepté votre commande.' when p_status='preparing' then 'La boutique prépare votre commande.' else 'Votre commande est prête pour un livreur.' end,'/client/orders');
  end if;
end;
$$;
revoke all on function public.merchant_update_order_status(uuid,text) from public;
grant execute on function public.merchant_update_order_status(uuid,text) to authenticated;

create or replace function public.place_order(p_shop_id uuid,p_items jsonb,p_delivery_address jsonb)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_order uuid; v_total bigint := 0; v_item jsonb; v_product public.products%rowtype; v_qty int; v_count int := 0;
begin
  if v_user is null or (select role from public.profiles where id=v_user) <> 'client' then raise exception 'Compte client requis'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Le panier doit contenir entre 1 et 30 lignes'; end if;
  if exists (
    select 1 from (
      select item.value->>'product_id' as product_id
      from jsonb_array_elements(p_items) as item(value)
      group by item.value->>'product_id' having count(*)>1
    ) duplicate_items
  ) then raise exception 'Un même produit apparaît plusieurs fois dans le panier'; end if;
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
  insert into public.conversations(product_id,order_id,shop_id,title) values(null,v_order,p_shop_id,'Commande #'||left(v_order::text,8));
  insert into public.conversation_participants(conversation_id,user_id) select id,v_user from public.conversations where order_id=v_order;
  insert into public.conversation_participants(conversation_id,user_id) select c.id,s.owner_id from public.conversations c join public.shops s on s.id=c.shop_id where c.order_id=v_order;
  insert into public.notifications(user_id,kind,title,body,link) select s.owner_id,'new_order','Nouvelle commande','Une commande vient d’être passée.','/merchant/orders' from public.shops s where s.id=p_shop_id;
  return v_order;
end;
$$;
revoke all on function public.place_order(uuid,jsonb,jsonb) from public;
grant execute on function public.place_order(uuid,jsonb,jsonb) to authenticated;

-- Permet à un administrateur de résoudre un checkout dont SasPay n'a pas renvoyé un identifiant de session.
-- L'administrateur doit vérifier l'opération dans le tableau SasPay et fournir une référence/note; aucune décision navigateur n'active directement un abonnement.
create or replace function public.admin_reconcile_saspay_payment(p_payment_id uuid,p_paid boolean,p_reference text,p_note text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_payment public.payments%rowtype; v_plan public.plans%rowtype; v_role text; v_now timestamptz := now();
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  if p_paid is null then raise exception 'Décision obligatoire'; end if;
  if length(coalesce(btrim(p_note),'')) not between 8 and 1000 then raise exception 'Une note de vérification (8 à 1000 caractères) est requise'; end if;
  if p_paid and length(coalesce(btrim(p_reference),'')) not between 3 and 160 then raise exception 'Une référence de transaction SasPay confirmée est requise'; end if;
  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found or v_payment.provider <> 'saspay' or v_payment.status not in ('pending','creating') or v_payment.checkout_url is not null then raise exception 'Ce paiement SasPay ne nécessite plus de réconciliation'; end if;
  if p_paid then
    select * into v_plan from public.plans where id=v_payment.plan_id;
    if not found then raise exception 'Offre de paiement introuvable'; end if;
    select role into v_role from public.profiles where id=v_payment.user_id;
    if not found then raise exception 'Profil de paiement introuvable'; end if;
    if v_plan.price_xof is distinct from v_payment.amount_xof or v_plan.audience is distinct from v_role then raise exception 'Incohérence du plan, du rôle ou du montant'; end if;
  end if;
  update public.payments set status=case when p_paid then 'paid' else 'failed' end,
    provider_reference=case when p_paid then left(p_reference,160) else provider_reference end,
    reviewed_by=auth.uid(),reviewed_at=v_now,review_note=left(p_note,1000),
    provider_data=coalesce(provider_data,'{}'::jsonb)||jsonb_build_object('admin_reconciliation',jsonb_build_object('outcome',case when p_paid then 'confirmed_paid' else 'no_payment_found' end,'reference',case when p_paid then left(p_reference,160) else null end,'note',left(p_note,1000),'reviewed_by',auth.uid(),'reviewed_at',v_now)),
    updated_at=v_now where id=p_payment_id;
  if p_paid then
    update public.subscriptions set status='cancelled',updated_at=v_now where user_id=v_payment.user_id and status='active';
    insert into public.subscriptions(user_id,plan_id,status,started_at,current_period_end) values(v_payment.user_id,v_payment.plan_id,'active',v_now,v_now+interval '1 month');
    insert into public.notifications(user_id,kind,title,body,link) values(v_payment.user_id,'subscription_paid','Paiement SasPay confirmé','Un administrateur a confirmé votre paiement SasPay après vérification de la transaction.','/merchant/subscription');
  end if;
end;
$$;
revoke all on function public.admin_reconcile_saspay_payment(uuid,boolean,text,text) from public;
grant execute on function public.admin_reconcile_saspay_payment(uuid,boolean,text,text) to authenticated;
