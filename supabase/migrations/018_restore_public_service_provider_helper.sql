-- FasoFlow 018 — conserver le helper de rôle utilisé par les policies RLS publiques.
-- is_service_provider ne renvoie qu'un booléen, et les policies filtrent les profils/prestations publiés.
-- Les 22 autres RPC internes de 017 restent inaccessibles à anon.
begin;

grant execute on function public.is_service_provider(uuid) to anon;

do $check$
begin
  if not has_function_privilege('anon', 'public.is_service_provider(uuid)', 'EXECUTE') then
    raise exception 'anon ne peut pas appeler is_service_provider';
  end if;
  if not has_function_privilege('authenticated', 'public.is_service_provider(uuid)', 'EXECUTE') then
    raise exception 'authenticated ne peut pas appeler is_service_provider';
  end if;
end
$check$;

commit;
