import { describe, expect, it } from 'vitest';
import { DEFAULT_MARKET, formatMarketAmount, MARKET_REGISTRY } from '../src/lib/market';

describe('marché FasoFlow', () => {
  it('garde le Burkina Faso en XOF/FCFA comme seul marché actif', () => {
    expect(DEFAULT_MARKET.countryCode).toBe('BF');
    expect(DEFAULT_MARKET.currencyCode).toBe('XOF');
    expect(DEFAULT_MARKET.currencyLabel).toBe('FCFA');
    expect(Object.keys(MARKET_REGISTRY)).toEqual(['BF']);
  });

  it('formate les montants avec le paramétrage du marché choisi', () => {
    const formatted = formatMarketAmount(5000, DEFAULT_MARKET);
    expect(formatted).toContain('5');
    expect(formatted).toContain('CFA');
  });
});
