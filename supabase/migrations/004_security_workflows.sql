-- FasoFlow — renforcer l'isolation conversationnelle, les écritures métier et les workflows admin.

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(select 1 from public.conversation_participants cp where cp.conversation_id=p_conversation_id and cp.user_id=auth.uid());
$$;
revoke all on function public.is_conversation_participant(uuid) from public;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

drop policy if exists conversations_participant_read on public.conversations;
drop policy if exists conversations_participant_update on public.conversations;
drop policy if exists participants_read on public.conversation_participants;
drop policy if exists messages_participant_read on public.messages;
drop policy if exists messages_participant_insert on public.messages;
drop policy if exists offers_participant_read on public.price_offers;
drop policy if exists offers_participant_insert on public.price_offers;
create policy conversations_participant_read on public.conversations for select to authenticated using (public.is_admin() or public.is_conversation_participant(id));
create policy participants_read on public.conversation_participants for select to authenticated using (user_id=auth.uid() or public.is_admin() or public.is_conversation_participant(conversation_id));
create policy messages_participant_read on public.messages for select to authenticated using (public.is_admin() or public.is_conversation_participant(conversation_id));
create policy messages_participant_insert on public.messages for insert to authenticated with check (sender_id=auth.uid() and public.is_conversation_participant(conversation_id));
create policy offers_participant_read on public.price_offers for select to authenticated using (public.is_admin() or public.is_conversation_participant(conversation_id));
create policy offers_participant_insert on public.price_offers for insert to authenticated with check (offered_by=auth.uid() and status='pending' and responded_by is null and public.is_conversation_participant(conversation_id) and exists(select 1 from public.conversations c where c.id=conversation_id and c.product_id=product_id));

-- Le propriétaire d'une boutique ne peut pas s'approuver ni changer son statut.
create or replace function public.guard_shop_status()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is not null and not public.is_admin() and new.status is distinct from old.status then
    new.status := old.status;
  end if;
  if new.owner_id is distinct from old.owner_id and not public.is_admin() then
    raise exception 'Le propriétaire d’une boutique ne peut pas être modifié';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_shop_status_trigger on public.shops;
create trigger guard_shop_status_trigger before update on public.shops for each row execute function public.guard_shop_status();

-- L'acceptation d'une proposition enregistre l'accord mais ne modifie pas le prix public de l'annonce.
create or replace function public.respond_to_price_offer(p_offer_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_offer public.price_offers%rowtype; v_shop uuid; v_owner uuid;
begin
  select * into v_offer from public.price_offers where id=p_offer_id for update;
  if not found or v_offer.status <> 'pending' then raise exception 'Proposition déjà traitée ou introuvable'; end if;
  select c.shop_id into v_shop from public.conversations c where c.id=v_offer.conversation_id and public.is_conversation_participant(c.id);
  if v_shop is null then raise exception 'Conversation inaccessible'; end if;
  select owner_id into v_owner from public.shops where id=v_shop;
  if v_user = v_offer.offered_by then raise exception 'Impossible de répondre à sa propre offre'; end if;
  if v_user <> v_owner and not public.is_admin() then raise exception 'Seul le commerçant peut répondre à cette offre'; end if;
  update public.price_offers set status=case when p_accept then 'accepted' else 'rejected' end,responded_by=v_user,responded_at=now() where id=p_offer_id;
  insert into public.notifications(user_id,kind,title,body,link)
  values(v_offer.offered_by,'price_offer_response',case when p_accept then 'Proposition acceptée' else 'Proposition refusée' end,case when p_accept then 'Le prix proposé est accepté. Cette réponse ne confirme pas le paiement.' else 'La boutique a refusé la proposition.' end,'/client/messages');
end;
$$;
revoke all on function public.respond_to_price_offer(uuid,boolean) from public;
grant execute on function public.respond_to_price_offer(uuid,boolean) to authenticated;

create or replace function public.merchant_update_order_status(p_order_id uuid,p_status text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_shop_id uuid; v_owner uuid; v_old text;
begin
  select shop_id,status into v_shop_id,v_old from public.orders where id=p_order_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  select owner_id into v_owner from public.shops where id=v_shop_id;
  if v_owner <> auth.uid() and not public.is_admin() then raise exception 'Commande inaccessible'; end if;
  if not ((v_old='pending' and p_status in ('accepted','cancelled')) or (v_old='accepted' and p_status in ('preparing','cancelled')) or (v_old='preparing' and p_status='ready_for_delivery') or (v_old='ready_for_delivery' and p_status='in_delivery')) then raise exception 'Transition de commande invalide'; end if;
  update public.orders set status=p_status,updated_at=now() where id=p_order_id;
end;
$$;
revoke all on function public.merchant_update_order_status(uuid,text) from public;
grant execute on function public.merchant_update_order_status(uuid,text) to authenticated;

create or replace function public.admin_set_shop_status(p_shop_id uuid,p_status text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  if p_status not in ('pending_review','active','suspended','rejected') then raise exception 'Statut de boutique invalide'; end if;
  update public.shops set status=p_status,updated_at=now() where id=p_shop_id;
  if not found then raise exception 'Boutique introuvable'; end if;
end;
$$;
revoke all on function public.admin_set_shop_status(uuid,text) from public;
grant execute on function public.admin_set_shop_status(uuid,text) to authenticated;

create or replace function public.admin_set_product_status(p_product_id uuid,p_status text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  if p_status not in ('pending_review','active','rejected','archived') then raise exception 'Statut de produit invalide'; end if;
  update public.products set status=p_status,updated_at=now() where id=p_product_id;
  if not found then raise exception 'Produit introuvable'; end if;
end;
$$;
revoke all on function public.admin_set_product_status(uuid,text) from public;
grant execute on function public.admin_set_product_status(uuid,text) to authenticated;

create or replace function public.admin_set_profile_role(p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  if p_role not in ('client','merchant','courier','admin') then raise exception 'Rôle invalide'; end if;
  update public.profiles set role=p_role,updated_at=now() where id=p_user_id;
  if not found then raise exception 'Profil introuvable'; end if;
end;
$$;
revoke all on function public.admin_set_profile_role(uuid,text) from public;
grant execute on function public.admin_set_profile_role(uuid,text) to authenticated;

create or replace function public.admin_review_report(p_report_id uuid,p_status text,p_note text default '')
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  if p_status not in ('in_review','resolved','rejected','open') then raise exception 'Statut de signalement invalide'; end if;
  update public.reports set status=p_status,admin_note=left(p_note,2000),reviewed_by=auth.uid(),reviewed_at=now() where id=p_report_id;
  if not found then raise exception 'Signalement introuvable'; end if;
end;
$$;
revoke all on function public.admin_review_report(uuid,text,text) from public;
grant execute on function public.admin_review_report(uuid,text,text) to authenticated;

create or replace function public.set_courier_availability(p_available boolean,p_zone text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if (select role from public.profiles where id=auth.uid()) <> 'courier' then raise exception 'Compte livreur requis'; end if;
  update public.profiles set is_available=p_available,delivery_zone=case when p_zone is null then delivery_zone else left(p_zone,120) end,updated_at=now() where id=auth.uid();
end;
$$;
revoke all on function public.set_courier_availability(boolean,text) from public;
grant execute on function public.set_courier_availability(boolean,text) to authenticated;

create or replace function public.admin_set_manual_payment_instructions(p_value jsonb)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrateur requis'; end if;
  if jsonb_typeof(p_value) <> 'object' or length(coalesce(p_value->>'instructions','')) > 4000 then raise exception 'Instructions invalides'; end if;
  insert into public.platform_settings(key,value,updated_by) values('manual_payment_instructions',p_value,auth.uid())
  on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now();
end;
$$;
revoke all on function public.admin_set_manual_payment_instructions(jsonb) from public;
grant execute on function public.admin_set_manual_payment_instructions(jsonb) to authenticated;

create or replace function public.get_manual_payment_instructions()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(value->>'instructions','') from public.platform_settings where key='manual_payment_instructions';
$$;
revoke all on function public.get_manual_payment_instructions() from public;
grant execute on function public.get_manual_payment_instructions() to authenticated;

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

-- Vérifie les limites de catalogue selon l'abonnement en cours, en conservant les produits déjà enregistrés.
create or replace function public.enforce_product_plan_limit()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v_owner uuid; v_role text; v_limit integer; v_count integer; v_plan public.plans%rowtype;
begin
  select owner_id into v_owner from public.shops where id=new.shop_id;
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
drop trigger if exists products_plan_limit_guard on public.products;
create trigger products_plan_limit_guard before insert or update of shop_id,status on public.products for each row execute function public.enforce_product_plan_limit();

-- Le rôle admin seul peut lire/écrire les colonnes sensibles. Le navigateur n'écrit pas les droits de paiement.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update(full_name,phone,city,avatar_url) on public.profiles to authenticated;
revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;
drop policy if exists orders_no_client_insert on public.orders;
drop policy if exists orders_merchant_update on public.orders;
revoke all on public.order_items from anon, authenticated;
grant select on public.order_items to authenticated;
revoke all on public.deliveries from anon, authenticated;
grant select on public.deliveries to authenticated;
drop policy if exists deliveries_no_direct_write on public.deliveries;
revoke all on public.conversations from anon, authenticated;
grant select on public.conversations to authenticated;
revoke all on public.conversation_participants from anon, authenticated;
grant select on public.conversation_participants to authenticated;
revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;
revoke all on public.price_offers from anon, authenticated;
grant select, insert on public.price_offers to authenticated;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
revoke all on public.reports from anon, authenticated;
grant select, insert, update on public.reports to authenticated;
revoke all on public.contact_messages from anon, authenticated;
grant insert on public.contact_messages to anon, authenticated;
revoke all on public.platform_settings from anon, authenticated;
grant select, insert, update, delete on public.platform_settings to authenticated;
revoke all on public.payment_events from anon, authenticated;

-- Révoque les écritures non nécessaires sur les tables métier sensibles.
revoke insert, delete on public.shops from authenticated;
grant insert on public.shops to authenticated;
revoke delete on public.products from authenticated;
revoke insert, update, delete on public.favorites from authenticated;
grant insert, delete on public.favorites to authenticated;
revoke insert, update, delete on public.reviews from authenticated;
grant insert on public.reviews to authenticated;
revoke insert, update, delete on public.plans from authenticated;
revoke insert, update, delete on public.categories from authenticated;
