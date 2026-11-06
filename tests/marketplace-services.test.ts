import { describe, expect, it } from 'vitest';
import { maximumOrderQuantity, minimumOrderQuantity, orderRuleError, productModeLabel } from '../src/features/marketplace/product-rules';
import { isMissingServicesMigration, servicePriceLabel, serviceRequestStatusLabels } from '../src/features/services/service-utils';
import type { Product } from '../src/types';

const product = (sale_mode: Product['sale_mode'], stock_quantity = 5, minimum_order_quantity = 1): Product => ({
  id: 'p1', shop_id: 's1', category_id: null, name: 'Produit', description: '', price_xof: 1000,
  stock_quantity, image_url: null, status: 'active', created_at: '', sale_mode, minimum_order_quantity,
});

describe('règles locales des modes de vente', () => {
  it('impose les minimums de gros et respecte le stock des modes en stock', () => {
    const wholesale = product('wholesale', 8, 4);
    expect(minimumOrderQuantity(wholesale)).toBe(4);
    expect(orderRuleError(wholesale, 3)).toContain('quantité minimale');
    expect(orderRuleError(wholesale, 9)).toContain('Stock insuffisant');
    expect(orderRuleError(wholesale, 4)).toBeNull();
  });

  it('ne bloque pas la fabrication à la demande sur un stock nul', () => {
    const madeToOrder = product('made_to_order', 0, 2);
    expect(maximumOrderQuantity(madeToOrder)).toBe(100);
    expect(orderRuleError(madeToOrder, 2)).toBeNull();
    expect(productModeLabel('made_to_order')).toBe('Sur commande');
  });
});

describe('découverte et devis de services', () => {
  it('affiche des prix indicatifs ou clairement sur devis', () => {
    expect(servicePriceLabel(null, null, null)).toBe('Prix sur devis');
    expect(servicePriceLabel(5000, 10000, 'par intervention')).toContain('par intervention');
  });

  it('nomme tous les états de demandes sans confondre devis, accord et fin', () => {
    expect(serviceRequestStatusLabels.requested).toBe('Demande envoyée');
    expect(serviceRequestStatusLabels.accepted).toBe('Date et lieu convenus');
    expect(serviceRequestStatusLabels.completed).toBe('Prestation terminée');
    expect(isMissingServicesMigration('Could not find the table service_listings in the schema cache')).toBe(true);
  });
});
