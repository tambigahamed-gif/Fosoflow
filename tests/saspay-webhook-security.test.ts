import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  extractFasoFlowPaymentId,
  parseSasPayXofAmount,
  sanitizeSasPayEvent,
  verifySasPayWebhookSignature,
} from '../api/payments/webhook-security';

const secret = 'local-test-only-secret';
const timestamp = '1793313600';
const rawBody = Buffer.from('{"event":"transaction.success","data":{"id":"b3d7e5a8-1f42-4d2c-9a6e-5c8f1a2b3d4e","status":"SUCCESS"}}', 'utf8');
const signature = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');

describe('SasPay webhook security helpers', () => {
  it('validates the exact raw-body HMAC and a fresh Unix timestamp', () => {
    expect(verifySasPayWebhookSignature(rawBody, signature, timestamp, secret, 1793313600)).toBe(true);
  });

  it('rejects a changed body, uppercase/non-hex signature, and stale timestamp', () => {
    expect(verifySasPayWebhookSignature(Buffer.from(`${rawBody.toString()} `), signature, timestamp, secret, 1793313600)).toBe(false);
    expect(verifySasPayWebhookSignature(rawBody, signature.toUpperCase(), timestamp, secret, 1793313600)).toBe(false);
    expect(verifySasPayWebhookSignature(rawBody, signature, timestamp, secret, 1793313901)).toBe(false);
    expect(verifySasPayWebhookSignature(rawBody, signature, '1793313600000', secret, 1793313600)).toBe(false);
  });

  it('extracts only the explicit FasoFlow payment UUID marker', () => {
    expect(extractFasoFlowPaymentId('FasoFlow Premium [FFPAYMENT:B3D7E5A8-1F42-4D2C-9A6E-5C8F1A2B3D4E]')).toBe('b3d7e5a8-1f42-4d2c-9a6e-5c8f1a2b3d4e');
    expect(extractFasoFlowPaymentId('FasoFlow Premium')).toBeNull();
    expect(extractFasoFlowPaymentId(null)).toBeNull();
  });

  it('accepts whole XOF and zero fractional formatting only', () => {
    expect(parseSasPayXofAmount('5000')).toBe(5000);
    expect(parseSasPayXofAmount('5000.00')).toBe(5000);
    expect(parseSasPayXofAmount('5000.0')).toBe(5000);
    expect(parseSasPayXofAmount('5000.10')).toBeNull();
    expect(parseSasPayXofAmount('0')).toBeNull();
    expect(parseSasPayXofAmount('5e3')).toBeNull();
  });

  it('omits the payer phone number from stored webhook events', () => {
    expect(sanitizeSasPayEvent('transaction.success', {
      id: 'b3d7e5a8-1f42-4d2c-9a6e-5c8f1a2b3d4e',
      reference: 'TXN-2026-0001',
      msisdn: '70000000',
      status: 'SUCCESS',
    })).toEqual({
      event: 'transaction.success',
      data: {
        id: 'b3d7e5a8-1f42-4d2c-9a6e-5c8f1a2b3d4e',
        reference: 'TXN-2026-0001',
        status: 'SUCCESS',
      },
    });
  });
});
