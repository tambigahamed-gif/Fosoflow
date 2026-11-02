import { createHmac, timingSafeEqual } from 'node:crypto';

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PAYMENT_MARKER = new RegExp(`\\[FFPAYMENT:(${UUID_PATTERN})\\]`, 'i');
const ALLOWED_EVENT_FIELDS = [
  'id',
  'reference',
  'type',
  'status',
  'amount',
  'fee',
  'charged',
  'net_amount',
  'fee_charge_mode',
  'currency',
  'country',
  'network',
] as const;

/** Implements SasPay's documented lowercase-hex HMAC-SHA256 over `${timestamp}.${rawBody}`. */
export function verifySasPayWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  timestampHeader: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !signatureHeader || !timestampHeader) return false;
  if (!/^[a-f0-9]{64}$/.test(signatureHeader)) return false;
  if (!/^\d{10}$/.test(timestampHeader)) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestampHeader}.`, 'utf8')
    .update(rawBody)
    .digest();
  const supplied = Buffer.from(signatureHeader, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function extractFasoFlowPaymentId(description: unknown): string | null {
  if (typeof description !== 'string') return null;
  return PAYMENT_MARKER.exec(description)?.[1]?.toLowerCase() ?? null;
}

/** SasPay sends XOF as integer values sometimes formatted with a zero decimal part. */
export function parseSasPayXofAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') return null;

  const match = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  if (fraction !== '00') return null;
  const amount = Number(match[1]);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

/** Persist only non-sensitive transaction fields; never store the payer's MSISDN. */
export function sanitizeSasPayEvent(eventName: string, data: Record<string, unknown>) {
  const safeData: Record<string, string | number | boolean | null> = {};
  for (const field of ALLOWED_EVENT_FIELDS) {
    const value = data[field];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      safeData[field] = value;
    }
  }
  return { event: eventName, data: safeData };
}
