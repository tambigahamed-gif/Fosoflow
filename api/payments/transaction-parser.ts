import { parseSasPayXofAmount } from './webhook-security';

export type SasPayTransactionVerification = 'valid' | 'invalid';

/** Confirme que le détail fournisseur correspond exactement au paiement interne réservé. */
export function verifySasPayTransaction(
  transaction: Record<string, unknown>,
  expected: { paymentId: string; transactionId: string; amountXof: number; currency: string },
): SasPayTransactionVerification {
  const description = typeof transaction.description === 'string' ? transaction.description : '';
  const marker = /\[FFPAYMENT:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i.exec(description)?.[1]?.toLowerCase();
  const amount = parseSasPayXofAmount(transaction.requested_amount);

  return transaction.id === expected.transactionId
    && String(transaction.status).toUpperCase() === 'SUCCESS'
    && String(transaction.flow_direction).toUpperCase() === 'INBOUND'
    && String(transaction.currency).toUpperCase() === 'XOF'
    && expected.currency === 'XOF'
    && Number.isSafeInteger(expected.amountXof)
    && expected.amountXof > 0
    && amount === expected.amountXof
    && marker === expected.paymentId.toLowerCase()
    ? 'valid'
    : 'invalid';
}
