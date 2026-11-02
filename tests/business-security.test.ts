import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/013_business_operations.sql'), 'utf8');

describe('confidentialité des coûts Business', () => {
  it('ne modifie pas les tables de catalogue/commande visibles par le client', () => {
    expect(migration).not.toMatch(/alter\s+table\s+public\.(products|order_items)[\s\S]*?purchase_cost_xof/i);
    expect(migration).toMatch(/insert\s+into\s+public\.order_items\([^)]*\)[\s\S]*?returning\s+id/i);
    expect(migration).toContain('insert into public.order_item_costs');
  });

  it('active RLS et ne donne pas d’écriture client sur le snapshot privé', () => {
    expect(migration).toContain('alter table public.product_costs enable row level security');
    expect(migration).toContain('alter table public.order_item_costs enable row level security');
    expect(migration).toContain('create policy order_item_costs_owner_read');
    expect(migration).toMatch(/grant\s+select\s+on\s+public\.order_item_costs\s+to\s+authenticated/i);
    expect(migration).not.toMatch(/grant\s+(?:select\s*,\s*)?(?:insert|update|delete)[^;]*public\.order_item_costs/i);
  });

  it('exige un profil commerçant et un abonnement Business non expiré dans les RLS', () => {
    expect(migration).toContain("profile.role='merchant'");
    expect(migration).toContain("p.code='business'");
    expect(migration).toContain("s.current_period_end > now()");
    expect(migration).toContain('public.has_active_merchant_business_access()');
  });
});
