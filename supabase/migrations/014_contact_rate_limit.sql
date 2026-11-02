-- Protection additive du formulaire contact. Ne modifie ni ne supprime aucun message existant.
-- L'écriture de contact_messages passe désormais exclusivement par l'API serveur.
drop policy if exists contact_public_insert on public.contact_messages;
revoke insert on public.contact_messages from public, anon, authenticated;

create table if not exists public.contact_rate_limits (
  subject_hash text primary key check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0)
);

create index if not exists contact_rate_limits_window_started_at_idx
  on public.contact_rate_limits (window_started_at);

alter table public.contact_rate_limits enable row level security;
revoke all on public.contact_rate_limits from public, anon, authenticated, service_role;

create or replace function public.consume_contact_rate_limit(
  p_ip_hash text,
  p_email_hash text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_subject_hash text;
  v_attempt_count integer;
  v_allowed boolean := true;
  v_now timestamptz := clock_timestamp();
  v_cutoff timestamptz;
begin
  if p_ip_hash is null or p_email_hash is null
     or p_ip_hash !~ '^[0-9a-f]{64}$'
     or p_email_hash !~ '^[0-9a-f]{64}$'
     or p_max_attempts < 1 or p_max_attempts > 20
     or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'invalid contact rate-limit parameters';
  end if;

  v_cutoff := v_now - make_interval(secs => p_window_seconds);

  -- Les deux lignes sont prises dans le même ordre pour limiter le risque d'interblocage.
  -- Le compteur persiste uniquement les HMAC; aucune IP ni adresse e-mail n'y est stockée.
  for v_subject_hash in
    select distinct inputs.subject_hash
    from unnest(array[p_ip_hash, p_email_hash]) as inputs(subject_hash)
    order by inputs.subject_hash
  loop
    insert into public.contact_rate_limits as current_limit
      (subject_hash, window_started_at, attempt_count)
    values (v_subject_hash, v_now, 1)
    on conflict (subject_hash) do update
      set window_started_at = case
            when current_limit.window_started_at <= v_cutoff then v_now
            else current_limit.window_started_at
          end,
          attempt_count = case
            when current_limit.window_started_at <= v_cutoff then 1
            else current_limit.attempt_count + 1
          end
    returning attempt_count into v_attempt_count;

    if v_attempt_count > p_max_attempts then
      v_allowed := false;
    end if;
  end loop;

  return v_allowed;
end;
$function$;

revoke all on function public.consume_contact_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_contact_rate_limit(text, text, integer, integer)
  to service_role;
