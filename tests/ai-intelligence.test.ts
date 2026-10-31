import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildMerchantAiSummary, suggestPrice, suggestProductDescription } from '../src/features/intelligence/ai';

describe('FasoFlow Intelligence', () => {
  it('génère une description produit cohérente et locale', () => {
    const description = suggestProductDescription('Pagne artisanal', 'mode');
    expect(description).toContain('Pagne artisanal');
    expect(description.length).toBeGreaterThan(80);
  });

  it('estime un prix réaliste selon la demande et le stock', () => {
    expect(suggestPrice(5000, 12, 0.2)).toBeGreaterThan(5000);
    expect(suggestPrice(5000, 40, -0.2)).toBeLessThanOrEqual(5000);
  });

  it('fabrique un résumé exploitable pour le commerce', () => {
    const summary = buildMerchantAiSummary({
      deliveredRevenue: 120000,
      orderCount: 18,
      topItems: [
        { name: 'Beurre de karité', quantity: 14 },
        { name: 'Pagne artisanal', quantity: 6 },
      ],
    });
    expect(summary.headline).toContain('FasoFlow Intelligence');
    expect(summary.bullets.length).toBeGreaterThanOrEqual(3);
    expect(summary.bullets[0]).toContain('Beurre de karité');
  });

  it('renseigne la configuration de déploiement de l’IA', () => {
    const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
    expect(envExample).toContain('SASPAY_API_KEY');
  });
});
