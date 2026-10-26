-- Le vendeur prépare la commande ; seul le livreur accepté peut la faire passer en livraison.
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
    update public.products p set stock_quantity=p.stock_quantity+oi.quantity,updated_at=now()
      from (select product_id,sum(quantity)::integer as quantity from public.order_items where order_id=p_order_id group by product_id) oi
      where oi.product_id=p.id;
    update public.deliveries set status='cancelled',updated_at=now() where order_id=p_order_id and courier_id is null and status='pending';
    insert into public.notifications(user_id,kind,title,body,link) values(v_customer,'order_cancelled','Commande annulée','La boutique a annulé votre commande. Contactez-la si vous avez une question.','/client/orders');
  else
    insert into public.notifications(user_id,kind,title,body,link) values(v_customer,'order_status','Commande mise à jour',case when p_status='accepted' then 'La boutique a accepté votre commande.' when p_status='preparing' then 'La boutique prépare votre commande.' else 'Votre commande est prête pour un livreur.' end,'/client/orders');
  end if;
end;
$$;
revoke all on function public.merchant_update_order_status(uuid,text) from public;
grant execute on function public.merchant_update_order_status(uuid,text) to authenticated;

create or replace function public.accept_delivery(p_delivery_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_id uuid; v_order uuid; v_order_status text; v_conversation uuid;
begin
  if v_user is null or (select role from public.profiles where id=v_user) <> 'courier' then raise exception 'Compte livreur requis'; end if;
  if not exists(select 1 from public.profiles where id=v_user and is_available) then raise exception 'Activez votre disponibilité depuis les paramètres livreur avant d’accepter une course'; end if;
  select d.order_id,o.status into v_order,v_order_status from public.deliveries d join public.orders o on o.id=d.order_id where d.id=p_delivery_id for update of d,o;
  if not found or v_order_status <> 'ready_for_delivery' then raise exception 'Cette commande n’est pas encore prête pour livraison'; end if;
  update public.deliveries set courier_id=v_user,status='accepted',accepted_at=now(),updated_at=now()
    where id=p_delivery_id and courier_id is null and status='pending' returning id into v_id;
  if v_id is null then raise exception 'Cette course a déjà été prise ou n’est plus disponible'; end if;
  update public.orders set status='in_delivery',updated_at=now() where id=v_order;
  select id into v_conversation from public.conversations where order_id=v_order order by created_at limit 1;
  if v_conversation is not null then insert into public.conversation_participants(conversation_id,user_id) values(v_conversation,v_user) on conflict do nothing; end if;
  return v_id;
end;
$$;
revoke all on function public.accept_delivery(uuid) from public;
grant execute on function public.accept_delivery(uuid) to authenticated;

create or replace function public.update_delivery_status(p_delivery_id uuid,p_status text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_current text; v_order uuid; v_conversation uuid;
begin
  if p_status not in ('in_progress','delivered','cancelled') then raise exception 'Transition non autorisée'; end if;
  select status,order_id into v_current,v_order from public.deliveries where id=p_delivery_id and courier_id=v_user for update;
  if not found then raise exception 'Course inaccessible'; end if;
  if not ((v_current='accepted' and p_status in ('in_progress','cancelled')) or (v_current='in_progress' and p_status='delivered')) then raise exception 'Transition de statut invalide'; end if;
  if p_status='cancelled' then
    select id into v_conversation from public.conversations where order_id=v_order limit 1;
    if v_conversation is not null then delete from public.conversation_participants where conversation_id=v_conversation and user_id=v_user; end if;
    update public.deliveries set status='pending',courier_id=null,accepted_at=null,updated_at=now() where id=p_delivery_id;
    update public.orders set status='ready_for_delivery',updated_at=now() where id=v_order;
  else
    update public.deliveries set status=p_status,delivered_at=case when p_status='delivered' then now() else delivered_at end,updated_at=now() where id=p_delivery_id;
    if p_status='delivered' then
      update public.orders set status='delivered',updated_at=now() where id=v_order;
      insert into public.notifications(user_id,kind,title,body,link) select customer_id,'delivery_delivered','Commande livrée','Votre commande a été marquée comme livrée.','/client/orders' from public.orders where id=v_order;
    end if;
  end if;
end;
$$;
revoke all on function public.update_delivery_status(uuid,text) from public;
grant execute on function public.update_delivery_status(uuid,text) to authenticated;

-- Les courses visibles comme disponibles sont déjà prêtes ; aucun renseignement d’adresse n’est exposé.
create or replace function public.can_read_delivery(p_delivery_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(
    select 1 from public.deliveries d join public.orders o on o.id=d.order_id join public.shops s on s.id=o.shop_id
    where d.id=p_delivery_id and (
      public.is_admin() or d.courier_id=auth.uid() or o.customer_id=auth.uid() or s.owner_id=auth.uid()
      or (d.courier_id is null and d.status='pending' and o.status='ready_for_delivery' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='courier'))
    )
  );
$$;
revoke all on function public.can_read_delivery(uuid) from public;
grant execute on function public.can_read_delivery(uuid) to authenticated;
