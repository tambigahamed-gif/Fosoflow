export type SasPayVerification = 'paid' | 'pending' | 'session_mismatch' | 'invalid';

export function classifySasPayStatus(payload: unknown, expectedSessionId: string): SasPayVerification {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'invalid';
  const result = payload as Record<string, unknown>;
  if (typeof result.id !== 'string' || !expectedSessionId || result.id !== expectedSessionId) return 'session_mismatch';
  const status = typeof result.status === 'string' ? result.status.toUpperCase() : '';
  const transactionStatus = typeof result.transaction_status === 'string' ? result.transaction_status.toUpperCase() : '';
  return status === 'PAID' && transactionStatus === 'SUCCESS' ? 'paid' : 'pending';
}
