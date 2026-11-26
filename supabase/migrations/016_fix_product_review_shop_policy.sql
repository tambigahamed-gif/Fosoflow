-- FasoFlow 016 — lier chaque avis à la boutique de la commande livrée.
-- Correctif additif de policy : aucune donnée ni table n'est modifiée/supprimée.
-- À appliquer uniquement après vérification de l'historique et autorisation explicite.
begin;

drop policy if exists reviews_customer_insert on public.reviews;
create policy reviews_customer_insert on public.reviews
  for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and exists (
      select 1
      from public.orders o
      where o.id = reviews.order_id
        and o.customer_id = (select auth.uid())
        and o.status = 'delivered'
        and o.shop_id = reviews.shop_id
    )
  );

commit;
