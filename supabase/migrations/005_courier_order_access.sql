-- Détails commande/adresse accessibles au livreur uniquement après affectation atomique.
drop policy if exists orders_client_read on public.orders;
create policy orders_client_read on public.orders for select to authenticated using (
  customer_id=auth.uid()
  or public.is_admin()
  or exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid())
  or exists(select 1 from public.deliveries d where d.order_id=id and d.courier_id=auth.uid())
);
drop policy if exists order_items_parties_read on public.order_items;
create policy order_items_parties_read on public.order_items for select to authenticated using (
  public.is_admin()
  or exists(select 1 from public.orders o where o.id=order_id and o.customer_id=auth.uid())
  or exists(select 1 from public.orders o join public.shops s on s.id=o.shop_id where o.id=order_id and s.owner_id=auth.uid())
  or exists(select 1 from public.deliveries d where d.order_id=order_id and d.courier_id=auth.uid())
);

create or replace function public.accept_delivery(p_delivery_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_id uuid; v_order uuid; v_conversation uuid;
begin
  if v_user is null or (select role from public.profiles where id=v_user) <> 'courier' then raise exception 'Compte livreur requis'; end if;
  if not exists(select 1 from public.profiles where id=v_user and is_available) then raise exception 'Activez votre disponibilité depuis les paramètres livreur avant d’accepter une course'; end if;
  update public.deliveries set courier_id=v_user,status='accepted',accepted_at=now(),updated_at=now()
   where id=p_delivery_id and courier_id is null and status='pending' returning id,order_id into v_id,v_order;
  if v_id is null then raise exception 'Cette course a déjà été prise ou n’est plus disponible'; end if;
  select id into v_conversation from public.conversations where order_id=v_order order by created_at limit 1;
  if v_conversation is not null then
    insert into public.conversation_participants(conversation_id,user_id) values(v_conversation,v_user) on conflict do nothing;
  end if;
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
  else
    update public.deliveries set status=p_status,delivered_at=case when p_status='delivered' then now() else delivered_at end,updated_at=now() where id=p_delivery_id;
    if p_status='delivered' then update public.orders set status='delivered',updated_at=now() where id=v_order; end if;
  end if;
end;
$$;
revoke all on function public.update_delivery_status(uuid,text) from public;
grant execute on function public.update_delivery_status(uuid,text) to authenticated;
