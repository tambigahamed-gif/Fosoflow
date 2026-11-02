import type { SupabaseClient } from '@supabase/supabase-js';

export interface BusinessSubscriptionSnapshot {
  current_period_end: string | null;
  plans: { code?: string; audience?: string } | { code?: string; audience?: string }[] | null;
}

export function hasActiveBusinessPlan(row: BusinessSubscriptionSnapshot | null | undefined, now = new Date()) {
  if (!row?.current_period_end) return false;
  const expiresAt = Date.parse(row.current_period_end);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return false;
  const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans;
  return plan?.code === 'business' && plan.audience === 'merchant';
}

export async function checkMerchantBusinessAccess(client: SupabaseClient, userId: string, now = new Date()) {
  const result = await client
    .from('subscriptions')
    .select('current_period_end,plans!inner(code,audience)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('plans.code', 'business')
    .eq('plans.audience', 'merchant')
    .gt('current_period_end', now.toISOString())
    .order('current_period_end', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  return hasActiveBusinessPlan(result.data as BusinessSubscriptionSnapshot | null, now);
}
