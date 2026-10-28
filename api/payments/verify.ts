import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { authenticate, methodNotAllowed, parseBody, sendJson } from '../_lib/server';
import { classifySasPayStatus } from './status-parser';

const inputSchema = z.object({ sessionId: z.string().uuid() }).strict();
const API_BASE = 'https://api.saspay.me/api/v1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  const context = await authenticate(req);
  if (!context) return sendJson(res, 401, { error: 'Connectez-vous pour vérifier le paiement.' });
  const parsed = inputSchema.safeParse(parseBody(req));
  if (!parsed.success) return sendJson(res, 400, { error: 'Identifiant de session invalide.' });
  const apiKey = process.env.SASPAY_API_KEY;
  if (!apiKey) return sendJson(res, 503, { error: 'Vérification SasPay non configurée.' });

  const { admin, user } = context;
  const { data: payment, error } = await admin.from('payments').select('id,status,provider_session_id,amount_xof,currency').eq('provider_session_id', parsed.data.sessionId).eq('user_id', user.id).eq('provider', 'saspay').maybeSingle();
  if (error || !payment) return sendJson(res, 404, { error: 'Session de paiement introuvable pour ce compte.' });
  if (payment.status === 'paid') return sendJson(res, 200, { status: 'paid', message: 'Paiement déjà confirmé par SasPay.' });
  if (!['pending', 'creating'].includes(payment.status)) return sendJson(res, 200, { status: payment.status, message: 'Cette tentative n’est plus payable.' });

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/checkout-sessions/${encodeURIComponent(parsed.data.sessionId)}/status/`, {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return sendJson(res, 503, { status: 'pending', message: 'SasPay ne répond pas pour le moment. Aucun paiement n’a été déclaré.' });
  }
  const result = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !result) return sendJson(res, 502, { status: 'pending', message: 'Impossible de confirmer auprès de SasPay pour le moment.' });
  const verification = classifySasPayStatus(result, payment.provider_session_id ?? '');
  if (verification === 'session_mismatch') {
    console.error('SasPay status returned a different session id', { paymentId: payment.id });
    return sendJson(res, 502, { status: 'pending', message: 'La réponse SasPay ne correspond pas à cette session. Aucun abonnement n’a été activé ; une vérification est nécessaire.' });
  }
  if (verification === 'invalid') return sendJson(res, 502, { status: 'pending', message: 'La réponse de statut SasPay est incomplète. Aucun abonnement n’a été activé.' });
  const status = typeof result.status === 'string' ? result.status.toUpperCase() : '';
  const transactionStatus = typeof result.transaction_status === 'string' ? result.transaction_status.toUpperCase() : '';
  if (verification === 'paid') {
    const { error: activationError } = await admin.rpc('mark_payment_paid', { p_payment_id: payment.id, p_provider_data: { status, transaction_status: transactionStatus, transaction_id: typeof result.transaction_id === 'string' ? result.transaction_id : null, transaction_reference: typeof result.transaction_reference === 'string' ? result.transaction_reference : null } });
    if (activationError) {
      console.error('SasPay payment confirmation requires review', { paymentId: payment.id, providerSessionId: payment.provider_session_id, error: activationError.message });
      return sendJson(res, 503, { status: 'pending', message: 'SasPay confirme le paiement, mais l’activation est en attente de synchronisation.' });
    }
    return sendJson(res, 200, { status: 'paid', message: 'Paiement confirmé par SasPay ; votre abonnement est activé.' });
  }
  return sendJson(res, 200, { status: 'pending', message: 'SasPay n’a pas encore confirmé un paiement réussi. Revenez vérifier plus tard.' });
}
