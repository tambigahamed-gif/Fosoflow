import type { BusinessExpense, BusinessOrder, BusinessOrderItem, BusinessPeriod } from '../../types';
import { DEFAULT_MARKET, getMarketDateParts, marketDateKey, marketLocalTimeToUtc, shiftMarketDateKey } from '../../lib/market';

export interface BusinessMetrics {
  orderAmountXof: number;
  orderCount: number;
  paidRevenueXof: number;
  paidOrderCount: number;
  deliveredUnpaidXof: number;
  deliveredUnpaidCount: number;
  estimatedProfitXof: number;
  knownCostXof: number;
  knownCostSalesXof: number;
  expenseXof: number;
  unknownCostLines: number;
  estimatedProfitIncomplete: boolean;
}

export interface TrendPoint { label: string; key: string; value: number }
const cancelled = new Set(['cancelled', 'delivery_cancelled']);
const dateFor = (dateKey: string) => marketLocalTimeToUtc(dateKey, 12);

export function getPeriodBounds(period: BusinessPeriod, now = new Date()) {
  const parts = getMarketDateParts(now);
  const todayKey = marketDateKey(now);
  let startKey = todayKey;
  let endKey = shiftMarketDateKey(todayKey, 1);
  if (period === 'week') {
    const weekday = (new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7;
    startKey = shiftMarketDateKey(todayKey, -weekday);
    endKey = shiftMarketDateKey(startKey, 7);
  } else if (period === 'month') {
    startKey = `${parts.year}-${String(parts.month).padStart(2, '0')}-01`;
    endKey = shiftMarketDateKey(startKey, 0, 1);
  }
  return {
    start: marketLocalTimeToUtc(startKey, 0),
    end: marketLocalTimeToUtc(endKey, 0),
  };
}

export function calculateBusinessMetrics(orders: BusinessOrder[], items: BusinessOrderItem[], expenses: BusinessExpense[], period: BusinessPeriod, now = new Date()): BusinessMetrics {
  const { start, end } = getPeriodBounds(period, now);
  const inRange = (date: string) => { const value = new Date(date).getTime(); return value >= start.getTime() && value < end.getTime(); };
  const relevantOrders = orders.filter((order) => inRange(order.created_at) && !cancelled.has(order.status));
  const paidOrders = relevantOrders.filter((order) => order.payment_status === 'paid');
  const deliveredUnpaid = relevantOrders.filter((order) => order.status === 'delivered' && order.payment_status !== 'paid');
  const paidIds = new Set(paidOrders.map((order) => order.id));
  const paidItems = items.filter((item) => paidIds.has(item.order_id));
  const knownCostItems = paidItems.filter((item) => item.purchase_cost_snapshot_xof !== null && item.purchase_cost_snapshot_xof !== undefined);
  const unknownCostLines = paidItems.length - knownCostItems.length;
  const knownCostXof = knownCostItems.reduce((sum, item) => sum + item.purchase_cost_snapshot_xof! * item.quantity, 0);
  const knownCostSalesXof = knownCostItems.reduce((sum, item) => sum + item.line_total_xof, 0);
  const expenseXof = expenses.filter((expense) => inRange(expense.spent_at)).reduce((sum, expense) => sum + expense.amount_xof, 0);
  const paidRevenueXof = paidOrders.reduce((sum, order) => sum + order.total_xof, 0);
  return {
    orderAmountXof: relevantOrders.reduce((sum, order) => sum + order.total_xof, 0),
    orderCount: relevantOrders.length,
    paidRevenueXof,
    paidOrderCount: paidOrders.length,
    deliveredUnpaidXof: deliveredUnpaid.reduce((sum, order) => sum + order.total_xof, 0),
    deliveredUnpaidCount: deliveredUnpaid.length,
    estimatedProfitXof: knownCostSalesXof - knownCostXof - expenseXof,
    knownCostXof,
    knownCostSalesXof,
    expenseXof,
    unknownCostLines,
    estimatedProfitIncomplete: unknownCostLines > 0,
  };
}

export function buildPeriodTrend(orders: BusinessOrder[], period: BusinessPeriod, now = new Date()): TrendPoint[] {
  const { start, end } = getPeriodBounds(period, now);
  const firstDay = marketDateKey(start);
  const endDay = marketDateKey(end);
  const points: TrendPoint[] = [];
  if (period === 'day') {
    for (let hour = 0; hour < 24; hour += 1) {
      const key = `${firstDay}T${String(hour).padStart(2, '0')}`;
      const atHour = marketLocalTimeToUtc(firstDay, hour);
      const label = new Intl.DateTimeFormat(DEFAULT_MARKET.locale, { timeZone: DEFAULT_MARKET.timeZone, hour: '2-digit' }).format(atHour);
      points.push({ key, label, value: 0 });
    }
  } else {
    const dateLabel = period === 'week'
      ? new Intl.DateTimeFormat(DEFAULT_MARKET.locale, { timeZone: DEFAULT_MARKET.timeZone, weekday: 'short' })
      : new Intl.DateTimeFormat(DEFAULT_MARKET.locale, { timeZone: DEFAULT_MARKET.timeZone, day: 'numeric', month: 'short' });
    for (let key = firstDay; key < endDay; key = shiftMarketDateKey(key, 1)) {
      points.push({ key, label: dateLabel.format(dateFor(key)), value: 0 });
    }
  }
  const index = new Map(points.map((point, idx) => [point.key, idx]));
  orders.forEach((order) => {
    if (order.payment_status !== 'paid' || cancelled.has(order.status)) return;
    const date = new Date(order.created_at);
    const parts = getMarketDateParts(date);
    if (date < start || date >= end) return;
    const key = period === 'day' ? `${marketDateKey(date)}T${String(parts.hour).padStart(2, '0')}` : marketDateKey(date);
    const pointIndex = index.get(key);
    if (pointIndex !== undefined) points[pointIndex].value += order.total_xof;
  });
  return points;
}

export function buildMonthlyPaidTrend(orders: BusinessOrder[], now = new Date()): TrendPoint[] {
  const nowParts = getMarketDateParts(now);
  const currentMonth = `${nowParts.year}-${String(nowParts.month).padStart(2, '0')}-01`;
  const points: TrendPoint[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const monthKey = shiftMarketDateKey(currentMonth, 0, -offset);
    const date = dateFor(monthKey);
    points.push({
      key: monthKey.slice(0, 7),
      label: new Intl.DateTimeFormat(DEFAULT_MARKET.locale, { timeZone: DEFAULT_MARKET.timeZone, month: 'short' }).format(date),
      value: 0,
    });
  }
  const index = new Map(points.map((point, idx) => [point.key, idx]));
  orders.forEach((order) => {
    if (order.payment_status !== 'paid' || cancelled.has(order.status)) return;
    const parts = getMarketDateParts(new Date(order.created_at));
    const pointIndex = index.get(`${parts.year}-${String(parts.month).padStart(2, '0')}`);
    if (pointIndex !== undefined) points[pointIndex].value += order.total_xof;
  });
  return points;
}

export function aggregateTopProducts(orders: BusinessOrder[], items: BusinessOrderItem[]) {
  const orderMap = new Map(orders.filter((order) => order.payment_status === 'paid' && !cancelled.has(order.status)).map((order) => [order.id, order]));
  const products = new Map<string, { product_name_snapshot: string; quantity: number; salesXof: number }>();
  items.forEach((item) => {
    if (!orderMap.has(item.order_id)) return;
    const current = products.get(item.product_name_snapshot) ?? { product_name_snapshot: item.product_name_snapshot, quantity: 0, salesXof: 0 };
    current.quantity += item.quantity;
    current.salesXof += item.line_total_xof;
    products.set(item.product_name_snapshot, current);
  });
  return [...products.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
}

export type BusinessTruncation = 'orders' | 'expenses' | 'products' | 'order_items' | 'stock_movements';

export function canShowEstimatedProfit(
  migrationMissing: boolean,
  truncated: readonly BusinessTruncation[],
  metrics: Pick<BusinessMetrics, 'estimatedProfitIncomplete'>,
) {
  return !migrationMissing && !metrics.estimatedProfitIncomplete
    && !truncated.some((group) => group === 'orders' || group === 'order_items' || group === 'expenses');
}

export function isMissingBusinessMigration(message: string) {
  return /product_costs|order_item_costs|business_expenses|stock_movements|schema cache|does not exist|could not find the table/i.test(message);
}
