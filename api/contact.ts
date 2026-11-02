import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { methodNotAllowed, sendJson } from './_lib/server';
import {
  CONTACT_RATE_LIMIT,
  contactInputSchema,
  deriveContactRateHashes,
  getClientIp,
  interpretRateLimitResult,
} from './contact-security';

const MAX_BODY_BYTES = 12_000;
const RPC_NAME = 'consume_contact_rate_limit';

function parseJsonBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function isJsonContentType(contentType: string | string[] | undefined): boolean {
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  return typeof value === 'string' && /^application\/json(?:\s*;|$)/i.test(value.trim());
}

function bodyIsTooLarge(req: VercelRequest, parsedBody: unknown): boolean {
  const lengthHeader = req.headers['content-length'];
  const lengthValue = Array.isArray(lengthHeader) ? lengthHeader[0] : lengthHeader;
  const declaredLength = lengthValue ? Number(lengthValue) : 0;
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return true;
  if (typeof req.body === 'string') return Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES;
  if (typeof parsedBody === 'string') return Buffer.byteLength(parsedBody, 'utf8') > MAX_BODY_BYTES;
  if (parsedBody && typeof parsedBody === 'object') {
    return Buffer.byteLength(JSON.stringify(parsedBody), 'utf8') > MAX_BODY_BYTES;
  }
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  if (!isJsonContentType(req.headers['content-type'])) {
    return sendJson(res, 415, { error: 'Le formulaire doit être envoyé au format JSON.' });
  }

  const body = parseJsonBody(req.body);
  if (bodyIsTooLarge(req, body)) {
    return sendJson(res, 413, { error: 'Le formulaire est trop volumineux.' });
  }
  const parsed = contactInputSchema.safeParse(body);
  if (!parsed.success) {
    return sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? 'Le formulaire est invalide.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ip = getClientIp(req.headers['x-forwarded-for']);
  if (!supabaseUrl || !serviceRoleKey || !ip) {
    return sendJson(res, 503, { error: 'Le service de contact est momentanément indisponible.' });
  }

  const hashes = deriveContactRateHashes(ip, parsed.data.email, serviceRoleKey);
  let admin: SupabaseClient;
  let rateLimitResult: unknown;
  let rateLimitError: unknown;
  try {
    admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await admin.rpc(RPC_NAME, {
      p_ip_hash: hashes.ipHash,
      p_email_hash: hashes.emailHash,
      p_max_attempts: CONTACT_RATE_LIMIT.maxAttempts,
      p_window_seconds: CONTACT_RATE_LIMIT.windowSeconds,
    });
    rateLimitResult = result.data;
    rateLimitError = result.error;
  } catch {
    return sendJson(res, 503, { error: 'La protection anti-spam est momentanément indisponible.' });
  }
  const decision = interpretRateLimitResult(rateLimitResult, rateLimitError);
  if (decision === 'unavailable') {
    return sendJson(res, 503, { error: 'La protection anti-spam est momentanément indisponible.' });
  }

  // Le champ piège reçoit la même limitation, mais sa réponse ne confirme pas la détection d'un robot.
  if (parsed.data.honeypot.trim()) {
    return sendJson(res, 200, { message: 'Votre message a bien été envoyé.' });
  }
  if (decision === 'limited') {
    res.setHeader('Retry-After', String(CONTACT_RATE_LIMIT.windowSeconds));
    return sendJson(res, 429, { error: 'Trop de tentatives. Réessayez dans un moment.' });
  }

  try {
    const { error: insertError } = await admin.from('contact_messages').insert({
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
    });
    if (insertError) {
      return sendJson(res, 500, { error: 'Votre message n’a pas pu être enregistré. Réessayez plus tard.' });
    }
  } catch {
    return sendJson(res, 500, { error: 'Votre message n’a pas pu être enregistré. Réessayez plus tard.' });
  }
  return sendJson(res, 200, { message: 'Votre message a bien été envoyé.' });
}
