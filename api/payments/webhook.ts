import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { methodNotAllowed, sendJson } from '../_lib/server';
import {
  extractFasoFlowPaymentId,
  parseSasPayXofAmount,
  sanitizeSasPayEvent,
  verifySasPayWebhookSignature,
} from './webhook-security';

type AdminClient = import('@supabase/supabase-js').SupabaseClient;

const API_BASE = 'https://api.saspay.me/api/v1';
const MAX_BODY_BYTES = 128 * 1024;
const envelopeSchema = z.object({
  event: z.string().min(1).max(80),
  data: z.record(z.unknown()),
}).passthrough();

type PaymentRecord = {
  id: string;
  amount_xof: number | string;
  currency: string;
  status: string;
  provider_session_id: string | null;
  provider_data: Record<string, unknown> | null;
};

export const config = { api: { bodyParser: false } };

function header(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' ? value : null;
}

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const contentLength = Number(header(req, 'content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new RangeError('body_too_large');
  if (Buffer.isBuffer(req.body)) {
    if (req.body.byteLength > MAX_BODY_BYTES) throw new RangeError('body_too_large');
    return req.body;
  }
  if (typeof req.body === 'string') {
    const buffer = Buffer.from(req.body, 'utf8');
    if (buffer.byteLength > MAX_BODY_BYTES) throw new RangeError('body_too_large');
    return buffer;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.byteLength;
    if (size > MAX_BODY_BYTES) throw new RangeError('body_too_large');
    chunks.push(part);
  }
  return Buffer.concat(chunks, size);
}

function parseXof(value: unknown): number | null {
  return parseSasPayXofAmount(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function updateEvent(
  admin: AdminClient,
  eventId: string,
  status: 'processed' | 'ignored' | 'failed',
  paymentId?: string,
) {
  const { error } = await admin.from('payment_events').update({
    ...(paymentId ? { payment_id: paymentId } : {}),
    processing_status: status,
    ...(status === 'processed' || status === 'ignored' ? { processed_at: new Date().toISOString() } : {}),
  }).eq('event_id', eventId);
  return error;
}

async function findPayment(admin: AdminClient, transaction: Record<string, unknown>): Promise<PaymentRecord | null> {
  const paymentId = extractFasoFlowPaymentId(transaction.description);
  if (paymentId) {
    const { data, error } = await admin.from('payments')
      .select('id,amount_xof,currency,status,provider_session_id,provider_data')
      .eq('id', paymentId).eq('provider', 'saspay').maybeSingle();
    if (error) throw new Error('payment_lookup_failed');
    if (data) return data as PaymentRecord;
  }

  const transactionId = typeof transaction.id === 'string' ? transaction.id : '';
  if (transactionId) {
    const { data, error } = await admin.from('payments')
      .select('id,amount_xof,currency,status,provider_session_id,provider_data')
      .eq('provider', 'saspay').eq('provider_transaction_id', transactionId).maybeSingle();
    if (error) throw new Error('payment_lookup_failed');
    if (data) return data as PaymentRecord;
  }

  const reference = typeof transaction.reference === 'string' ? transaction.reference : '';
  if (reference && /^[A-Za-z0-9._:-]{1,160}$/.test(reference)) {
    const { data, error } = await admin.from('payments')
      .select('id,amount_xof,currency,status,provider_session_id,provider_data')
      .eq('provider', 'saspay').eq('provider_reference', reference).maybeSingle();
    if (error) throw new Error('payment_lookup_failed');
    if (data) return data as PaymentRecord;
  }
  return null;
}

async function fetchSasPayTransaction(transactionId: string, apiKey: string) {
  const response = await fetch(`${API_BASE}/transactions/${encodeURIComponent(transactionId)}/`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(7_000),
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  return response.ok && body ? body : null;
}

async function verifyCheckoutSession(sessionId: string, transactionId: string, apiKey: string) {
  const response = await fetch(`${API_BASE}/checkout-sessions/${encodeURIComponent(sessionId)}/status/`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(5_000),
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !body) return false;
  return body.id === sessionId
    && body.transaction_id === transactionId
    && String(body.status).toUpperCase() === 'PAID'
    && String(body.transaction_status).toUpperCase() === 'SUCCESS';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

  const secret = process.env.SASPAY_WEBHOOK_SIGNING_SECRET;
  const apiKey = process.env.SASPAY_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !apiKey || !supabaseUrl || !serviceRoleKey) {
    res.setHeader('Retry-After', '300');
    return sendJson(res, 503, { error: 'Le webhook SasPay est désactivé tant que la configuration serveur complète n’est pas disponible.' });
  }
  if (!(header(req, 'content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return sendJson(res, 415, { error: 'Le webhook doit être envoyé en JSON.' });
  }

  let rawBody: Buffer;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    return sendJson(res, error instanceof RangeError ? 413 : 400, { error: 'Corps du webhook invalide.' });
  }
  if (!rawBody.byteLength) return sendJson(res, 400, { error: 'Corps du webhook vide.' });

  const signature = header(req, 'x-webhook-signature');
  const timestamp = header(req, 'x-webhook-timestamp');
  const eventHeader = header(req, 'x-webhook-event');
  if (!verifySasPayWebhookSignature(rawBody, signature, timestamp, secret)) {
    return sendJson(res, 401, { error: 'Signature ou horodatage SasPay invalide.' });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return sendJson(res, 400, { error: 'JSON webhook invalide.' });
  }
  const parsed = envelopeSchema.safeParse(json);
  if (!parsed.success || !eventHeader || parsed.data.event !== eventHeader) {
    return sendJson(res, 400, { error: 'Événement webhook invalide ou incohérent.' });
  }
  if (parsed.data.event !== 'transaction.success') {
    return sendJson(res, 200, { received: true, ignored: true });
  }

  const transactionId = z.string().uuid().safeParse(parsed.data.data.id);
  if (!transactionId.success || String(parsed.data.data.status).toUpperCase() !== 'SUCCESS') {
    return sendJson(res, 400, { error: 'Événement transaction.success incomplet.' });
  }

  const safePayload = sanitizeSasPayEvent(parsed.data.event, parsed.data.data);
  const eventId = `saspay:${parsed.data.event}:${transactionId.data}`;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: insertError } = await admin.from('payment_events').upsert({
    provider: 'saspay',
    event_id: eventId,
    event_type: parsed.data.event,
    payload: safePayload,
  }, { onConflict: 'event_id', ignoreDuplicates: true });
  if (insertError) {
    console.error('SasPay event could not be recorded', { code: insertError.code });
    res.setHeader('Retry-After', '30');
    return sendJson(res, 503, { error: 'Événement SasPay en attente d’enregistrement.' });
  }

  const { data: previousEvent, error: eventError } = await admin.from('payment_events')
    .select('processing_status').eq('event_id', eventId).maybeSingle();
  if (eventError || !previousEvent) {
    res.setHeader('Retry-After', '30');
    return sendJson(res, 503, { error: 'État de l’événement SasPay indisponible.' });
  }
  if (previousEvent.processing_status === 'processed' || previousEvent.processing_status === 'ignored') {
    return sendJson(res, 200, { received: true, duplicate: true });
  }

  let transaction: Record<string, unknown> | null;
  try {
    transaction = await fetchSasPayTransaction(transactionId.data, apiKey);
  } catch {
    transaction = null;
  }
  if (!transaction) {
    await updateEvent(admin, eventId, 'failed');
    res.setHeader('Retry-After', '30');
    return sendJson(res, 503, { error: 'La transaction ne peut pas encore être vérifiée auprès de SasPay.' });
  }

  if (transaction.id !== transactionId.data
    || String(transaction.status).toUpperCase() !== 'SUCCESS'
    || String(transaction.flow_direction).toUpperCase() !== 'INBOUND'
    || String(transaction.currency).toUpperCase() !== 'XOF') {
    await updateEvent(admin, eventId, 'failed');
    res.setHeader('Retry-After', '30');
    return sendJson(res, 503, { error: 'Le détail SasPay ne confirme pas encore cette transaction entrante XOF.' });
  }

  let payment: PaymentRecord | null;
  try {
    payment = await findPayment(admin, transaction);
  } catch {
    await updateEvent(admin, eventId, 'failed');
    res.setHeader('Retry-After', '30');
    return sendJson(res, 503, { error: 'Le paiement FasoFlow ne peut pas encore être rapproché.' });
  }
  if (!payment) {
    await updateEvent(admin, eventId, 'ignored');
    return sendJson(res, 200, { received: true, matched: false });
  }

  const storedAmount = Number(payment.amount_xof);
  const providerAmount = parseXof(transaction.requested_amount);
  if (payment.currency !== 'XOF' || !Number.isSafeInteger(storedAmount) || storedAmount <= 0 || providerAmount !== storedAmount) {
    await updateEvent(admin, eventId, 'failed', payment.id);
    return sendJson(res, 409, { error: 'Montant ou devise incohérents ; aucun abonnement n’a été activé.' });
  }

  if (payment.status === 'paid') {
    const eventUpdateError = await updateEvent(admin, eventId, 'processed', payment.id);
    if (eventUpdateError) {
      res.setHeader('Retry-After', '30');
      return sendJson(res, 503, { error: 'Paiement déjà confirmé ; synchronisation de l’événement en attente.' });
    }
    return sendJson(res, 200, { received: true, status: 'paid' });
  }
  if (!['creating', 'pending'].includes(payment.status)) {
    const eventUpdateError = await updateEvent(admin, eventId, 'ignored', payment.id);
    if (eventUpdateError) {
      res.setHeader('Retry-After', '30');
      return sendJson(res, 503, { error: 'Événement en attente de synchronisation.' });
    }
    return sendJson(res, 200, { received: true, status: 'not_eligible' });
  }

  if (payment.provider_session_id) {
    let sessionValid = false;
    try {
      sessionValid = await verifyCheckoutSession(payment.provider_session_id, transactionId.data, apiKey);
    } catch {
      sessionValid = false;
    }
    if (!sessionValid) {
      await updateEvent(admin, eventId, 'failed', payment.id);
      res.setHeader('Retry-After', '30');
      return sendJson(res, 503, { error: 'La session de checkout n’est pas encore confirmée pour cette transaction.' });
    }
  }

  const transactionReference = typeof transaction.reference === 'string' ? transaction.reference.slice(0, 160) : null;
  const existingProviderData = isObject(payment.provider_data) ? payment.provider_data : {};
  const { error: linkError } = await admin.from('payments').update({
    provider_transaction_id: transactionId.data,
    ...(transactionReference ? { provider_reference: transactionReference } : {}),
    provider_data: {
      ...existingProviderData,
      saspay_transaction: {
        id: transactionId.data,
        reference: transactionReference,
        status: 'SUCCESS',
        flow_direction: 'INBOUND',
        currency: 'XOF',
        requested_amount: String(transaction.requested_amount),
        verified_by: 'saspay_api',
      },
    },
  }).eq('id', payment.id).eq('provider', 'saspay').in('status', ['creating', 'pending']);
  if (linkError) {
    console.error('SasPay transaction could not be linked', { paymentId: payment.id, code: linkError.code });
    await updateEvent(admin, eventId, 'failed', payment.id);
    res.setHeader('Retry-After', '30');
    return sendJson(res, 503, { error: 'La transaction SasPay ne peut pas encore être liée au paiement.' });
  }

  const { error: activationError } = await admin.rpc('mark_payment_paid', {
    p_payment_id: payment.id,
    p_provider_data: {
      ...existingProviderData,
      status: 'PAID',
      transaction_status: 'SUCCESS',
      transaction_id: transactionId.data,
      transaction_reference: transactionReference,
      source: 'saspay_signed_webhook_and_transaction_api',
    },
  });
  if (activationError) {
    console.error('SasPay webhook activation requires reconciliation', { paymentId: payment.id, code: activationError.code });
    await updateEvent(admin, eventId, 'failed', payment.id);
    res.setHeader('Retry-After', '30');
    return sendJson(res, 503, { error: 'SasPay confirme la transaction ; l’activation attend la synchronisation de Supabase.' });
  }

  const eventUpdateError = await updateEvent(admin, eventId, 'processed', payment.id);
  if (eventUpdateError) {
    res.setHeader('Retry-After', '30');
    return sendJson(res, 503, { error: 'Paiement confirmé ; synchronisation de l’événement en attente.' });
  }
  return sendJson(res, 200, { received: true, status: 'paid' });
}
