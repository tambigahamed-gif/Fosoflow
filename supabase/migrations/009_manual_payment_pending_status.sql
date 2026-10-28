-- Compatibilité des bases qui auraient déjà appliqué une version utilisant pending_manual.
update public.payments set status='pending',updated_at=now() where provider='manual' and status='pending_manual';
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check check (status in ('creating','pending','paid','failed','cancelled','rejected'));

create or replace function public.create_manual_payment(p_plan_code text,p_reference text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_role text; v_plan public.plans%rowtype; v_id uuid;
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  if length(coalesce(p_reference,'')) not between 2 and 160 then raise exception 'Référence de paiement requise'; end if;
  if length(coalesce(public.get_manual_payment_instructions(),'')) < 3 then raise exception 'Les instructions de paiement manuel ne sont pas encore configurées'; end if;
  select role into v_role from public.profiles where id=v_user;
  select * into v_plan from public.plans where audience=v_role and code=p_plan_code and is_active and price_xof>0;
  if not found then raise exception 'Offre payante introuvable'; end if;
  insert into public.payments(user_id,plan_id,provider,status,amount_xof,currency,reference)
  values(v_user,v_plan.id,'manual','pending',v_plan.price_xof,'XOF',left(p_reference,160)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_manual_payment(text,text) from public;
grant execute on function public.create_manual_payment(text,text) to authenticated;

create or replace function public.admin_review_manual_payment(p_payment_id uuid,p_approve boolean,p_note text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_payment public.payments%rowtype; v_plan public.plans%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found or v_payment.provider <> 'manual' or v_payment.status <> 'pending' then raise exception 'Paiement manuel non éligible'; end if;
  update public.payments set status=case when p_approve then 'paid' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(p_note,1000),updated_at=now() where id=p_payment_id;
  if p_approve then
    select * into v_plan from public.plans where id=v_payment.plan_id and is_active;
    if not found or v_plan.price_xof <> v_payment.amount_xof then raise exception 'Incohérence du plan ou du montant'; end if;
    update public.subscriptions set status='cancelled',updated_at=now() where user_id=v_payment.user_id and status='active';
    insert into public.subscriptions(user_id,plan_id,status,current_period_end) values(v_payment.user_id,v_payment.plan_id,'active',now()+interval '1 month');
  end if;
end;
$$;
revoke all on function public.admin_review_manual_payment(uuid,boolean,text) from public;
grant execute on function public.admin_review_manual_payment(uuid,boolean,text) to authenticated;
