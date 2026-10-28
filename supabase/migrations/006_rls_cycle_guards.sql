-- Fonctions helpers étroites : évitent une récursion RLS entre orders et deliveries.
create or replace function public.is_assigned_delivery_for_order(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(select 1 from public.deliveries d where d.order_id=p_order_id and d.courier_id=auth.uid());
$$;
revoke all on function public.is_assigned_delivery_for_order(uuid) from public;
grant execute on function public.is_assigned_delivery_for_order(uuid) to authenticated;

create or replace function public.can_read_delivery(p_delivery_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(
    select 1 from public.deliveries d
    join public.orders o on o.id=d.order_id
    join public.shops s on s.id=o.shop_id
    where d.id=p_delivery_id and (
      public.is_admin() or d.courier_id=auth.uid()
      or (d.courier_id is null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='courier'))
      or o.customer_id=auth.uid() or s.owner_id=auth.uid()
    )
  );
$$;
revoke all on function public.can_read_delivery(uuid) from public;
grant execute on function public.can_read_delivery(uuid) to authenticated;

drop policy if exists orders_client_read on public.orders;
create policy orders_client_read on public.orders for select to authenticated using (
  customer_id=auth.uid() or public.is_admin()
  or exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid())
  or public.is_assigned_delivery_for_order(public.orders.id)
);

drop policy if exists order_items_parties_read on public.order_items;
create policy order_items_parties_read on public.order_items for select to authenticated using (
  public.is_admin()
  or exists(select 1 from public.orders o where o.id=public.order_items.order_id and o.customer_id=auth.uid())
  or exists(select 1 from public.orders o join public.shops s on s.id=o.shop_id where o.id=public.order_items.order_id and s.owner_id=auth.uid())
  or exists(select 1 from public.orders o where o.id=public.order_items.order_id and public.is_assigned_delivery_for_order(o.id))
);

drop policy if exists deliveries_read_parties on public.deliveries;
create policy deliveries_read_parties on public.deliveries for select to authenticated using (public.can_read_delivery(public.deliveries.id));

drop policy if exists offers_participant_insert on public.price_offers;
create policy offers_participant_insert on public.price_offers for insert to authenticated with check (
  offered_by=auth.uid() and status='pending' and responded_by is null
  and public.is_conversation_participant(conversation_id)
  and exists(select 1 from public.conversations c where c.id=public.price_offers.conversation_id and c.product_id=public.price_offers.product_id)
);
