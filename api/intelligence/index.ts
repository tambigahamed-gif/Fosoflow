import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticate, methodNotAllowed, parseBody, sendJson } from '../_lib/server';
import { intelligenceRequestSchema, type IntelligenceRequest, type IntelligenceTask } from './contracts';
import { createIntelligenceProvider, readProviderConfiguration, type IntelligenceProvider } from './provider';
import { sanitizeBusinessText } from './sanitize';
import { checkMerchantBusinessAccess } from '../../src/features/business/access';

const PRODUCT_LIMIT = 100;
const ORDER_LIMIT = 200;
const ITEM_LIMIT = 1000;
interface ProductRow {
  id: string;
  name: string;
  description: string;
  price_xof: number;
  stock_quantity: number;
  status: string;
}
interface OrderRow { id: string; status: string; payment_status: string; subtotal_xof: number; created_at: string }
interface ItemRow { order_id: string; product_id: string | null; quantity: number; line_total_xof: number }

function taskDays(task: IntelligenceTask): number {
  if (task === 'daily_summary') return 1;
  if (task === 'weekly_summary') return 7;
  return 30;
}

async function buildContext(admin: SupabaseClient, shopId: string, input: IntelligenceRequest) {
  const since = new Date(Date.now() - taskDays(input.task) * 24 * 60 * 60 * 1000).toISOString();
  const [productResult, orderResult] = await Promise.all([
    admin.from('products').select('id,name,description,price_xof,stock_quantity,status', { count: 'exact' }).eq('shop_id', shopId).order('created_at', { ascending: false }).limit(PRODUCT_LIMIT),
    admin.from('orders').select('id,status,payment_status,subtotal_xof,created_at', { count: 'exact' }).eq('shop_id', shopId).gte('created_at', since).order('created_at', { ascending: false }).limit(ORDER_LIMIT),
  ]);
  if (productResult.error || orderResult.error) return { error: true as const };
  const products = (productResult.data ?? []) as ProductRow[];
  const orders = (orderResult.data ?? []) as OrderRow[];
  const targetId = 'productId' in input && input.productId ? input.productId : undefined;
  if (!targetId && productResult.count !== null && productResult.count > PRODUCT_LIMIT) return { tooLarge: true as const };
  if (orderResult.count !== null && orderResult.count > ORDER_LIMIT) return { tooLarge: true as const };
  let target = targetId ? products.find((product) => product.id === targetId) : undefined;
  if (targetId && !target) {
    const targetResult = await admin.from('products').select('id,name,description,price_xof,stock_quantity,status').eq('shop_id', shopId).eq('id', targetId).maybeSingle();
    if (targetResult.error) return { error: true as const };
    if (!targetResult.data) return { notFound: true as const };
    target = targetResult.data as ProductRow;
    products.push(target);
  }
  const ids = orders.map((order) => order.id);
  let items: ItemRow[] = [];
  if (ids.length) {
    let itemQuery = admin.from('order_items').select('order_id,product_id,quantity,line_total_xof', { count: 'exact' }).in('order_id', ids);
    if (targetId) itemQuery = itemQuery.eq('product_id', targetId);
    const itemResult = await itemQuery.limit(ITEM_LIMIT);
    if (itemResult.error) return { error: true as const };
    if (itemResult.count !== null && itemResult.count > ITEM_LIMIT) return { tooLarge: true as const };
    items = (itemResult.data ?? []) as ItemRow[];
  }

  const eligibleOrders = orders.filter((order) => !['cancelled', 'delivery_cancelled'].includes(order.status));
  const paidOrders = eligibleOrders.filter((order) => order.payment_status === 'paid');
  const eligibleIds = new Set(eligibleOrders.map((order) => order.id));
  const productNames = new Map(products.map((product) => [product.id, sanitizeBusinessText(product.name, 160)]));
  const itemSales = new Map<string, { units: number; revenueXof: number }>();
  let unitsSold = 0;
  for (const item of items) {
    if (!eligibleIds.has(item.order_id)) continue;
    const name = item.product_id ? productNames.get(item.product_id) : undefined;
    const label = name || 'Produit non référencé';
    const current = itemSales.get(label) ?? { units: 0, revenueXof: 0 };
    current.units += Number.isFinite(item.quantity) ? item.quantity : 0;
    current.revenueXof += Number.isFinite(item.line_total_xof) ? item.line_total_xof : 0;
    itemSales.set(label, current);
    unitsSold += Number.isFinite(item.quantity) ? item.quantity : 0;
  }
  const performance = {
    periodDays: taskDays(input.task),
    orderCount: eligibleOrders.length,
    paidOrderCount: paidOrders.length,
    paidSubtotalXof: paidOrders.reduce((sum, order) => sum + (Number.isFinite(order.subtotal_xof) ? order.subtotal_xof : 0), 0),
    unitsSold,
    productSales: [...itemSales.entries()].map(([productName, values]) => ({ productName, ...values })).slice(0, 40),
  };
  const catalog = products.map((product) => ({
    name: sanitizeBusinessText(product.name, 160),
    description: sanitizeBusinessText(product.description, 1000),
    priceXof: Number.isFinite(product.price_xof) ? product.price_xof : 0,
    stockQuantity: Number.isFinite(product.stock_quantity) ? product.stock_quantity : 0,
    status: sanitizeBusinessText(product.status, 32),
  }));
  const context: Record<string, unknown> = {
    periodDays: performance.periodDays,
    performance,
    inventory: (target ? [target] : products).map((product) => ({
      name: sanitizeBusinessText(product.name, 160),
      priceXof: Number.isFinite(product.price_xof) ? product.price_xof : 0,
      stockQuantity: Number.isFinite(product.stock_quantity) ? product.stock_quantity : 0,
      status: sanitizeBusinessText(product.status, 32),
    })),
  };
  if (target) {
    context.product = {
      name: sanitizeBusinessText(target.name, 160),
      description: sanitizeBusinessText(target.description, 1000),
      priceXof: Number.isFinite(target.price_xof) ? target.price_xof : 0,
      stockQuantity: Number.isFinite(target.stock_quantity) ? target.stock_quantity : 0,
      status: sanitizeBusinessText(target.status, 32),
    };
  } else if (input.task === 'recommendation' || input.task === 'sales_stock_analysis' || input.task === 'alert' || input.task === 'daily_summary' || input.task === 'weekly_summary') {
    context.catalog = catalog;
  }
  return { context } as const;
}

export async function handleIntelligenceRequest(
  req: VercelRequest,
  res: VercelResponse,
  providerFactory: (config: NonNullable<ReturnType<typeof readProviderConfiguration>>) => IntelligenceProvider = createIntelligenceProvider,
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  const contentType = req.headers['content-type'];
  const contentTypeValue = Array.isArray(contentType) ? contentType[0] : contentType;
  if (!contentTypeValue || !/^application\/json(?:\s*;|$)/i.test(contentTypeValue.trim())) return sendJson(res, 415, { error: 'La requête doit être envoyée au format JSON.' });
  const contentLength = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 8_192) return sendJson(res, 413, { error: 'La requête dépasse la taille autorisée.' });
  const body = parseBody(req);
  if (Buffer.byteLength(JSON.stringify(body ?? {}), 'utf8') > 8_192) return sendJson(res, 413, { error: 'La requête dépasse la taille autorisée.' });
  const parsed = intelligenceRequestSchema.safeParse(body);
  if (!parsed.success) return sendJson(res, 400, { error: 'La tâche ou ses paramètres ne sont pas valides.' });

  let auth: Awaited<ReturnType<typeof authenticate>>;
  try {
    auth = await authenticate(req);
  } catch {
    return sendJson(res, 503, { error: 'Le service d’authentification est temporairement indisponible.' });
  }
  if (!auth) return sendJson(res, 401, { error: 'Authentification requise.' });

  let profile;
  try {
    const result = await auth.admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
    if (result.error) return sendJson(res, 503, { error: 'Impossible de vérifier le rôle du compte.' });
    profile = result.data as { role: string } | null;
  } catch {
    return sendJson(res, 503, { error: 'Impossible de vérifier le rôle du compte.' });
  }
  if (profile?.role !== 'merchant') return sendJson(res, 403, { error: 'Cette fonction est réservée aux comptes marchands.' });

  let shop;
  try {
    const result = await auth.admin.from('shops').select('id').eq('owner_id', auth.user.id).maybeSingle();
    if (result.error) return sendJson(res, 503, { error: 'Impossible de retrouver la boutique du compte.' });
    shop = result.data as { id: string } | null;
  } catch {
    return sendJson(res, 503, { error: 'Impossible de retrouver la boutique du compte.' });
  }
  if (!shop) return sendJson(res, 404, { error: 'Aucune boutique n’est associée à ce compte.' });

  let hasBusinessAccess = false;
  try {
    hasBusinessAccess = await checkMerchantBusinessAccess(auth.admin, auth.user.id);
  } catch {
    return sendJson(res, 503, { error: 'Impossible de vérifier l’abonnement Business du compte.' });
  }
  if (!hasBusinessAccess) return sendJson(res, 403, { error: 'FasoFlow Intelligence est réservée aux commerçants Business dont l’abonnement est actif.' });

  const config = readProviderConfiguration();
  if (!config) return sendJson(res, 503, { error: 'FasoFlow Intelligence reste à configurer côté serveur. Aucun résultat n’a été généré.' });

  let built;
  try {
    built = await buildContext(auth.admin, shop.id, parsed.data);
  } catch {
    return sendJson(res, 503, { error: 'Les données de la boutique ne sont pas disponibles pour le moment.' });
  }
  if ('error' in built) return sendJson(res, 503, { error: 'Les données de la boutique ne sont pas disponibles pour le moment.' });
  if ('notFound' in built) return sendJson(res, 404, { error: 'Ce produit n’a pas été trouvé dans votre boutique.' });
  if ('tooLarge' in built) return sendJson(res, 422, { error: 'Le volume de données dépasse la limite sûre de cette analyse. Aucune réponse partielle n’a été générée.' });

  try {
    const output = await providerFactory(config).generate(parsed.data.task, built.context);
    return sendJson(res, 200, { task: parsed.data.task, result: output });
  } catch {
    return sendJson(res, 502, { error: 'Le service Intelligence n’a pas pu produire une réponse. Réessayez plus tard.' });
  }
}

export default function intelligenceHandler(req: VercelRequest, res: VercelResponse) {
  return handleIntelligenceRequest(req, res);
}
