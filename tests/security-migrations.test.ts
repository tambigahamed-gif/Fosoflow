import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const reviewFix = readFileSync(resolve(process.cwd(), 'supabase/migrations/016_fix_product_review_shop_policy.sql'), 'utf8');
const rpcAclFix = readFileSync(resolve(process.cwd(), 'supabase/migrations/017_restrict_anonymous_definer_rpc.sql'), 'utf8');

describe('migrations de sécurité FasoFlow', () => {
  it('lie l’avis à la boutique de la commande livrée', () => {
    expect(reviewFix).toMatch(/o\.shop_id\s*=\s*reviews\.shop_id/i);
    expect(reviewFix).not.toMatch(/o\.shop_id\s*=\s*o\.shop_id/i);
    expect(reviewFix).toMatch(/o\.customer_id\s*=\s*\(select auth\.uid\(\)\)/i);
    expect(reviewFix).toContain("o.status = 'delivered'");
  });

  it('retire les droits anon sans révoquer les droits authenticated', () => {
    expect(rpcAclFix).toMatch(/revoke execute on function public\.admin_set_profile_role\(uuid, text\) from anon/i);
    expect(rpcAclFix).toMatch(/revoke execute on function public\.accept_delivery\(uuid\) from anon/i);
    expect(rpcAclFix).not.toMatch(/revoke\s+all\s+on\s+function[\s\S]*?from\s+authenticated/i);
    expect(rpcAclFix).toContain("has_function_privilege('authenticated', fn, 'EXECUTE')");
  });
});
