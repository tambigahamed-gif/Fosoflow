import { describe, expect, it } from 'vitest';
import type { BusinessExpense, BusinessOrder, BusinessOrderItem } from '../src/types';
import { aggregateTopProducts, buildPeriodTrend, calculateBusinessMetrics, canShowEstimatedProfit, getPeriodBounds } from '../src/features/business/businessMath';

const now = new Date('2026-10-30T12:00:00.000Z');
const order = (id: string, overrides: Partial<BusinessOrder> = {}): BusinessOrder => ({
  id, customer_id: `customer-${id}`, shop_id: 'shop-1', status: 'delivered', payment_status: 'unpaid',
  subtotal_xof: 1000, total_xof: 1000, created_at: '2026-10-30T10:00:00.000Z', ...overrides,
});
const item = (id: string, overrides: Partial<BusinessOrderItem> = {}): BusinessOrderItem => ({
  id, order_id: 'paid-known', product_id: `product-${id}`, product_name_snapshot: `Produit ${id}`,
  unit_price_xof: 1000, purchase_cost_snapshot_xof: 500, quantity: 2, line_total_xof: 2000, ...overrides,
});

describe('calculs Business FasoFlow', () => {
  it('ne compte jamais une livraison comme un encaissement', () => {
    const unpaidDelivered = order('delivered-unpaid');
    const metrics = calculateBusinessMetrics([unpaidDelivered], [], [], 'month', now);
    expect(metrics.orderAmountXof).toBe(1000);
    expect(metrics.deliveredUnpaidXof).toBe(1000);
    expect(metrics.paidRevenueXof).toBe(0);
    expect(buildPeriodTrend([unpaidDelivered], 'month', now).reduce((sum, point) => sum + point.value, 0)).toBe(0);
  });

  it('distingue le total des commandes du payé et signale des coûts inconnus', () => {
    const orders = [
      order('paid-known', { status: 'delivered', payment_status: 'paid', total_xof: 2000 }),
      order('paid-unknown', { status: 'accepted', payment_status: 'paid', total_xof: 1000 }),
      order('delivered-unpaid', { status: 'delivered', payment_status: 'unpaid', total_xof: 1000 }),
      order('cancelled', { status: 'cancelled', payment_status: 'paid', total_xof: 9000 }),
    ];
    const items = [item('known'), item('unknown', { order_id: 'paid-unknown', purchase_cost_snapshot_xof: null, line_total_xof: 1000, quantity: 1 })];
    const expenses: BusinessExpense[] = [{ id: 'expense-1', shop_id: 'shop-1', title: 'Transport', category: 'Transport', amount_xof: 100, spent_at: '2026-10-30T09:00:00.000Z', created_at: '2026-10-30T09:00:00.000Z' }];
    const metrics = calculateBusinessMetrics(orders, items, expenses, 'month', now);
    expect(metrics.orderAmountXof).toBe(4000);
    expect(metrics.paidRevenueXof).toBe(3000);
    expect(metrics.deliveredUnpaidXof).toBe(1000);
    expect(metrics.knownCostSalesXof).toBe(2000);
    expect(metrics.knownCostXof).toBe(1000);
    expect(metrics.expenseXof).toBe(100);
    expect(metrics.estimatedProfitXof).toBe(900);
    expect(metrics.unknownCostLines).toBe(1);
    expect(metrics.estimatedProfitIncomplete).toBe(true);
    expect(canShowEstimatedProfit(false, [], metrics)).toBe(false);
  });

  it('masque le bénéfice lorsque coûts, lignes ou dépenses sont tronqués ou migration manquante', () => {
    const completeMetrics = calculateBusinessMetrics([order('p', { payment_status: 'paid' })], [item('i')], [], 'month', now);
    expect(canShowEstimatedProfit(false, [], completeMetrics)).toBe(true);
    expect(canShowEstimatedProfit(false, ['orders'], completeMetrics)).toBe(false);
    expect(canShowEstimatedProfit(false, ['order_items'], completeMetrics)).toBe(false);
    expect(canShowEstimatedProfit(false, ['expenses'], completeMetrics)).toBe(false);
    expect(canShowEstimatedProfit(true, [], completeMetrics)).toBe(false);
    expect(canShowEstimatedProfit(false, ['products'], completeMetrics)).toBe(true);
  });

  it('calcule des bornes de rapport hebdomadaire du lundi au lundi', () => {
    const bounds = getPeriodBounds('week', now);
    expect(bounds.start.getUTCDay()).toBe(1);
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    const crossMonth = getPeriodBounds('week', new Date('2026-11-01T12:00:00.000Z'));
    expect(crossMonth.start.toISOString()).toBe('2026-10-26T00:00:00.000Z');
    expect(crossMonth.end.toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('utilise le fuseau du marché Burkina Faso pour les jours de rapport', () => {
    const bounds = getPeriodBounds('day', new Date('2026-10-30T15:00:00.000Z'));
    expect(bounds.start.toISOString()).toBe('2026-10-30T00:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });

  it('classe comme vendus uniquement les articles de commandes payées', () => {
    const orders = [order('paid', { payment_status: 'paid' }), order('pending', { payment_status: 'pending' })];
    const items = [item('paid-item', { order_id: 'paid', product_name_snapshot: 'Produit payé' }), item('pending-item', { order_id: 'pending', product_name_snapshot: 'Commande en attente' })];
    expect(aggregateTopProducts(orders, items)).toEqual([{ product_name_snapshot: 'Produit payé', quantity: 2, salesXof: 2000 }]);
  });
});
