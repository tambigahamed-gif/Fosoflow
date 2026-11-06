import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Heart, MessageCircle, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../app/auth';
import { supabase } from '../../lib/supabase';
import type { Product } from '../../types';
import { minimumOrderQuantity, orderRuleError } from '../marketplace/product-rules';

type CartItem = { id: string; quantity: number };
const CART_KEY = 'fasoflow-cart';

export function ProductActions({ product }: { product: Product }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [favorite, setFavorite] = useState(false);
  useEffect(() => { if (!supabase || !user || profile?.role !== 'client') { setFavorite(false); return; } void supabase.from('favorites').select('id').eq('user_id', user.id).eq('product_id', product.id).maybeSingle().then(({ data }) => setFavorite(Boolean(data))); }, [user, profile?.role, product.id]);
  function addToCart() {
    if (!user) { navigate('/login'); return; }
    if (profile?.role !== 'client') { toast.error('Connectez-vous avec un compte client pour commander.'); return; }
    try {
      const current = JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') as CartItem[];
      const found = current.find((item) => item.id === product.id);
      const minimum = minimumOrderQuantity(product);
      const quantity = Math.max(minimum, (found?.quantity ?? 0) + 1);
      const validation = orderRuleError(product, quantity);
      if (validation) { toast.error(validation); return; }
      const next = found ? current.map((item) => item.id === product.id ? { ...item, quantity } : item) : [...current, { id: product.id, quantity }];
      localStorage.setItem(CART_KEY, JSON.stringify(next));
      toast.success('Ajouté au panier.');
      navigate('/client/cart');
    } catch { toast.error('Impossible de mettre à jour le panier.'); }
  }
  async function messageSeller() {
    if (!user) { navigate('/login'); return; }
    if (profile?.role !== 'client') { toast.error('La messagerie produit est disponible depuis un compte client.'); return; }
    if (!supabase || !product.shops?.id) { toast.error('Cette annonce n’est pas reliée à une boutique active.'); return; }
    const { data, error } = await supabase.rpc('get_or_create_conversation', { p_shop_id: product.shops.id, p_product_id: product.id, p_order_id: null });
    if (error || !data) toast.error('La conversation ne peut pas être ouverte pour le moment.');
    else navigate(`/client/messages?conversation=${encodeURIComponent(String(data))}`);
  }
  async function toggleFavorite() {
    if (!user) { navigate('/login'); return; }
    if (profile?.role !== 'client' || !supabase) { toast.error('Les favoris sont disponibles depuis un compte client.'); return; }
    if (favorite) { const { error } = await supabase.from('favorites').delete().eq('user_id', user.id).eq('product_id', product.id); if (error) toast.error(error.message); else { setFavorite(false); toast.success('Retiré de vos favoris.'); } }
    else { const { error } = await supabase.from('favorites').insert({ user_id: user.id, product_id: product.id }); if (error) toast.error('Impossible d’ajouter ce produit aux favoris.'); else { setFavorite(true); toast.success('Ajouté à vos favoris.'); } }
  }
  const minimum = minimumOrderQuantity(product);
  const canOrder = product.sale_mode === 'made_to_order' || product.stock_quantity >= minimum;
  return <div className="mt-7 grid gap-3 sm:grid-cols-3"><button disabled={!canOrder} onClick={addToCart} className="btn-primary"><ShoppingBag className="h-4 w-4" />{canOrder ? minimum > 1 ? `Ajouter · min. ${minimum}` : 'Ajouter au panier' : 'Stock insuffisant'}</button>{product.shops?.id ? <button onClick={() => void messageSeller()} className="btn-secondary"><MessageCircle className="h-4 w-4" />Contacter la boutique</button> : <Link to="/login" className="btn-secondary">Connexion</Link>}<button onClick={() => void toggleFavorite()} className="btn-secondary"><Heart className={`h-4 w-4 ${favorite ? 'fill-faso-terracotta text-faso-terracotta' : ''}`} />{favorite ? 'Favori' : 'Enregistrer'}</button></div>;
}
