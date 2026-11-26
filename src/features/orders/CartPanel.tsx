import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../app/auth';
import { EmptyState, SetupNotice } from '../../components/ui/Callout';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { formatXof } from '../../lib/utils';
import type { Product } from '../../types';
import { maximumOrderQuantity, minimumOrderQuantity, orderRuleError, productModeLabel } from '../../features/marketplace/product-rules';

type CartItem = { id: string; quantity: number };
const CART_KEY = 'fasoflow-cart';
function readCart(): CartItem[] { try { return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') as CartItem[]; } catch { return []; } }

export function CartPanel() {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>(readCart);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [productRetry, setProductRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const productIdKey = useMemo(() => [...new Set(items.map((item) => item.id))].join(','), [items]);
  const productIds = useMemo(() => productIdKey ? productIdKey.split(',') : [], [productIdKey]);

  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(items)); }, [items]);
  useEffect(() => {
    if (!supabase || !productIds.length) {
      setProducts([]);
      setProductsError('');
      setProductsLoading(false);
      return;
    }
    let live = true;
    setProducts([]);
    setProductsError('');
    setProductsLoading(true);
    void (async () => {
      try {
        const { data, error: queryError } = await supabase.from('products').select('*').in('id', productIds).eq('status', 'active');
        if (queryError) throw queryError;
        if (live) setProducts((data as Product[] | null) ?? []);
      } catch (reason) {
        if (live) setProductsError(reason instanceof Error ? reason.message : 'erreur réseau inattendue');
      } finally {
        if (live) setProductsLoading(false);
      }
    })();
    return () => { live = false; };
  }, [productIds, productRetry]);

  const total = useMemo(() => products.reduce((sum, product) => sum + product.price_xof * (items.find((item) => item.id === product.id)?.quantity ?? 0), 0), [products, items]);
  const shopIds = [...new Set(products.map((product) => product.shop_id))];
  const allItemsAvailable = items.every((item) => products.some((product) => product.id === item.id));
  function setQty(id: string, quantity: number) { setItems((current) => quantity < 1 ? current.filter((item) => item.id !== id) : current.map((item) => item.id === id ? { ...item, quantity } : item)); }

  async function checkout(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!supabase || !user) { setError('Connectez-vous pour passer commande.'); return; }
    if (productsLoading || productsError) { setError('Vérifiez le chargement des produits avant de commander.'); return; }
    if (shopIds.length > 1) { setError('Les produits de boutiques différentes doivent être commandés séparément. Retirez les autres produits du panier et recommencez.'); return; }
    if (!products.length || shopIds.length !== 1 || !allItemsAvailable) { setError('Au moins un article n’est plus disponible. Retirez-le du panier avant de commander.'); return; }
    for (const item of items) {
      const product = products.find((entry) => entry.id === item.id);
      if (product) {
        const validation = orderRuleError(product, item.quantity);
        if (validation) { setError(validation); return; }
      }
    }
    const form = new FormData(e.currentTarget);
    const address = { city: String(form.get('city')).trim(), address: String(form.get('address')).trim(), phone: String(form.get('phone')).trim() };
    setBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc('place_order', { p_shop_id: shopIds[0], p_items: items.map(({ id, quantity }) => ({ product_id: id, quantity })), p_delivery_address: address });
      if (rpcError) throw rpcError;
      setItems([]);
      setComplete(true);
      toast.success('Commande enregistrée.');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'erreur réseau inattendue';
      setError(`Commande non enregistrée : ${message}`);
      toast.error(`Commande non enregistrée : ${message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) return <section><h2 className="font-display text-2xl font-extrabold">Mon panier</h2><div className="mt-5"><SetupNotice /></div></section>;
  if (complete) return <EmptyState title="Commande enregistrée"><p>Le commerçant pourra la confirmer depuis son espace. Aucun paiement n’a été déclaré comme reçu.</p><Link to="/client/orders" className="mt-3 inline-flex font-bold text-faso-forest">Consulter mes commandes</Link></EmptyState>;
  if (!items.length) return <section><h2 className="font-display text-2xl font-extrabold">Mon panier</h2><div className="mt-6"><EmptyState title="Votre panier est vide" icon={<ShoppingBag className="h-5 w-5" />}><Link to="/marketplace" className="font-bold text-faso-forest">Découvrir les produits</Link></EmptyState></div></section>;

  return <section><h2 className="font-display text-2xl font-extrabold">Mon panier</h2><p className="mt-2 text-sm text-faso-muted">Vérifiez les articles et indiquez l’adresse souhaitée.</p><div className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><div className="grid content-start gap-3">
    {productsLoading ? <div role="status" className="rounded-2xl bg-faso-ivory p-4 text-sm text-faso-muted">Vérification des articles disponibles…</div> : productsError ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>Les articles du panier ne peuvent pas être vérifiés : {productsError}</p><button type="button" className="mt-2 font-bold underline" onClick={() => setProductRetry((value) => value + 1)}>Réessayer</button></div> : items.map((item) => {
      const product = products.find((p) => p.id === item.id);
      if (!product) return <div key={item.id} className="rounded-2xl bg-[#FFF8E8] p-4 text-sm text-faso-muted">Un article n’est plus disponible. <button className="font-bold text-faso-terracotta" onClick={() => setQty(item.id, 0)}>Retirer</button></div>;
      const minimum = minimumOrderQuantity(product);
      const maximum = maximumOrderQuantity(product);
      const validation = orderRuleError(product, item.quantity);
      return <article key={item.id} className="flex gap-4 rounded-2xl border border-faso-line bg-white p-4"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-faso-ivory">{product.image_url && <img src={product.image_url} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><h3 className="truncate font-bold">{product.name}</h3><p className="mt-1 text-sm font-extrabold text-faso-forest">{formatXof(product.price_xof)}</p><p className="mt-1 text-xs text-faso-muted">{productModeLabel(product.sale_mode)}{minimum > 1 ? ` · minimum ${minimum}` : ''}{product.sale_mode === 'made_to_order' ? ' · fabrication à la demande' : ` · stock ${product.stock_quantity}`}</p><div className="mt-3 flex items-center gap-2"><button disabled={item.quantity <= minimum} className="grid h-8 w-8 place-items-center rounded-full border border-faso-line disabled:opacity-40" aria-label="Diminuer" onClick={() => setQty(item.id, item.quantity - 1)}><Minus className="h-3 w-3" /></button><span className="min-w-6 text-center text-sm font-bold">{item.quantity}</span><button disabled={item.quantity >= maximum} className="grid h-8 w-8 place-items-center rounded-full border border-faso-line disabled:opacity-40" aria-label="Augmenter" onClick={() => setQty(item.id, Math.min(maximum, item.quantity + 1))}><Plus className="h-3 w-3" /></button><button className="ml-2 text-faso-terracotta" aria-label="Retirer" onClick={() => setQty(item.id, 0)}><Trash2 className="h-4 w-4" /></button></div>{validation && <p className="mt-2 text-xs font-semibold text-faso-terracotta">{validation}</p>}</div></article>;
    })}</div>
    <form onSubmit={checkout} className="card-surface h-fit p-5"><h3 className="font-display text-lg font-extrabold">Livraison</h3><label className="label mt-4">Ville / zone<input className="field" name="city" required maxLength={100} placeholder="Ouagadougou" /></label><label className="label mt-4">Adresse ou repère<textarea className="field min-h-20" name="address" required maxLength={500} placeholder="Quartier, rue ou repère proche" /></label><label className="label mt-4">Téléphone de contact<input className="field" name="phone" type="tel" required maxLength={32} placeholder="+226 …" /></label><div className="mt-5 flex items-center justify-between border-t border-faso-line pt-4"><span className="font-bold">Total produits</span><strong className="font-display text-xl text-faso-forest">{formatXof(total)}</strong></div><p className="mt-2 text-xs leading-5 text-faso-muted">La disponibilité sera contrôlée lors de l’enregistrement. Les frais de livraison ne sont pas ajoutés tant qu’ils ne sont pas définis par la boutique.</p>{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}<button className="btn-primary mt-5 w-full" disabled={busy || productsLoading || Boolean(productsError) || !products.length || !allItemsAvailable}>{busy ? 'Enregistrement…' : 'Passer la commande'}</button></form></div></section>;
}
