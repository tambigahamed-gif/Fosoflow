import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLANS, plansFor, planById } from '../src/features/subscriptions/plans';

describe('catalogue des abonnements', () => {
  it('conserve les offres et prix autorisés par audience', () => {
    expect(PLANS).toHaveLength(6);
    expect(plansFor('merchant').map((plan) => plan.price_xof)).toEqual([0, 5000, 15000]);
    expect(plansFor('courier').map((plan) => plan.price_xof)).toEqual([0, 2000, 5000]);
    expect(PLANS.every((plan) => plan.billing_interval === (plan.price_xof ? 'month' : 'none'))).toBe(true);
    expect(planById('client-premium')).toBeUndefined();
  });

  it('garde les codes, prix et intervalles alignés sur le seed de la base', () => {
    const sql = readFileSync(new URL('../supabase/migrations/003_seed_plans_categories.sql', import.meta.url), 'utf8');
    for (const plan of PLANS) {
      expect(sql).toContain(`('${plan.audience}','${plan.code}','${plan.name}',${plan.price_xof},'${plan.billing_interval}'`);
    }
  });
});
