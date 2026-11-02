import { supabase } from '../../lib/supabase';
import { getMarketDateParts, marketLocalTimeToUtc, shiftMarketDateKey } from '../../lib/market';
import type { BusinessExpense, BusinessOrder, BusinessOrderItem, Product, Shop, StockMovement } from '../../types';
import { isMissingBusinessMigration, type BusinessTruncation } from './businessMath';

export interface BusinessData {
  shop: Shop;
  orders: BusinessOrder[];
  items: BusinessOrderItem[];
  expenses: BusinessExpense[];
  products: Product[];
  movements: StockMovement[];
  migrationMissing: boolean;
  truncated: BusinessTruncation[];
}

function hasMoreRows(count: number | null, length: number) {
  return count !== null && count > length;
}

export async function loadBusinessData(ownerId: string): Promise<BusinessData | null> {
  if (!supabase) return null;
  const shopResult = await supabase.from('shops').select('*').eq('owner_id', ownerId).maybeSingle();
  if (shopResult.error) throw new Error(shopResult.error.message);
  if (!shopResult.data) return null;
  const shop = shopResult.data as Shop;
  const marketNow = getMarketDateParts(new Date());
  const currentMonth = `${marketNow.year}-${String(marketNow.month).padStart(2, '0')}-01`;
  const since = marketLocalTimeToUtc(shiftMarketDateKey(currentMonth, 0, -6), 0);
  const [ordersResult, expenseResult, productResult, movementResult] = await Promise.all([
    supabase.from('orders').select('id,customer_id,shop_id,status,payment_status,subtotal_xof,total_xof,created_at', { count: 'exact' }).eq('shop_id', shop.id).gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(2000),
    supabase.from('business_expenses').select('id,shop_id,title,category,amount_xof,spent_at,created_at', { count: 'exact' }).eq('shop_id', shop.id).gte('spent_at', since.toISOString()).order('spent_at', { ascending: false }).limit(1000),
    supabase.from('products').select('*', { count: 'exact' }).eq('shop_id', shop.id).neq('status', 'archived').order('name').limit(500),
    supabase.from('stock_movements').select('id,shop_id,product_id,product_name_snapshot,order_id,movement_type,quantity_delta,stock_before,stock_after,created_at', { count: 'exact' }).eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(100),
  ]);
  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (productResult.error) throw new Error(productResult.error.message);
  for (const result of [expenseResult, movementResult]) {
    if (result.error && !isMissingBusinessMigration(result.error.message)) throw new Error(result.error.message);
  }
  const orders = (ordersResult.data ?? []) as BusinessOrder[];
  const orderIds = orders.map((order) => order.id);
  let itemData: Record<string, unknown>[] = [];
  let itemsTruncated = false;
  let migrationMissing = Boolean(expenseResult.error || movementResult.error);
  const costByItem = new Map<string, number | null>();
  if (orderIds.length) {
    const itemResult = await supabase.from('order_items').select('id,order_id,product_id,product_name_snapshot,unit_price_xof,quantity,line_total_xof', { count: 'exact' }).in('order_id', orderIds).limit(1000);
    if (itemResult.error) throw new Error(itemResult.error.message);
    itemData = (itemResult.data ?? []) as Record<string, unknown>[];
    itemsTruncated = hasMoreRows(itemResult.count, itemData.length);
    const itemIds = itemData.map((item) => String(item.id));
    if (itemIds.length) {
      const costResult = await supabase.from('order_item_costs').select('order_item_id,purchase_cost_xof').eq('shop_id', shop.id).in('order_item_id', itemIds);
      if (costResult.error) {
        if (!isMissingBusinessMigration(costResult.error.message)) throw new Error(costResult.error.message);
        migrationMissing = true;
      } else {
        (costResult.data ?? []).forEach((row) => costByItem.set(row.order_item_id, row.purchase_cost_xof == null ? null : Number(row.purchase_cost_xof)));
      }
    }
  }
  const items = itemData.map((item) => ({
    id: String(item.id),
    order_id: String(item.order_id),
    product_id: typeof item.product_id === 'string' ? item.product_id : null,
    product_name_snapshot: String(item.product_name_snapshot ?? ''),
    unit_price_xof: Number(item.unit_price_xof),
    purchase_cost_snapshot_xof: costByItem.get(String(item.id)) ?? null,
    quantity: Number(item.quantity),
    line_total_xof: Number(item.line_total_xof),
  }));
  const expenses = expenseResult.error ? [] : (expenseResult.data as BusinessExpense[] | null) ?? [];
  const products = (productResult.data as Product[] | null) ?? [];
  const movements = movementResult.error ? [] : (movementResult.data as StockMovement[] | null) ?? [];
  const truncated: BusinessTruncation[] = [];
  if (hasMoreRows(ordersResult.count, orders.length)) truncated.push('orders');
  if (hasMoreRows(expenseResult.error ? null : expenseResult.count, expenses.length)) truncated.push('expenses');
  if (hasMoreRows(productResult.count, products.length)) truncated.push('products');
  if (hasMoreRows(movementResult.error ? null : movementResult.count, movements.length)) truncated.push('stock_movements');
  if (itemsTruncated) truncated.push('order_items');

  return { shop, orders, items, expenses, products, movements, migrationMissing, truncated };
}
