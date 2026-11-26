-- FasoFlow 017 — limiter aux sessions authentifiées les RPC internes.
-- Revue distante en lecture seule le 2026-11-24 : ces signatures accordaient
-- EXECUTE explicitement à anon, alors que leurs corps exigent auth.uid(), un
-- rôle, une appartenance ou is_admin(). Les droits authenticated sont conservés.
-- Les helpers is_admin() et les fonctions trigger ne sont volontairement pas
-- modifiés : certains sont requis par les policies publiques ou les triggers.
-- À appliquer seulement après réconciliation de l'historique et autorisation.
begin;

revoke execute on function public.accept_delivery(uuid) from anon;
revoke execute on function public.admin_reconcile_saspay_payment(uuid, boolean, text, text) from anon;
revoke execute on function public.admin_review_manual_payment(uuid, boolean, text) from anon;
revoke execute on function public.admin_review_report(uuid, text, text) from anon;
revoke execute on function public.admin_set_manual_payment_instructions(jsonb) from anon;
revoke execute on function public.admin_set_product_status(uuid, text) from anon;
revoke execute on function public.admin_set_profile_role(uuid, text) from anon;
revoke execute on function public.admin_set_service_provider_status(uuid, text) from anon;
revoke execute on function public.admin_set_service_review_status(uuid, text) from anon;
revoke execute on function public.admin_set_service_status(uuid, text) from anon;
revoke execute on function public.admin_set_shop_status(uuid, text) from anon;
revoke execute on function public.can_read_delivery(uuid) from anon;
revoke execute on function public.create_manual_payment(text, text) from anon;
revoke execute on function public.get_manual_payment_instructions() from anon;
revoke execute on function public.get_or_create_conversation(uuid, uuid, uuid) from anon;
revoke execute on function public.is_assigned_delivery_for_order(uuid) from anon;
revoke execute on function public.is_conversation_participant(uuid) from anon;
revoke execute on function public.is_service_provider(uuid) from anon;
revoke execute on function public.respond_to_price_offer(uuid, boolean) from anon;
revoke execute on function public.select_free_plan(text) from anon;
revoke execute on function public.set_courier_availability(boolean, text) from anon;
revoke execute on function public.set_courier_delivery_preference(text) from anon;
revoke execute on function public.update_delivery_status(uuid, text) from anon;

-- Garde-fous de migration : échec explicite plutôt que droits partiellement resserrés.
do $check$
declare
  fn text;
  signatures text[] := array[
    'public.accept_delivery(uuid)',
    'public.admin_reconcile_saspay_payment(uuid,boolean,text,text)',
    'public.admin_review_manual_payment(uuid,boolean,text)',
    'public.admin_review_report(uuid,text,text)',
    'public.admin_set_manual_payment_instructions(jsonb)',
    'public.admin_set_product_status(uuid,text)',
    'public.admin_set_profile_role(uuid,text)',
    'public.admin_set_service_provider_status(uuid,text)',
    'public.admin_set_service_review_status(uuid,text)',
    'public.admin_set_service_status(uuid,text)',
    'public.admin_set_shop_status(uuid,text)',
    'public.can_read_delivery(uuid)',
    'public.create_manual_payment(text,text)',
    'public.get_manual_payment_instructions()',
    'public.get_or_create_conversation(uuid,uuid,uuid)',
    'public.is_assigned_delivery_for_order(uuid)',
    'public.is_conversation_participant(uuid)',
    'public.is_service_provider(uuid)',
    'public.respond_to_price_offer(uuid,boolean)',
    'public.select_free_plan(text)',
    'public.set_courier_availability(boolean,text)',
    'public.set_courier_delivery_preference(text)',
    'public.update_delivery_status(uuid,text)'
  ];
begin
  foreach fn in array signatures loop
    if has_function_privilege('anon', fn, 'EXECUTE') then
      raise exception 'anon conserve EXECUTE sur %', fn;
    end if;
    if not has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception 'authenticated a perdu EXECUTE sur %', fn;
    end if;
  end loop;
end;
$check$;

commit;
