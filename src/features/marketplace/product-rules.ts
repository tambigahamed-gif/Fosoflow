import type { Product } from '../../types';

export type ProductSaleMode = NonNullable<Product['sale_mode']>;

export function minimumOrderQuantity(product: Pick<Product, 'sale_mode' | 'minimum_order_quantity'>): number {
  return Math.max(1, product.minimum_order_quantity ?? (product.sale_mode === 'wholesale' ? 2 : 1));
}

export function maximumOrderQuantity(product: Pick<Product, 'sale_mode' | 'stock_quantity'>): number {
  return product.sale_mode === 'made_to_order' ? 100 : Math.max(0, product.stock_quantity);
}

export function orderRuleError(
  product: Pick<Product, 'name' | 'sale_mode' | 'minimum_order_quantity' | 'stock_quantity'>,
  quantity: number,
): string | null {
  const minimum = minimumOrderQuantity(product);
  if (!Number.isInteger(quantity) || quantity < minimum) {
    return `${product.name} nécessite une quantité minimale de ${minimum}.`;
  }
  if (quantity > 100) return 'Une ligne de commande ne peut pas dépasser 100 articles.';
  if (product.sale_mode !== 'made_to_order' && quantity > product.stock_quantity) {
    return `Stock insuffisant pour ${product.name}.`;
  }
  return null;
}

export function productModeLabel(mode: Product['sale_mode']): string {
  if (mode === 'wholesale') return 'Vente en gros';
  if (mode === 'made_to_order') return 'Sur commande';
  return mode === 'retail' ? 'Vente au détail' : 'Mode de vente non renseigné';
}

export function productConditionLabel(condition: Product['condition']): string {
  if (condition === 'used') return 'Occasion';
  if (condition === 'refurbished') return 'Reconditionné';
  return condition === 'new' ? 'Neuf' : 'État non renseigné';
}

export function isMissingProductModesMigration(message: string): boolean {
  return /(condition|sale_mode|minimum_order_quantity|lead_time_days)/i.test(message)
    && /column|schema cache|does not exist|could not find/i.test(message);
}
