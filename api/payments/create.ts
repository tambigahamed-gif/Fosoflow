import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { authenticate, methodNotAllowed, parseBody, sendJson } from '../_lib/server';
import { PLANS } from '../../src/features/subscriptions/plans';

const inputSchema = z.object({ planId: z.string().min(3).max(80) }).strict();
const API_BASE = 'https://api.saspay.me/api/v1';
const uuidSchema = z.string().uuid();
type Reservation = { created: boolean; id: string; plan_id: string; provider: string; status: string; checkout_url?: string | null; provider_session_id?: string | null; created_at?: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  const context = await authenticate(req);
  if (!context) return sendJson(res, 401, { error: 'Session valide et configuration serveur requises.' });
  const parsed = inputSchema.safeParse(parseBody(req));
  if (!parsed.success) return sendJson(res, 400, { error: 'Offre invalide.' });
  const apiKey = process.env.SASPAY_API_KEY;
  if (!apiKey) return sendJson(res, 503, { error: 'SasPay n’est pas configuré : la clé marchande doit être ajoutée côté serveur.' });
  const idempotencyKey = req.headers['idempotency-key'];
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) return sendJson(res, 400, { error: 'Clé de tentative invalide. Réessayez depuis l’espace abonnement.' });

  const { admin, user } = context;
  const { data: profile, error: profileError } = await admin.from('profiles').select('role,full_name').eq('id', user.id).maybeSingle();
  if (profileError || !profile) return sendJson(res, 403, { error: 'Profil introuvable.' });
  if (!['merchant', 'courier'].includes(profile.role)) return sendJson(res, 403, { error: 'Cette offre ne correspond pas à votre compte.' });
  const planCode = parsed.data.planId.replace(`${profile.role}-`, '');
  if (planCode === parsed.data.planId) return sendJson(res, 403, { error: 'Cette offre ne correspond pas à votre compte.' });
  const { data: plan, error: planError } = await admin.from('plans').select('id,audience,code,name,price_xof,interval,is_active').eq('is_active', true).eq('audience', profile.role).eq('code', planCode).maybeSingle();
  if (planError || !plan) return sendJson(res, 403, { error: 'Cette offre ne correspond pas à votre compte.' });
  const priceXof = Number(plan.price_xof);
  if (!Number.isSafeInteger(priceXof) || priceXof <= 0) return sendJson(res, 400, { error: 'Seules les offres payantes utilisent le checkout.' });
  const catalogPlan = PLANS.find((candidate) => candidate.audience === profile.role && candidate.code === planCode);
  if (!catalogPlan || catalogPlan.price_xof !== priceXof || catalogPlan.billing_interval !== plan.interval) return sendJson(res, 409, { error: 'Le tarif configuré dans Supabase diffère du catalogue FasoFlow. Aucun paiement n’a été créé ; contactez un administrateur.' });

  const existing = await admin.from('payments').select('id,plan_id,status,checkout_url,provider_session_id').eq('user_id', user.id).eq('idempotency_key', idempotencyKey).maybeSingle();
  if (existing.error) return sendJson(res, 500, { error: 'Impossible de vérifier la tentative existante.' });
  if (existing.data) {
    if (existing.data.plan_id !== plan.id) return sendJson(res, 409, { error: 'Cette clé de tentative est déjà liée à une autre offre. Actualisez la page avant de réessayer.' });
    if (existing.data.checkout_url && existing.data.provider_session_id && existing.data.status === 'pending') {
      return sendJson(res, 200, { checkoutUrl: existing.data.checkout_url, sessionId: existing.data.provider_session_id, reused: true });
    }
    if (['failed', 'cancelled', 'rejected'].includes(existing.data.status)) {
      return sendJson(res, 409, { status: 'failed', retrySafe: true, paymentId: existing.data.id, error: 'La tentative précédente a échoué. Vous pouvez démarrer une nouvelle tentative.' });
    }
    if (existing.data.status === 'paid') return sendJson(res, 409, { status: 'paid', paymentId: existing.data.id, error: 'Cette tentative est déjà confirmée. Actualisez votre abonnement avant tout nouveau paiement.' });
    return sendJson(res, 202, { status: 'needs_admin_review', paymentId: existing.data.id, ...(existing.data.provider_session_id ? { sessionId: existing.data.provider_session_id } : {}), error: 'Le résultat de cette tentative est incertain. Ne relancez pas le paiement ; un administrateur doit d’abord vérifier SasPay.' });
  }

  const openResult = await admin.from('payments').select('id,plan_id,provider,status,checkout_url,provider_session_id,created_at').eq('user_id', user.id).in('status', ['creating', 'pending']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (openResult.error) return sendJson(res, 500, { error: 'Impossible de vérifier les paiements en cours.' });
  if (openResult.data) {
    if (openResult.data.provider === 'manual') return sendJson(res, 409, { error: 'Une demande de paiement manuel attend déjà sa vérification. Ne lancez pas un second paiement.' });
    if (openResult.data.plan_id !== plan.id) return sendJson(res, 409, { error: 'Un autre paiement d’abonnement est déjà ouvert. Terminez-le ou demandez à un administrateur de le vérifier avant de changer d’offre.' });
    if (openResult.data.status === 'pending' && openResult.data.checkout_url && openResult.data.provider_session_id) return sendJson(res, 200, { checkoutUrl: openResult.data.checkout_url, sessionId: openResult.data.provider_session_id, reused: true });
    const ageMs = Date.now() - new Date(openResult.data.created_at).getTime();
    if (openResult.data.status === 'creating' && ageMs < 30_000) return sendJson(res, 202, { status: 'in_progress', error: 'Une création de paiement est déjà en cours. Actualisez dans quelques instants.' });
    return sendJson(res, 202, { status: 'needs_admin_review', paymentId: openResult.data.id, ...(openResult.data.provider_session_id ? { sessionId: openResult.data.provider_session_id } : {}), error: 'Une tentative de paiement existante doit d’abord être vérifiée par un administrateur.' });
  }

  const activeSubscription = await admin.from('subscriptions').select('current_period_end,plans!inner(code,audience)').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (activeSubscription.error) return sendJson(res, 500, { error: 'Impossible de vérifier votre abonnement actuel.' });
  const currentPlan = Array.isArray(activeSubscription.data?.plans) ? activeSubscription.data?.plans[0] : activeSubscription.data?.plans;
  const currentStillValid = Boolean(activeSubscription.data && (!activeSubscription.data.current_period_end || new Date(activeSubscription.data.current_period_end).getTime() > Date.now()));
  if (currentStillValid && currentPlan?.audience === profile.role && currentPlan?.code !== 'starter') return sendJson(res, 409, { error: 'Votre abonnement payant est déjà actif. Aucun nouveau prélèvement n’est autorisé avant sa date d’échéance ; votre changement d’offre sera disponible ensuite.' });

  const { data: reservationData, error: reservationError } = await admin.rpc('reserve_saspay_payment', {
    p_user_id: user.id,
    p_plan_id: plan.id,
    p_expected_amount_xof: priceXof,
    p_idempotency_key: idempotencyKey,
  });
  if (reservationError) {
    const message = reservationError.message || '';
    if (message.includes('paid_subscription_active')) return sendJson(res, 409, { error: 'Votre abonnement payant est déjà actif. Aucun nouveau prélèvement n’est autorisé avant son échéance.' });
    if (message.includes('idempotency_key_plan_conflict')) return sendJson(res, 409, { error: 'Cette clé de tentative est déjà liée à une autre offre. Actualisez la page avant de réessayer.' });
    if (message.includes('plan_price_changed')) return sendJson(res, 409, { error: 'Le tarif de cette offre a changé. Actualisez la page avant de réessayer.' });
    if (reservationError.code === 'PGRST202') return sendJson(res, 503, { error: 'La migration Supabase 012 de réservation des paiements doit être appliquée avant d’activer SasPay.' });
    console.error('SasPay reservation failed', { userId: user.id, code: reservationError.code });
    return sendJson(res, 503, { error: 'Impossible de réserver le paiement en sécurité. Réessayez après vérification de la configuration Supabase.' });
  }
  const reservation = reservationData as Reservation | null;
  if (!reservation || typeof reservation.id !== 'string' || typeof reservation.created !== 'boolean') return sendJson(res, 503, { error: 'La réservation Supabase n’a pas renvoyé de résultat utilisable.' });
  if (!reservation.created) {
    if (reservation.provider === 'manual') return sendJson(res, 409, { error: 'Une demande de paiement manuel attend déjà sa vérification. Ne lancez pas un second paiement.' });
    if (reservation.plan_id !== plan.id) return sendJson(res, 409, { error: 'Un autre paiement d’abonnement est déjà ouvert. Terminez-le ou demandez à un administrateur de le vérifier avant de changer d’offre.' });
    if (reservation.status === 'pending' && reservation.checkout_url && reservation.provider_session_id) return sendJson(res, 200, { checkoutUrl: reservation.checkout_url, sessionId: reservation.provider_session_id, reused: true });
    if (['failed', 'cancelled', 'rejected'].includes(reservation.status)) return sendJson(res, 409, { status: 'failed', retrySafe: true, paymentId: reservation.id, error: 'La tentative précédente a échoué. Vous pouvez démarrer une nouvelle tentative.' });
    if (reservation.status === 'paid') return sendJson(res, 409, { status: 'paid', paymentId: reservation.id, error: 'Cette tentative est déjà confirmée. Actualisez votre abonnement avant tout nouveau paiement.' });
    const ageMs = reservation.created_at ? Date.now() - new Date(reservation.created_at).getTime() : Number.POSITIVE_INFINITY;
    if (reservation.status === 'creating' && ageMs < 30_000) return sendJson(res, 202, { status: 'in_progress', error: 'Une création de paiement est déjà en cours. Actualisez dans quelques instants.' });
    return sendJson(res, 202, { status: 'needs_admin_review', paymentId: reservation.id, ...(reservation.provider_session_id ? { sessionId: reservation.provider_session_id } : {}), error: 'Une tentative de paiement existante doit d’abord être vérifiée par un administrateur.' });
  }
  const payment = { id: reservation.id };

  const needsReview = async (details: Record<string, unknown>, sessionId?: string) => {
    const update = await admin.from('payments').update({ status: 'pending', provider_session_id: sessionId ?? null, provider_data: { ...details, outcome_uncertain: true } }).eq('id', payment.id);
    if (update.error) console.error('SasPay uncertain checkout requires admin review', { paymentId: payment.id, error: update.error.message });
    return sendJson(res, 202, { status: 'needs_admin_review', paymentId: payment.id, ...(sessionId ? { sessionId } : {}), error: 'SasPay n’a pas fourni de résultat complet. Ne relancez pas le paiement ; un administrateur doit vérifier l’historique marchand.' });
  };

  const payload = {
    amount: `${priceXof}.00`,
    currency: 'XOF',
    country: 'BF',
    description: `FasoFlow ${plan.name} — ${profile.role}`,
    ...(user.email ? { customer_email: user.email } : {}),
    ...(profile.full_name ? { customer_name: profile.full_name } : {}),
  };
  let providerResponse: Response;
  try {
    providerResponse = await fetch(`${API_BASE}/checkout-sessions/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return needsReview({ error: 'network_result_uncertain' });
  }

  const providerBody = await providerResponse.json().catch(() => null) as Record<string, unknown> | null;
  if (!providerResponse.ok && providerResponse.status < 500) {
    const { error: updateError } = await admin.from('payments').update({ status: 'failed', provider_data: { provider_http_status: providerResponse.status, provider_code: typeof providerBody?.code === 'string' ? providerBody.code : null } }).eq('id', payment.id);
    if (updateError) console.error('SasPay rejected checkout but payment row could not be updated', { paymentId: payment.id, error: updateError.message });
    const scopeError = providerBody?.code === 'api_key_scope_forbidden';
    return sendJson(res, providerResponse.status === 403 ? 403 : 502, { status: 'failed', retrySafe: !updateError, paymentId: payment.id, error: scopeError ? 'La clé SasPay ne possède pas le scope payin requis. Vérifiez les permissions du compte marchand.' : 'SasPay a refusé la création de session. Vérifiez le compte avant de réessayer.' });
  }
  if (!providerResponse.ok || !providerBody) return needsReview({ error: 'provider_server_result_uncertain', provider_http_status: providerResponse.status });

  const rawSessionId = typeof providerBody.id === 'string' ? providerBody.id : '';
  const sessionId = uuidSchema.safeParse(rawSessionId).success ? rawSessionId : '';
  const checkoutUrl = typeof providerBody.checkout_url === 'string' ? providerBody.checkout_url : '';
  const validCheckoutUrl = (() => { try { const url = new URL(checkoutUrl); return url.protocol === 'https:' && url.hostname === 'pay.saspay.me'; } catch { return false; } })();
  if (!sessionId || !validCheckoutUrl) return needsReview({ error: 'incomplete_provider_success_response', provider_http_status: providerResponse.status, returned_session_id: rawSessionId.slice(0, 100) }, sessionId || undefined);

  const { error: updateError } = await admin.from('payments').update({ status: 'pending', provider_session_id: sessionId, checkout_url: checkoutUrl, provider_data: { provider_status: typeof providerBody.status === 'string' ? providerBody.status : 'PENDING' } }).eq('id', payment.id);
  if (updateError) {
    console.error('SasPay session stored incompletely', { paymentId: payment.id, sessionId, error: updateError.message });
    return sendJson(res, 202, { status: 'needs_admin_review', paymentId: payment.id, error: 'La session a été créée mais ne peut pas encore être liée au compte. Ne payez pas ; un administrateur doit vérifier la tentative.' });
  }
  return sendJson(res, 200, { checkoutUrl, sessionId, reused: false });
}
