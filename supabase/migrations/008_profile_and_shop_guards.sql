-- Les privilèges de colonnes (migration 004) interdisent déjà les changements directs
-- de role/is_available ; garder le rôle verrouillé, mais laisser le RPC contrôlé changer
-- la disponibilité d’un livreur.
create or replace function public.lock_profile_privileged_fields()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

revoke update on public.profiles from anon, authenticated;
grant update(full_name,phone,city,avatar_url) on public.profiles to authenticated;

-- L’interface commerçant représente une boutique par compte ; une unicité évite
-- de contourner les limites de catalogue en créant d’autres boutiques.
create unique index if not exists shops_one_per_owner_idx on public.shops(owner_id);
