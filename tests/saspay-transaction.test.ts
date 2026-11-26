import { describe, expect, it } from 'vitest';
import { verifySasPayTransaction } from '../api/payments/transaction-parser';

const paymentId = 'a1111111-1111-4111-8111-111111111111';
const transactionId = 'b2222222-2222-4222-8222-222222222222';
const expected = { paymentId, transactionId, amountXof: 5000, currency: 'XOF' };
const transaction = {
  id: transactionId,
  status: 'SUCCESS',
  flow_direction: 'INBOUND',
  currency: 'XOF',
  requested_amount: '5000.00',
  description: `FasoFlow Premium [FFPAYMENT:${paymentId}]`,
};

describe('verifySasPayTransaction', () => {
  it('accepts only matching successful inbound XOF transaction and internal marker', () => {
    expect(verifySasPayTransaction(transaction, expected)).toBe('valid');
  });

  it.each([
    ['amount differs', { requested_amount: '4999.00' }],
    ['currency differs', { currency: 'USD' }],
    ['direction is outgoing', { flow_direction: 'OUTBOUND' }],
    ['status is not successful', { status: 'PENDING' }],
    ['transaction id differs', { id: 'c3333333-3333-4333-8333-333333333333' }],
    ['payment marker differs', { description: 'FasoFlow Premium [FFPAYMENT:c3333333-3333-4333-8333-333333333333]' }],
    ['amount is missing', { requested_amount: undefined }],
  ])('rejects when %s', (_name, changes) => {
    expect(verifySasPayTransaction({ ...transaction, ...changes }, expected)).toBe('invalid');
  });
});
