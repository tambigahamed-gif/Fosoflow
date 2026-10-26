import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface AuthenticatedUser { id: string; email: string | null }
export interface ServerContext { admin: SupabaseClient; user: AuthenticatedUser }

export function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

export function getBearer(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

export async function authenticate(req: VercelRequest): Promise<ServerContext | null> {
  const token = getBearer(req);
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !url || !anon || !serviceKey) return null;
  const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) return null;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { admin, user: { id: user.id, email: user.email ?? null } };
}

export function methodNotAllowed(res: VercelResponse, allowed: string) {
  res.setHeader('Allow', allowed);
  sendJson(res, 405, { error: 'Méthode non autorisée.' });
}

export function parseBody(req: VercelRequest): Record<string, unknown> | null {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return null;
  return req.body as Record<string, unknown>;
}
