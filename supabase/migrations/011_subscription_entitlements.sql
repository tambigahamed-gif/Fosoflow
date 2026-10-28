-- FasoFlow — garde-fous atomiques pour plans, paiements et préférences. Aucun enregistrement n’est supprimé.
-- Refuser la migration si des doublons préexistants empêchent les garanties uniques ; ne pas les fusionner automatiquement.
do $$
begin
  if exists (
    select 1 from public.payments
    where status in ('creating','pending')
    group by user_id having count(*) > 1
  ) then
    raise exception 'Plusieurs paiements ouverts pour un même compte existent. Réconciliez-les manuellement avant de créer l’index ; aucune ligne n’a été supprimée.';
  end if;
  if exists (
    select 1 from public.subscriptions
    where status='active'
    group by user_id having count(*) > 1
  ) then
    raise exception 'Plusieurs abonnements actifs pour un même compte existent. Vérifiez-les manuellement avant de créer l’index ; aucune ligne n’a été supprimée.';
  end if;
end;
$$;

-- Une seule tentative de paiement ouverte (SasPay ou manuel) et un seul plan actif par utilisateur.
create unique index if not exists payments_one_open_subscription_payment_per_user
  on public.payments(user_id)
  where status in ('creating','pending');
create unique index if not exists subscriptions_one_active_per_user
  on public.subscriptions(user_id)
  where status='active';

alter table public.profiles
  add column if not exists preferred_delivery_zone text;

-- Préférence de zone conservée après expiration ; modification réservée à Premium/Pro actifs.
create or replace function public.set_courier_delivery_preference(p_zone text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_zone text := nullif(btrim(coalesce(p_zone,'')), '');
begin
  if v_user is null or not exists(select 1 from public.profiles where id=v_user and role='courier') then
    raise exception 'Compte livreur requis';
  end if;
  if v_zone is null then
    update public.profiles set preferred_delivery_zone=null,updated_at=now() where id=v_user;
    return;
  end if;
  if char_length(v_zone) not between 2 and 120 then raise exception 'La zone doit contenir entre 2 et 120 caractères'; end if;
  if not exists(
    select 1 from public.subscriptions s join public.plans p on p.id=s.plan_id
    where s.user_id=v_user and s.status='active' and p.audience='courier' and p.code in ('premium','pro')
      and (s.current_period_end is null or s.current_period_end>now())
  ) then raise exception 'Une offre livreur Premium ou Pro active est requise pour enregistrer une préférence de zone'; end if;
  update public.profiles set preferred_delivery_zone=left(v_zone,120),updated_at=now() where id=v_user;
end;
$$;
revoke all on function public.set_courier_delivery_preference(text) from public;
grant execute on function public.set_courier_delivery_preference(text) to authenticated;

-- Verrouiller le profil pour sérialiser les activations/downgrades du même compte.
create or replace function public.select_free_plan(p_plan_code text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_role text; v_plan public.plans%rowtype; v_sub uuid;
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  perform 1 from public.profiles where id=v_user for update;
  if not found then raise exception 'Profil introuvable'; end if;
  select role into v_role from public.profiles where id=v_user;
  if v_role not in ('merchant','courier') then raise exception 'Abonnement non disponible pour ce compte'; end if;
  select * into v_plan from public.plans where audience=v_role and code=p_plan_code and price_xof=0 and is_active;
  if not found then raise exception 'Offre gratuite invalide'; end if;
  if exists(select 1 from public.payments where user_id=v_user and status in ('creating','pending')) then raise exception 'Un paiement est en attente de résolution avant tout changement d’offre'; end if;
  if exists(select 1 from public.subscriptions s join public.plans p on p.id=s.plan_id where s.user_id=v_user and s.status='active' and p.code<>'starter' and (s.current_period_end is null or s.current_period_end>now())) then
    raise exception 'Votre période payante est encore active. L’offre gratuite sera disponible à son échéance.';
  end if;
  update public.subscriptions set status='cancelled',updated_at=now() where user_id=v_user and status='active';
  insert into public.subscriptions(user_id,plan_id,status,current_period_end) values(v_user,v_plan.id,'active',null) returning id into v_sub;
  return v_sub;
end;
$$;
revoke all on function public.select_free_plan(text) from public;
grant execute on function public.select_free_plan(text) to authenticated;

-- Refuser une seconde demande manuelle ou une demande pendant une période payante active.
create or replace function public.create_manual_payment(p_plan_code text,p_reference text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_role text; v_plan public.plans%rowtype; v_id uuid;
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  if length(coalesce(p_reference,'')) not between 2 and 160 then raise exception 'Référence de paiement requise'; end if;
  perform 1 from public.profiles where id=v_user for update;
  if not found then raise exception 'Profil introuvable'; end if;
  select role into v_role from public.profiles where id=v_user;
  if v_role not in ('merchant','courier') then raise exception 'Abonnement non disponible pour ce compte'; end if;
  if length(coalesce(public.get_manual_payment_instructions(),'')) < 3 then raise exception 'Les instructions de paiement manuel ne sont pas encore configurées'; end if;
  select * into v_plan from public.plans where audience=v_role and code=p_plan_code and is_active and price_xof>0;
  if not found then raise exception 'Offre payante introuvable'; end if;
  if exists(select 1 from public.subscriptions s join public.plans p on p.id=s.plan_id where s.user_id=v_user and s.status='active' and p.code<>'starter' and (s.current_period_end is null or s.current_period_end>now())) then
    raise exception 'Votre abonnement payant est encore actif ; attendez son échéance avant de soumettre un renouvellement.';
  end if;
  if exists(select 1 from public.payments where user_id=v_user and status in ('creating','pending')) then raise exception 'Un paiement est déjà en attente de résolution pour ce compte'; end if;
  insert into public.payments(user_id,plan_id,provider,status,amount_xof,currency,reference)
  values(v_user,v_plan.id,'manual','pending',v_plan.price_xof,'XOF',left(p_reference,160)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_manual_payment(text,text) from public;
grant execute on function public.create_manual_payment(text,text) to authenticated;

-- Le service SasPay et l’admin se sérialisent par profil ; une issue simultanée ne crée pas deux abonnements actifs.
create or replace function public.mark_payment_paid(p_payment_id uuid,p_provider_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_payment public.payments%rowtype; v_plan public.plans%rowtype;
begin
  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found or v_payment.status='paid' then return; end if;
  if v_payment.status not in ('pending','creating') or v_payment.provider <> 'saspay' then raise exception 'Paiement non éligible'; end if;
  perform 1 from public.profiles where id=v_payment.user_id for update;
  if not found then raise exception 'Profil de paiement introuvable'; end if;
  select * into v_plan from public.plans where id=v_payment.plan_id and is_active;
  if not found or v_plan.price_xof <> v_payment.amount_xof then raise exception 'Incohérence du plan ou du montant'; end if;
  if exists(select 1 from public.subscriptions s join public.plans p on p.id=s.plan_id where s.user_id=v_payment.user_id and s.status='active' and p.code<>'starter' and (s.current_period_end is null or s.current_period_end>now())) then
    raise exception 'Un abonnement payant est déjà actif ; paiement non appliqué';
  end if;
  update public.payments set status='paid',provider_data=coalesce(p_provider_data,'{}'::jsonb),updated_at=now() where id=p_payment_id;
  update public.subscriptions set status='cancelled',updated_at=now() where user_id=v_payment.user_id and status='active';
  insert into public.subscriptions(user_id,plan_id,status,started_at,current_period_end)
    values(v_payment.user_id,v_payment.plan_id,'active',now(),now()+interval '1 month');
  insert into public.notifications(user_id,kind,title,body,link)
    values(v_payment.user_id,'subscription_paid','Abonnement activé','Votre paiement a été confirmé par SasPay.',case when v_plan.audience='merchant' then '/merchant/subscription' else '/courier/subscription' end);
end;
$$;
revoke all on function public.mark_payment_paid(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.mark_payment_paid(uuid,jsonb) to service_role;

-- Refuser une validation manuelle si la personne est déjà abonnée à une offre payante non échue.
create or replace function public.admin_review_manual_payment(p_payment_id uuid,p_approve boolean,p_note text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_payment public.payments%rowtype; v_plan public.plans%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found or v_payment.provider <> 'manual' or v_payment.status <> 'pending' then raise exception 'Paiement manuel non éligible'; end if;
  perform 1 from public.profiles where id=v_payment.user_id for update;
  if not found then raise exception 'Profil de paiement introuvable'; end if;
  if p_approve then
    select * into v_plan from public.plans where id=v_payment.plan_id and is_active;
    if not found or v_plan.price_xof <> v_payment.amount_xof then raise exception 'Incohérence du plan ou du montant'; end if;
    if exists(select 1 from public.subscriptions s join public.plans p on p.id=s.plan_id where s.user_id=v_payment.user_id and s.status='active' and p.code<>'starter' and (s.current_period_end is null or s.current_period_end>now())) then
      raise exception 'Un abonnement payant est encore actif ; rejetez ou réconciliez cette demande après son échéance';
    end if;
  end if;
  update public.payments set status=case when p_approve then 'paid' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(p_note,1000),updated_at=now() where id=p_payment_id;
  if p_approve then
    update public.subscriptions set status='cancelled',updated_at=now() where user_id=v_payment.user_id and status='active';
    insert into public.subscriptions(user_id,plan_id,status,current_period_end) values(v_payment.user_id,v_payment.plan_id,'active',now()+interval '1 month');
  end if;
end;
$$;
revoke all on function public.admin_review_manual_payment(uuid,boolean,text) from public;
grant execute on function public.admin_review_manual_payment(uuid,boolean,text) to authenticated;

-- Verrouiller la boutique pendant le comptage afin que les créations concurrentes respectent le plafond.
create or replace function public.enforce_product_plan_limit()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v_owner uuid; v_role text; v_limit integer; v_count integer; v_plan public.plans%rowtype;
begin
  select owner_id into v_owner from public.shops where id=new.shop_id for update;
  if not found then raise exception 'Boutique introuvable'; end if;
  select role into v_role from public.profiles where id=v_owner;
  if v_role <> 'merchant' then raise exception 'Boutique commerçant requise'; end if;
  select pl.* into v_plan from public.subscriptions s join public.plans pl on pl.id=s.plan_id
  where s.user_id=v_owner and s.status='active' and (s.current_period_end is null or s.current_period_end>now()) order by s.created_at desc limit 1;
  if found then v_limit := v_plan.product_limit;
  else select product_limit into v_limit from public.plans where audience='merchant' and code='starter' and is_active; end if;
  if v_limit is null then return new; end if;
  select count(*) into v_count from public.products p where p.shop_id=new.shop_id and p.status <> 'archived' and (tg_op='INSERT' or p.id<>new.id);
  if new.status <> 'archived' and v_count >= v_limit then raise exception 'Limite du plan atteinte (% produits). Choisissez une offre supérieure ou archivez un produit.',v_limit; end if;
  return new;
end;
$$;
