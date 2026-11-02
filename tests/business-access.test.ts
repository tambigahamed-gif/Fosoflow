import { describe, expect, it } from 'vitest';
import { hasActiveBusinessPlan } from '../src/features/business/access';

const now = new Date('2026-11-01T12:00:00.000Z');

function snapshot(code: string, audience: string, end = '2026-12-01T00:00:00.000Z') {
  return { current_period_end: end, plans: { code, audience } };
}

describe('accès au plan FasoFlow Business', () => {
  it('autorise uniquement le plan Business commerçant encore actif', () => {
    expect(hasActiveBusinessPlan(snapshot('business', 'merchant'), now)).toBe(true);
    expect(hasActiveBusinessPlan(snapshot('premium', 'merchant'), now)).toBe(false);
    expect(hasActiveBusinessPlan(snapshot('business', 'courier'), now)).toBe(false);
    expect(hasActiveBusinessPlan(snapshot('business', 'merchant', '2026-10-31T23:59:59.000Z'), now)).toBe(false);
    expect(hasActiveBusinessPlan({ ...snapshot('business', 'merchant'), current_period_end: null }, now)).toBe(false);
  });
});
