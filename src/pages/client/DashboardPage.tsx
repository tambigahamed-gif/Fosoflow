import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Box, CalendarDays, CircleDollarSign, Heart, ShieldCheck, ShoppingBag, Store, Truck, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../app/auth';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { formatDate, formatXof, statusLabels } from '../../lib/utils';
import type { AppRole, Product } from '../../types';
import { ChatPanel } from '../../features/messaging/ChatPanel';
import { CartPanel } from '../../features/orders/CartPanel';
import { SubscriptionPanel } from '../../features/subscriptions/SubscriptionPanel';
import { CourierEarningsPanel, MerchantAnalyticsPanel } from '../../features/subscriptions/InsightsPanels';
import { CourierPreferenceSettings } from '../../features/subscriptions/CourierPreferenceSettings';
import { EmptyState, SetupNotice } from '../../components/ui/Callout';
import { ProductCard } from '../../components/products/ProductCard';

const labels: Record<string, string> = {
  dashboard: 'Vue d’ensemble', orders: 'Mes commandes', favorites: 'Mes favoris', addresses: 'Mes adresses',
  messages: 'Messages', deliveries: 'Livraisons', reviews: 'Avis clients', notifications: 'Notifications',
  shop: 'Ma boutique', products: 'Produits', analytics: 'Statistiques', subscription: 'Abonnement',
  settings: 'Mon profil', history: 'Historique des courses', earnings: 'Mes revenus', users: 'Utilisateurs',
  shops: 'Boutiques', reports: 'Signalements', cart: 'Mon panier',
};
interface Summary { orders: number; favorites: number; products: number; deliveries: number; users: number; shops: number; payments: number }
interface RecentRow { id: string; status: string; total_xof?: number; fee_xof?: number; created_at: string }

export function DashboardPage({ role }: { role: AppRole }) {
  const { section = 'dashboard' } = useParams();
  const { profile, user } = useAuth();
  const [summary, setSummary] = useState<Summary>({ orders: 0, favorites: 0, products: 0, deliveries: 0, users: 0, shops: 0, payments: 0 });
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase || !user) return;
    let mounted = true;
    const load = async () => {
      const next: Summary = { orders: 0, favorites: 0, products: 0, deliveries: 0, users: 0, shops: 0, payments: 0 };
      if (role === 'client') {
        const [orders, favorites, recentOrders] = await Promise.all([
          supabase!.from('orders').select('*', { count: 'exact', head: true }).eq('customer_id', user.id),
          supabase!.from('favorites').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase!.from('orders').select('id,status,total_xof,created_at').eq('customer_id', user.id).order('created_at', { ascending: false }).limit(5),
        ]);
        next.orders = orders.count ?? 0; next.favorites = favorites.count ?? 0;
        if (mounted) setRecent((recentOrders.data as RecentRow[] | null) ?? []);
      } else if (role === 'merchant') {
        const shop = await supabase!.from('shops').select('id').eq('owner_id', user.id).maybeSingle();
        if (shop.data?.id) {
          const [products, orders, recentOrders] = await Promise.all([
            supabase!.from('products').select('*', { count: 'exact', head: true }).eq('shop_id', shop.data.id),
            supabase!.from('orders').select('*', { count: 'exact', head: true }).eq('shop_id', shop.data.id),
            supabase!.from('orders').select('id,status,total_xof,created_at').eq('shop_id', shop.data.id).order('created_at', { ascending: false }).limit(5),
          ]);
          next.products = products.count ?? 0; next.orders = orders.count ?? 0;
          if (mounted) setRecent((recentOrders.data as RecentRow[] | null) ?? []);
        }
      } else if (role === 'courier') {
        const [deliveries, recentDeliveries] = await Promise.all([
          supabase!.from('deliveries').select('*', { count: 'exact', head: true }).eq('courier_id', user.id),
          supabase!.from('deliveries').select('id,status,fee_xof,created_at').eq('courier_id', user.id).order('created_at', { ascending: false }).limit(5),
        ]);
        next.deliveries = deliveries.count ?? 0;
        if (mounted) setRecent((recentDeliveries.data as RecentRow[] | null) ?? []);
      } else {
        const [users, shops, payments] = await Promise.all([
          supabase!.from('profiles').select('*', { count: 'exact', head: true }),
          supabase!.from('shops').select('*', { count: 'exact', head: true }),
          supabase!.from('payments').select('*', { count: 'exact', head: true }).eq('provider', 'manual').eq('status', 'pending'),
        ]);
        next.users = users.count ?? 0; next.shops = shops.count ?? 0; next.payments = payments.count ?? 0;
      }
      if (mounted) { setSummary(next); setLoading(false); }
    };
    void load().catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [role, user]);

  if (!isSupabaseConfigured) return <div className="space-y-5"><h2 className="font-display text-2xl font-extrabold">{labels[section] ?? 'Mon espace'}</h2><SetupNotice /><p className="text-sm text-faso-muted">Les informations personnelles, commandes, ventes et courses ne sont pas simulées. Elles s’afficheront après connexion à votre projet Supabase.</p></div>;
  const title = labels[section] ?? 'Mon espace';
  if (section === 'messages') return <ChatPanel />;
  if (section === 'subscription') return <SubscriptionPanel role={role} />;
  if (section === 'cart' && role === 'client') return <CartPanel />;
  if (section === 'orders' && role === 'merchant') return <MerchantOrdersPanel />;
  if (section === 'orders' || section === 'history' || section === 'deliveries') return <OrdersPanel role={role} title={title} />;
  if (section === 'analytics' && role === 'merchant') return <MerchantAnalyticsPanel />;
  if (section === 'earnings' && role === 'courier') return <CourierEarningsPanel />;
  if (section === 'favorites') return <FavoritesPanel userId={user?.id ?? ''} />;
  if (section === 'settings') return <ProfileSettings />;
  if (section === 'notifications') return <NotificationsPanel />;
  if (section === 'reviews') return <ReviewsPanel role={role} />;
  if (section === 'shop' && role === 'merchant') return <div><h2 className="font-display text-2xl font-extrabold">Ma boutique</h2><p className="mt-2 text-sm text-faso-muted">Créez votre boutique et gérez sa vitrine et ses produits.</p><Link to="/merchant/products" className="btn-primary mt-5">Ouvrir la gestion de boutique <ArrowRight className="h-4 w-4" /></Link></div>;
  if (section === 'products' && role === 'merchant') return <div><h2 className="font-display text-2xl font-extrabold">Produits</h2><p className="mt-2 text-sm text-faso-muted">Gérez votre catalogue, vos photos et vos stocks.</p><Link to="/merchant/products" className="btn-primary mt-5">Ouvrir mes produits <ArrowRight className="h-4 w-4" /></Link></div>;
  if (section === 'payments' && role === 'admin') return <div><h2 className="font-display text-2xl font-extrabold">Validations de paiements manuels</h2><Link to="/admin/payments" className="btn-primary mt-5">Ouvrir la file de validation <ArrowRight className="h-4 w-4" /></Link></div>;
  if (section !== 'dashboard') return <section><h2 className="font-display text-2xl font-extrabold">{title}</h2><p className="mt-2 text-sm text-faso-muted">Les données affichées proviennent de votre espace FasoFlow.</p><div className="mt-6"><EmptyState title="Aucune donnée disponible pour le moment"><p>Cette section se remplira à mesure de votre activité. Les écrans administratifs restent accessibles aux comptes autorisés.</p></EmptyState></div></section>;

  return <div>
    <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="eyebrow">Bonjour{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</p><h2 className="mt-1 font-display text-2xl font-extrabold">{role === 'admin' ? 'Vue d’ensemble' : 'Votre activité, en un coup d’œil.'}</h2></div><p className="inline-flex items-center gap-2 text-xs text-faso-muted"><CalendarDays className="h-4 w-4" />{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date())}</p></div>
    {loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><div className="h-28 animate-pulse rounded-3xl bg-white" /><div className="h-28 animate-pulse rounded-3xl bg-white" /></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{getStats(role, summary).map(({ label, value, hint, Icon }) => <div className="card-surface p-5" key={label}><div className="flex items-center justify-between"><span className="text-sm font-semibold text-faso-muted">{label}</span><span className="grid h-10 w-10 place-items-center rounded-2xl bg-faso-ivory text-faso-forest"><Icon className="h-5 w-5" /></span></div><p className="mt-5 font-display text-3xl font-extrabold">{value}</p><p className="mt-1 text-xs text-faso-muted">{hint}</p></div>)}</div>}
    <div className="mt-7 grid gap-5 xl:grid-cols-[1.35fr_.65fr]"><div className="card-surface p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h3 className="font-display text-lg font-extrabold">Activité récente</h3><p className="mt-1 text-xs text-faso-muted">Données enregistrées dans votre espace</p></div><Link to={`/${role}/${role === 'courier' ? 'deliveries' : 'orders'}`} className="text-xs font-bold text-faso-forest">Tout voir</Link></div>{loading ? <p className="text-sm text-faso-muted">Chargement…</p> : recent.length ? <div className="divide-y divide-faso-line">{recent.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-bold">{role === 'courier' ? `Course #${item.id.slice(0, 7)}` : `Commande #${item.id.slice(0, 7)}`}</p><p className="mt-1 text-xs text-faso-muted">{formatDate(item.created_at)} · {statusLabels[item.status] ?? item.status}</p></div><strong className="text-sm text-faso-forest">{formatXof(item.total_xof ?? item.fee_xof ?? 0)}</strong></div>)}</div> : <EmptyState title="Pas encore d’activité"><p>Les commandes et mises à jour de votre activité apparaîtront ici.</p></EmptyState>}</div>
      <div className="rounded-3xl bg-faso-forest p-6 text-white"><span className="badge-soft !bg-white/10 !text-faso-saffron">À faire ensuite</span><h3 className="mt-4 font-display text-xl font-extrabold">{role === 'merchant' ? 'Mettez votre boutique en mouvement.' : role === 'courier' ? 'Choisissez vos prochaines courses.' : role === 'admin' ? 'Gardez un œil sur la plateforme.' : 'Trouvez quelque chose qui vous plaît.'}</h3><p className="mt-2 text-sm leading-6 text-white/70">{role === 'merchant' ? 'Ajoutez vos premiers produits et préparez votre vitrine.' : role === 'courier' ? 'Consultez les courses disponibles et indiquez votre zone.' : role === 'admin' ? 'Vérifiez les paiements manuels en attente et les signalements.' : 'Parcourez les boutiques locales et gardez vos coups de cœur.'}</p><Link to={role === 'merchant' ? '/merchant/products' : role === 'courier' ? '/courier/deliveries' : role === 'admin' ? '/admin/payments' : '/marketplace'} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-faso-forest">{role === 'merchant' ? 'Gérer mes produits' : role === 'courier' ? 'Voir les courses' : role === 'admin' ? 'Voir les validations' : 'Explorer le marché'} <ArrowRight className="h-4 w-4" /></Link></div>
    </div>
  </div>;
}

function getStats(role: AppRole, s: Summary): { label: string; value: string; hint: string; Icon: LucideIcon }[] {
  if (role === 'client') return [{ label: 'Commandes', value: String(s.orders), hint: 'Votre historique', Icon: ShoppingBag }, { label: 'Favoris', value: String(s.favorites), hint: 'Produits enregistrés', Icon: Heart }];
  if (role === 'merchant') return [{ label: 'Produits', value: String(s.products), hint: 'Dans votre catalogue', Icon: Box }, { label: 'Commandes', value: String(s.orders), hint: 'Reçues par votre boutique', Icon: ShoppingBag }];
  if (role === 'courier') return [{ label: 'Courses', value: String(s.deliveries), hint: 'Dans votre historique', Icon: Truck }, { label: 'Revenus', value: '—', hint: 'Calculés à partir des courses livrées', Icon: CircleDollarSign }];
  return [{ label: 'Comptes', value: String(s.users), hint: 'Profils enregistrés', Icon: Users }, { label: 'Boutiques', value: String(s.shops), hint: 'Demandes et boutiques', Icon: Store }, { label: 'À vérifier', value: String(s.payments), hint: 'Paiements manuels en attente', Icon: ShieldCheck }];
}

function OrdersPanel({ role, title }: { role: AppRole; title: string }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<RecentRow[]>([]);
  useEffect(() => {
    if (!supabase || !user) return;
    const load = async () => {
      const table = role === 'courier' ? 'deliveries' : 'orders';
      if (role === 'merchant') {
        const shop = await supabase!.from('shops').select('id').eq('owner_id', user.id).maybeSingle();
        if (!shop.data?.id) return setRows([]);
        const result = await supabase!.from(table).select('*').eq('shop_id', shop.data.id).order('created_at', { ascending: false }).limit(50);
        setRows((result.data as RecentRow[] | null) ?? []); return;
      }
      const column = role === 'courier' ? 'courier_id' : 'customer_id';
      const result = await supabase!.from(table).select('*').eq(column, user.id).order('created_at', { ascending: false }).limit(50);
      setRows((result.data as RecentRow[] | null) ?? []);
    };
    void load();
  }, [role, user]);
  return <section><h2 className="font-display text-2xl font-extrabold">{title}</h2><p className="mt-2 text-sm text-faso-muted">Statuts affichés depuis les enregistrements FasoFlow.</p><div className="mt-6">{rows.length ? <div className="overflow-x-auto rounded-3xl border border-faso-line bg-white"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-faso-ivory text-xs uppercase text-faso-muted"><tr><th className="p-4">Référence</th><th className="p-4">Date</th><th className="p-4">Statut</th><th className="p-4 text-right">Montant</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-faso-line"><td className="p-4 font-bold">#{row.id.slice(0, 8)}</td><td className="p-4 text-faso-muted">{formatDate(row.created_at)}</td><td className="p-4"><span className="badge-soft">{statusLabels[row.status] ?? row.status}</span></td><td className="p-4 text-right font-bold">{formatXof(row.total_xof ?? row.fee_xof ?? 0)}</td></tr>)}</tbody></table></div> : <EmptyState title="Aucun enregistrement"><p>Votre activité apparaîtra ici dès qu’une commande ou une course sera créée.</p></EmptyState>}</div></section>;
}

function FavoritesPanel({ userId }: { userId: string }) {
  const [rows, setRows] = useState<{ product: Product; favoriteId: string }[]>([]);
  useEffect(() => {
    if (!supabase || !userId) return;
    const load = async () => { const { data } = await supabase!.from('favorites').select('id,products(*)').eq('user_id', userId); setRows(((data ?? []) as unknown as { id: string; products: Product }[]).filter((x) => x.products).map((x) => ({ favoriteId: x.id, product: x.products }))); };
    void load();
  }, [userId]);
  return <section><h2 className="font-display text-2xl font-extrabold">Mes favoris</h2><div className="mt-6">{rows.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <div key={row.favoriteId}><ProductCard product={row.product} /><button className="mt-2 text-xs font-bold text-faso-terracotta" onClick={async () => { await supabase?.from('favorites').delete().eq('id', row.favoriteId); setRows((prev) => prev.filter((x) => x.favoriteId !== row.favoriteId)); toast.success('Retiré des favoris.'); }}>Retirer des favoris</button></div>)}</div> : <EmptyState title="Vos coups de cœur seront ici"><Link to="/marketplace" className="font-bold text-faso-forest">Parcourir la marketplace</Link></EmptyState>}</div></section>;
}

function ProfileSettings() {
  const { user, profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState(Boolean(profile?.is_available));
  useEffect(() => { setAvailable(Boolean(profile?.is_available)); }, [profile?.is_available]);
  async function setCourierAvailability(next: boolean) { if (!supabase) return; setBusy(true); const { error } = await supabase.rpc('set_courier_availability', { p_available: next, p_zone: profile?.city ?? null }); setBusy(false); if (error) toast.error(error.message); else { setAvailable(next); await refreshProfile(); toast.success(next ? 'Disponibilité activée.' : 'Disponibilité désactivée.'); } }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!supabase || !user) return; const form = new FormData(event.currentTarget); setBusy(true); const { error } = await supabase.from('profiles').update({ full_name: String(form.get('full_name')), phone: String(form.get('phone') || '') || null, city: String(form.get('city') || '') || null }).eq('id', user.id); setBusy(false); if (error) toast.error(error.message); else { await refreshProfile(); toast.success('Profil mis à jour.'); } }
  return <section className="max-w-2xl"><h2 className="font-display text-2xl font-extrabold">Mon profil</h2><p className="mt-2 text-sm text-faso-muted">Vos informations de compte et coordonnées de contact.</p><form onSubmit={submit} className="card-surface mt-6 p-6"><label className="label">Nom complet<input className="field" name="full_name" defaultValue={profile?.full_name ?? ''} required maxLength={120} /></label><label className="label mt-4">E-mail<input className="field" value={user?.email ?? ''} readOnly disabled /></label><label className="label mt-4">Téléphone<input className="field" name="phone" defaultValue={profile?.phone ?? ''} maxLength={32} /></label><label className="label mt-4">Ville / zone<input className="field" name="city" defaultValue={profile?.city ?? ''} maxLength={100} /></label><button disabled={busy} className="btn-primary mt-6">{busy ? 'Enregistrement…' : 'Enregistrer les modifications'}</button></form>{profile?.role === 'courier' && <><div className="card-surface mt-5 flex flex-wrap items-center justify-between gap-4 p-5"><div><h3 className="font-bold">Disponibilité livreur</h3><p className="mt-1 text-sm text-faso-muted">Une course ne peut être acceptée que lorsque vous êtes disponible. La géolocalisation n’est pas activée.</p></div><button disabled={busy} className={available ? 'btn-secondary' : 'btn-primary'} onClick={() => void setCourierAvailability(!available)}>{available ? 'Désactiver' : 'Me rendre disponible'}</button></div><CourierPreferenceSettings /></>}</section>;
}

function MerchantOrdersPanel() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<{ id: string; status: string; total_xof: number; created_at: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => { if (!supabase || !user) return; const { data: shop } = await supabase.from('shops').select('id').eq('owner_id', user.id).maybeSingle(); if (!shop) { setOrders([]); return; } const { data, error } = await supabase.from('orders').select('id,status,total_xof,created_at').eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(60); if (error) toast.error(error.message); else setOrders(data ?? []); }, [user]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function move(id: string, next: string) { if (!supabase) return; setBusy(id); const { error } = await supabase.rpc('merchant_update_order_status', { p_order_id: id, p_status: next }); setBusy(null); if (error) toast.error(error.message); else { toast.success('Statut de commande mis à jour.'); await refresh(); } }
  return <section><h2 className="font-display text-2xl font-extrabold">Commandes de la boutique</h2><p className="mt-2 text-sm text-faso-muted">Chaque transition est vérifiée côté base. La commande et son paiement sont deux statuts distincts.</p><div className="mt-5 grid gap-3">{orders.length ? orders.map((order) => <article key={order.id} className="card-surface flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-bold">Commande #{order.id.slice(0, 8)}</p><p className="mt-1 text-xs text-faso-muted">{formatDate(order.created_at)} · {formatXof(order.total_xof)} · {statusLabels[order.status] ?? order.status}</p></div><div className="flex flex-wrap gap-2">{order.status === 'pending' && <><button disabled={busy === order.id} className="btn-primary !min-h-9 !px-3 !py-2" onClick={() => void move(order.id,'accepted')}>Accepter</button><button disabled={busy === order.id} className="btn-secondary !min-h-9 !px-3 !py-2" onClick={() => void move(order.id,'cancelled')}>Refuser</button></>}{order.status === 'accepted' && <button disabled={busy === order.id} className="btn-primary !min-h-9 !px-3 !py-2" onClick={() => void move(order.id,'preparing')}>Préparer</button>}{order.status === 'preparing' && <button disabled={busy === order.id} className="btn-primary !min-h-9 !px-3 !py-2" onClick={() => void move(order.id,'ready_for_delivery')}>Prête pour livraison</button>}{order.status === 'ready_for_delivery' && <span className="badge-soft self-center">En attente d’un livreur</span>}{order.status === 'in_delivery' && <span className="badge-soft self-center">Livraison en cours</span>}</div></article>) : <EmptyState title="Aucune commande reçue"><p>Les commandes déposées auprès de votre boutique apparaîtront ici.</p></EmptyState>}</div></section>;
}

function NotificationsPanel() {
  const { user } = useAuth();
  const [items, setItems] = useState<{ id: string; title: string; body: string; read_at: string | null; created_at: string; link: string | null }[]>([]);
  useEffect(() => { if (!supabase || !user) return; void supabase.from('notifications').select('id,title,body,read_at,created_at,link').eq('user_id', user.id).order('created_at', { ascending: false }).limit(60).then(({ data }) => setItems(data ?? [])); }, [user]);
  async function markRead(id: string) { if (!supabase) return; const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id); if (!error) setItems((old) => old.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item)); }
  return <section><h2 className="font-display text-2xl font-extrabold">Notifications</h2><div className="mt-5 grid gap-3">{items.length ? items.map((item) => <article key={item.id} className={`rounded-2xl border bg-white p-4 ${item.read_at ? 'border-faso-line' : 'border-faso-forest/30'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{item.title}</p><p className="mt-1 text-sm leading-6 text-faso-muted">{item.body}</p><p className="mt-2 text-xs text-faso-muted">{formatDate(item.created_at)}</p></div>{!item.read_at && <button onClick={() => void markRead(item.id)} className="text-xs font-bold text-faso-forest">Marquer lue</button>}</div>{item.link && <Link to={item.link} className="mt-2 inline-flex text-xs font-bold text-faso-forest">Ouvrir <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>}</article>) : <EmptyState title="Vous êtes à jour"><p>Vos confirmations, commandes et réponses apparaîtront ici.</p></EmptyState>}</div></section>;
}

function ReviewsPanel({ role }: { role: AppRole }) {
  const { user } = useAuth();
  const [orders, setOrders] = useState<{ id: string; shop_id: string; created_at: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (!supabase || !user) return; if (role === 'client') void supabase.from('orders').select('id,shop_id,created_at').eq('customer_id', user.id).eq('status', 'delivered').order('created_at', { ascending: false }).then(({ data }) => setOrders(data ?? [])); }, [user, role]);
  async function submit(orderId: string, shopId: string, form: FormData) { if (!supabase || !user) return; setBusy(orderId); const { error } = await supabase.from('reviews').insert({ order_id: orderId, shop_id: shopId, customer_id: user.id, rating: Number(form.get('rating')), comment: String(form.get('comment') ?? '') }); setBusy(null); if (error) toast.error(error.message); else { toast.success('Merci pour votre avis.'); setOrders((old) => old.filter((order) => order.id !== orderId)); } }
  if (role !== 'client') return <section><h2 className="font-display text-2xl font-extrabold">Avis clients</h2><p className="mt-2 text-sm text-faso-muted">Les avis publiés sont accessibles aux visiteurs de votre boutique.</p><EmptyState title="Aucun avis récent" /></section>;
  return <section><h2 className="font-display text-2xl font-extrabold">Évaluer une commande</h2><p className="mt-2 text-sm text-faso-muted">Seules les commandes marquées livrées peuvent recevoir un avis.</p><div className="mt-5 grid gap-3">{orders.length ? orders.map((order) => <form key={order.id} className="card-surface grid gap-3 p-4 sm:grid-cols-[1fr_120px_auto]" onSubmit={(event) => { event.preventDefault(); void submit(order.id, order.shop_id, new FormData(event.currentTarget)); }}><div><p className="font-bold">Commande #{order.id.slice(0, 8)}</p><p className="mt-1 text-xs text-faso-muted">Livrée le {formatDate(order.created_at)}</p></div><select name="rating" className="field" defaultValue="5"><option value="5">5 étoiles</option><option value="4">4 étoiles</option><option value="3">3 étoiles</option><option value="2">2 étoiles</option><option value="1">1 étoile</option></select><button disabled={busy === order.id} className="btn-primary !min-h-10">Publier</button><textarea name="comment" className="field min-h-20 sm:col-span-3" maxLength={2000} placeholder="Votre avis (facultatif)" /></form>) : <EmptyState title="Aucune évaluation à rédiger"><p>Les commandes terminées pourront être évaluées ici.</p></EmptyState>}</div></section>;
}
