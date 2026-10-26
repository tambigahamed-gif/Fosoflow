import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).setHeader('Allow', 'GET, POST').json({ error: 'Méthode non autorisée.' });
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization;
  if (!secret || authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Non autorisé.' });
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(503).json({ error: 'Supabase serveur non configuré.' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from('subscriptions').update({ status: 'expired' }).eq('status', 'active').lte('current_period_end', new Date().toISOString()).select('id');
  if (error) return res.status(500).json({ error: 'Échec du traitement des expirations.' });
  return res.status(200).json({ expired: data?.length ?? 0, checkedAt: new Date().toISOString() });
}
