-- FasoFlow — réservation atomique des checkouts et activation/réconciliation sérialisées.
-- Aucun DROP de table ni suppression de ligne lors de l’application.

-- Seul le serveur Vercel peut réserver un checkout SasPay.
create or replace function public.reserve_saspay_payment(
  p_user_id uuid,
  p_plan_id uuid,
  p_expected_amount_xof bigint,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_role text;
  v_plan public.plans%rowtype;
  v_payment public.payments%rowtype;
begin
  if p_user_id is null or p_plan_id is null then raise exception 'Identité ou offre manquante'; end if;
  if p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$' then raise exception 'Clé d’idempotence invalide'; end if;

  -- Toutes les mutations d’abonnement/paiement d’un compte commencent par ce verrou.
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then raise exception 'Profil introuvable'; end if;
  select role into v_role from public.profiles where id=p_user_id;
  if v_role not in ('merchant','courier') then raise exception 'Abonnement non disponible pour ce compte'; end if;

  select * into v_plan from public.plans
  where id=p_plan_id and audience=v_role and is_active and price_xof>0
  for update;
  if not found or v_plan.price_xof is distinct from p_expected_amount_xof then
    raise exception 'plan_price_changed';
  end if;

  -- Une période payante confirmée interdit une nouvelle facturation.
  if exists(
    select 1 from public.subscriptions s join public.plans pl on pl.id=s.plan_id
    where s.user_id=p_user_id and s.status='active' and pl.code<>'starter'
      and (s.current_period_end is null or s.current_period_end>now())
  ) then raise exception 'paid_subscription_active'; end if;

  -- Réutiliser une intention existante au lieu de créer une deuxième session.
  select * into v_payment from public.payments
  where user_id=p_user_id and idempotency_key=p_idempotency_key
  for update;
  if found then
    if v_payment.plan_id <> p_plan_id then raise exception 'idempotency_key_plan_conflict'; end if;
    return jsonb_build_object('created',false,'id',v_payment.id,'plan_id',v_payment.plan_id,
      'provider',v_payment.provider,'status',v_payment.status,'checkout_url',v_payment.checkout_url,
      'provider_session_id',v_payment.provider_session_id,'created_at',v_payment.created_at);
  end if;

  select * into v_payment from public.payments
  where user_id=p_user_id and status in ('creating','pending')
  order by created_at desc limit 1
  for update;
  if found then
    return jsonb_build_object('created',false,'id',v_payment.id,'plan_id',v_payment.plan_id,
      'provider',v_payment.provider,'status',v_payment.status,'checkout_url',v_payment.checkout_url,
      'provider_session_id',v_payment.provider_session_id,'created_at',v_payment.created_at);
  end if;

  insert into public.payments(user_id,plan_id,provider,status,amount_xof,currency,idempotency_key)
  values(p_user_id,p_plan_id,'saspay','creating',v_plan.price_xof,'XOF',p_idempotency_key)
  returning * into v_payment;
  return jsonb_build_object('created',true,'id',v_payment.id,'plan_id',v_payment.plan_id,
    'provider',v_payment.provider,'status',v_payment.status,'created_at',v_payment.created_at);
end;
$$;
revoke all on function public.reserve_saspay_payment(uuid,uuid,bigint,text) from public, anon, authenticated;
grant execute on function public.reserve_saspay_payment(uuid,uuid,bigint,text) to service_role;

-- Le verrou de profil précède celui du paiement pour éviter les interblocages entre réservations et confirmations.
create or replace function public.mark_payment_paid(p_payment_id uuid,p_provider_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_payment public.payments%rowtype; v_plan public.plans%rowtype; v_user_id uuid;
begin
  select user_id into v_user_id from public.payments where id=p_payment_id;
  if not found then raise exception 'Paiement introuvable'; end if;
  perform 1 from public.profiles where id=v_user_id for update;
  if not found then raise exception 'Profil de paiement introuvable'; end if;
  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found or v_payment.user_id<>v_user_id then raise exception 'Paiement introuvable'; end if;
  if v_payment.status='paid' then return; end if;
  if v_payment.status not in ('pending','creating') or v_payment.provider <> 'saspay' then raise exception 'Paiement non éligible'; end if;

  select * into v_plan from public.plans where id=v_payment.plan_id and is_active;
  if not found or v_plan.price_xof <> v_payment.amount_xof then raise exception 'Incohérence du plan ou du montant'; end if;
  if exists(
    select 1 from public.subscriptions s join public.plans pl on pl.id=s.plan_id
    where s.user_id=v_user_id and s.status='active' and pl.code<>'starter'
      and (s.current_period_end is null or s.current_period_end>now())
  ) then raise exception 'Un abonnement payant est déjà actif ; paiement non appliqué'; end if;

  update public.payments set status='paid',provider_data=coalesce(p_provider_data,'{}'::jsonb),updated_at=now() where id=p_payment_id;
  update public.subscriptions set status='cancelled',updated_at=now() where user_id=v_user_id and status='active';
  insert into public.subscriptions(user_id,plan_id,status,started_at,current_period_end)
    values(v_user_id,v_payment.plan_id,'active',now(),now()+interval '1 month');
  insert into public.notifications(user_id,kind,title,body,link)
    values(v_user_id,'subscription_paid','Abonnement activé','Votre paiement a été confirmé par SasPay.',case when v_plan.audience='merchant' then '/merchant/subscription' else '/courier/subscription' end);
end;
$$;
revoke all on function public.mark_payment_paid(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.mark_payment_paid(uuid,jsonb) to service_role;

-- Le contrôle admin précède le verrou du compte puis celui du paiement.
create or replace function public.admin_review_manual_payment(p_payment_id uuid,p_approve boolean,p_note text)
returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_payment public.payments%rowtype; v_plan public.plans%rowtype; v_user_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  select user_id into v_user_id from public.payments where id=p_payment_id;
  if not found then raise exception 'Paiement introuvable'; end if;
  perform 1 from public.profiles where id=v_user_id for update;
  if not found then raise exception 'Profil de paiement introuvable'; end if;
  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found or v_payment.user_id<>v_user_id or v_payment.provider <> 'manual' or v_payment.status <> 'pending' then
    raise exception 'Paiement manuel non éligible';
  end if;
  if p_approve then
    select * into v_plan from public.plans where id=v_payment.plan_id and is_active;
    if not found or v_plan.price_xof <> v_payment.amount_xof then raise exception 'Incohérence du plan ou du montant'; end if;
    if exists(
      select 1 from public.subscriptions s join public.plans pl on pl.id=s.plan_id
      where s.user_id=v_user_id and s.status='active' and pl.code<>'starter'
        and (s.current_period_end is null or s.current_period_end>now())
    ) then raise exception 'Un abonnement payant est encore actif ; rejetez ou réconciliez cette demande après son échéance'; end if;
  end if;

  if p_approve then
    update public.subscriptions set status='cancelled',updated_at=now() where user_id=v_user_id and status='active';
    insert into public.subscriptions(user_id,plan_id,status,current_period_end) values(v_user_id,v_payment.plan_id,'active',now()+interval '1 month');
  end if;
  update public.payments set status=case when p_approve then 'paid' else 'rejected' end,
    reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(p_note,1000),updated_at=now()
  where id=p_payment_id;
end;
$$;
revoke all on function public.admin_review_manual_payment(uuid,boolean,text) from public;
grant execute on function public.admin_review_manual_payment(uuid,boolean,text) to authenticated;

-- La réconciliation d’un checkout sans session suit le même ordre de verrouillage.
create or replace function public.admin_reconcile_saspay_payment(p_payment_id uuid,p_paid boolean,p_reference text,p_note text)
returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_payment public.payments%rowtype; v_plan public.plans%rowtype; v_role text; v_user_id uuid; v_now timestamptz := now();
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  if p_paid is null then raise exception 'Décision obligatoire'; end if;
  if length(coalesce(btrim(p_note),'')) not between 8 and 1000 then raise exception 'Une note de vérification (8 à 1000 caractères) est requise'; end if;
  if p_paid and length(coalesce(btrim(p_reference),'')) not between 3 and 160 then raise exception 'Une référence de transaction SasPay confirmée est requise'; end if;
  select user_id into v_user_id from public.payments where id=p_payment_id;
  if not found then raise exception 'Paiement introuvable'; end if;
  perform 1 from public.profiles where id=v_user_id for update;
  if not found then raise exception 'Profil de paiement introuvable'; end if;
  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found or v_payment.user_id<>v_user_id or v_payment.provider <> 'saspay' or v_payment.status not in ('pending','creating') or v_payment.checkout_url is not null then
    raise exception 'Ce paiement SasPay ne nécessite plus de réconciliation';
  end if;
  if p_paid then
    select * into v_plan from public.plans where id=v_payment.plan_id and is_active;
    if not found then raise exception 'Offre de paiement introuvable'; end if;
    select role into v_role from public.profiles where id=v_user_id;
    if not found then raise exception 'Profil de paiement introuvable'; end if;
    if v_plan.price_xof is distinct from v_payment.amount_xof or v_plan.audience is distinct from v_role then raise exception 'Incohérence du plan, du rôle ou du montant'; end if;
    if exists(
      select 1 from public.subscriptions s join public.plans pl on pl.id=s.plan_id
      where s.user_id=v_user_id and s.status='active' and pl.code<>'starter'
        and (s.current_period_end is null or s.current_period_end>v_now)
    ) then raise exception 'Un abonnement payant est déjà actif ; paiement non réconcilié'; end if;
  end if;
  update public.payments set status=case when p_paid then 'paid' else 'failed' end,
    provider_reference=case when p_paid then left(p_reference,160) else provider_reference end,
    reviewed_by=auth.uid(),reviewed_at=v_now,review_note=left(p_note,1000),
    provider_data=coalesce(provider_data,'{}'::jsonb)||jsonb_build_object('admin_reconciliation',jsonb_build_object('outcome',case when p_paid then 'confirmed_paid' else 'no_payment_found' end,'reference',case when p_paid then left(p_reference,160) else null end,'note',left(p_note,1000),'reviewed_by',auth.uid(),'reviewed_at',v_now)),
    updated_at=v_now where id=p_payment_id;
  if p_paid then
    update public.subscriptions set status='cancelled',updated_at=v_now where user_id=v_user_id and status='active';
    insert into public.subscriptions(user_id,plan_id,status,started_at,current_period_end) values(v_user_id,v_payment.plan_id,'active',v_now,v_now+interval '1 month');
    insert into public.notifications(user_id,kind,title,body,link) values(v_user_id,'subscription_paid','Paiement SasPay confirmé','Un administrateur a confirmé votre paiement SasPay après vérification de la transaction.',case when v_plan.audience='merchant' then '/merchant/subscription' else '/courier/subscription' end);
  end if;
end;
$$;
revoke all on function public.admin_reconcile_saspay_payment(uuid,boolean,text,text) from public;
grant execute on function public.admin_reconcile_saspay_payment(uuid,boolean,text,text) to authenticated;
