import { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, CircleDollarSign, PackageCheck, ShoppingBag, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { formatDate, formatXof } from '../../lib/utils';
import { useAuth } from '../../app/auth';
import { EmptyState, SetupNotice } from '../../components/ui/Callout';

type PlanRow = { code?: string; audience?: string } | { code?: string; audience?: string }[] | null;
type ActivePlanRow = { current_period_end: string | null; plans: PlanRow };
type MerchantOrder = { id: string; status: string; subtotal_xof: number; payment_status: string; created_at: string };
type OrderItem = { order_id: string; product_name_snapshot: string; quantity: number };
type DeliveryRow = { id: string; status: string; fee_xof: number | null; pickup_zone: string; dropoff_zone: string; created_at: string };
type WeekPoint = { label: string; value: number };

function fourWeeks(): WeekPoint[] {
  return [
    { label: 'S−3', value: 0 },
    { label: 'S−2', value: 0 },
    { label: 'S−1', value: 0 },
    { label: '7 derniers jours', value: 0 },
  ];
}

function weekIndex(isoDate: string): number {
  const daysAgo = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
  return Math.max(0, Math.min(3, Math.floor((29 - daysAgo) / 7)));
}

function planDetails(row: ActivePlanRow | null): { code: string; audience: string } | null {
  if (!row || (row.current_period_end && new Date(row.current_period_end).getTime() <= Date.now())) return null;
  const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans;
  return plan?.code && plan.audience ? { code: plan.code, audience: plan.audience } : null;
}

function WeeklyBars({ points, unit }: { points: WeekPoint[]; unit: string }) {
  const max = Math.max(...points.map((point) => point.value), 1);
  return <div className="mt-4 grid grid-cols-4 items-end gap-3" role="img" aria-label={points.map((point) => `${point.label}: ${point.value} ${unit}`).join(', ')}>
    {points.map((point) => <div key={point.label} className="min-w-0 text-center"><div className="flex h-28 items-end justify-center rounded-xl bg-faso-ivory px-2"><div className="w-full max-w-10 rounded-t-lg bg-faso-forest" style={{ height: `${Math.max(6, (point.value / max) * 100)}%` }} title={`${point.value} ${unit}`} /></div><p className="mt-2 truncate text-[10px] font-semibold text-faso-muted">{point.label}</p><p className="text-xs font-bold text-faso-ink">{point.value}</p></div>)}
  </div>;
}

function LockedReport({ role, title }: { role: 'merchant' | 'courier'; title: string }) {
  const href = role === 'merchant' ? '/merchant/subscription' : '/courier/subscription';
  return <div className="card-surface mt-5 max-w-2xl p-6"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-faso-ivory text-faso-forest"><BarChart3 /></span><h3 className="mt-4 font-display text-lg font-extrabold">{title} : fonctionnalité Premium</h3><p className="mt-2 text-sm leading-6 text-faso-muted">Les analyses payantes sont accessibles avec un abonnement actif. Les données restent conservées si votre offre expire ; les fonctions payantes se réactivent après le renouvellement.</p><Link className="btn-primary mt-5" to={href}>Voir les offres <ArrowRight className="h-4 w-4" /></Link></div>;
}

export function MerchantAnalyticsPanel() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<'loading' | 'locked' | 'ready' | 'error'>('loading');
  const [hasShop, setHasShop] = useState(false);
  const [planName, setPlanName] = useState('Premium');
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [topItems, setTopItems] = useState<{ name: string; quantity: number }[]>([]);
  const [weeks, setWeeks] = useState<WeekPoint[]>(fourWeeks);

  useEffect(() => {
    const userId = user?.id;
    if (!supabase || !userId) return;
    let current = true;
    const load = async () => {
      const subscription = await supabase!.from('subscriptions').select('current_period_end,plans(code,audience,name)').eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (subscription.error) throw subscription.error;
      const plan = planDetails(subscription.data as ActivePlanRow | null);
      if (!plan || plan.audience !== 'merchant' || !['premium', 'business'].includes(plan.code)) { if (current) setPhase('locked'); return; }
      const nested = Array.isArray(subscription.data?.plans) ? subscription.data?.plans[0] : subscription.data?.plans;
      if (current) setPlanName(nested?.name === 'Business' ? 'Business' : 'Premium');
      const shopResult = await supabase!.from('shops').select('id').eq('owner_id', userId).maybeSingle();
      if (shopResult.error) throw shopResult.error;
      if (!shopResult.data) { if (current) { setHasShop(false); setPhase('ready'); } return; }
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const orderResult = await supabase!.from('orders').select('id,status,subtotal_xof,payment_status,created_at').eq('shop_id', shopResult.data.id).gte('created_at', since).order('created_at', { ascending: false }).limit(500);
      if (orderResult.error) throw orderResult.error;
      const rows = (orderResult.data ?? []) as MerchantOrder[];
      const validOrders = rows.filter((row) => row.status !== 'cancelled');
      let items: OrderItem[] = [];
      if (validOrders.length) {
        const itemResult = await supabase!.from('order_items').select('order_id,product_name_snapshot,quantity').in('order_id', validOrders.map((row) => row.id));
        if (itemResult.error) throw itemResult.error;
        items = (itemResult.data ?? []) as OrderItem[];
      }
      const itemCounts = new Map<string, number>();
      for (const item of items) itemCounts.set(item.product_name_snapshot, (itemCounts.get(item.product_name_snapshot) ?? 0) + Number(item.quantity));
      const popular = [...itemCounts.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
      const trend = fourWeeks();
      for (const row of validOrders) trend[weekIndex(row.created_at)].value += 1;
      if (current) { setHasShop(true); setOrders(rows); setTopItems(popular); setWeeks(trend); setPhase('ready'); }
    };
    void load().catch(() => { if (current) setPhase('error'); });
    return () => { current = false; };
  }, [user?.id]);

  if (!isSupabaseConfigured) return <section><h2 className="font-display text-2xl font-extrabold">Statistiques boutique</h2><div className="mt-5"><SetupNotice /></div></section>;
  if (phase === 'loading') return <div className="card-surface mt-5 h-40 animate-pulse" />;
  if (phase === 'locked') return <section><h2 className="font-display text-2xl font-extrabold">Statistiques boutique</h2><LockedReport role="merchant" title="Les statistiques avancées" /></section>;
  if (phase === 'error') return <section><h2 className="font-display text-2xl font-extrabold">Statistiques boutique</h2><div className="mt-5"><EmptyState title="Les statistiques n’ont pas pu être chargées"><p>Vérifiez la connexion Supabase, puis revenez réessayer.</p></EmptyState></div></section>;
  if (!hasShop) return <section><h2 className="font-display text-2xl font-extrabold">Statistiques boutique</h2><div className="mt-5"><EmptyState title="Créez d’abord votre boutique"><p>Les analyses apparaîtront dès qu’une boutique sera enregistrée.</p><Link to="/merchant/products" className="mt-3 inline-flex font-bold text-faso-forest">Créer ma boutique <ArrowRight className="ml-1 h-4 w-4" /></Link></EmptyState></div></section>;

  const activeOrders = orders.filter((row) => row.status !== 'cancelled');
  const delivered = activeOrders.filter((row) => row.status === 'delivered');
  const recordedValue = delivered.reduce((sum, row) => sum + Number(row.subtotal_xof || 0), 0);
  const pendingPayment = delivered.filter((row) => row.payment_status !== 'paid').length;
  return <section>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Offre active : {planName}</p><h2 className="mt-1 font-display text-2xl font-extrabold">Statistiques boutique</h2><p className="mt-2 text-sm text-faso-muted">Période : 30 derniers jours · {formatDate(new Date(Date.now() - 30 * 86_400_000).toISOString())} à aujourd’hui</p></div><span className="badge-soft">{planName} actif</span></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div className="card-surface p-5"><ShoppingBag className="h-5 w-5 text-faso-forest" /><p className="mt-4 text-sm text-faso-muted">Commandes non annulées</p><p className="mt-1 font-display text-3xl font-extrabold">{activeOrders.length}</p></div>
      <div className="card-surface p-5"><PackageCheck className="h-5 w-5 text-faso-forest" /><p className="mt-4 text-sm text-faso-muted">Commandes marquées livrées</p><p className="mt-1 font-display text-3xl font-extrabold">{delivered.length}</p></div>
      <div className="card-surface p-5"><CircleDollarSign className="h-5 w-5 text-faso-forest" /><p className="mt-4 text-sm text-faso-muted">Valeur des sous-totaux livrés</p><p className="mt-1 font-display text-2xl font-extrabold">{formatXof(recordedValue)}</p><p className="mt-1 text-xs text-faso-muted">Pas une preuve d’encaissement · {pendingPayment} commande(s) non marquée(s) payée(s).</p></div>
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2"><article className="card-surface p-5"><h3 className="font-display text-lg font-extrabold">Commandes par période</h3><p className="mt-1 text-xs text-faso-muted">Nombre de commandes créées sur les quatre dernières semaines</p><WeeklyBars points={weeks} unit="commandes" /></article><article className="card-surface p-5"><h3 className="font-display text-lg font-extrabold">Articles les plus commandés</h3><p className="mt-1 text-xs text-faso-muted">Quantités des commandes non annulées, mêmes 30 jours</p>{topItems.length ? <ol className="mt-4 space-y-3">{topItems.map((item, index) => <li key={item.name} className="flex items-center justify-between gap-3 border-b border-faso-line pb-2 text-sm"><span className="min-w-0 truncate"><span className="mr-2 text-xs text-faso-muted">{index + 1}.</span>{item.name}</span><strong>{item.quantity}</strong></li>)}</ol> : <p className="mt-4 text-sm text-faso-muted">Aucune ligne de commande sur cette période.</p>}</article></div>
  </section>;
}

export function CourierEarningsPanel() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<'loading' | 'locked' | 'ready' | 'error'>('loading');
  const [planName, setPlanName] = useState('Premium');
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [weeks, setWeeks] = useState<WeekPoint[]>(fourWeeks);
  const [topZones, setTopZones] = useState<{ name: string; count: number }[]>([]);

  useEffect(() => {
    const userId = user?.id;
    if (!supabase || !userId) return;
    let current = true;
    const load = async () => {
      const subscription = await supabase!.from('subscriptions').select('current_period_end,plans(code,audience,name)').eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (subscription.error) throw subscription.error;
      const plan = planDetails(subscription.data as ActivePlanRow | null);
      if (!plan || plan.audience !== 'courier' || !['premium', 'pro'].includes(plan.code)) { if (current) setPhase('locked'); return; }
      const nested = Array.isArray(subscription.data?.plans) ? subscription.data?.plans[0] : subscription.data?.plans;
      if (current) setPlanName(nested?.name === 'Pro' ? 'Pro' : 'Premium');
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const result = await supabase!.from('deliveries').select('id,status,fee_xof,pickup_zone,dropoff_zone,created_at').eq('courier_id', userId).gte('created_at', since).order('created_at', { ascending: false }).limit(500);
      if (result.error) throw result.error;
      const deliveries = (result.data ?? []) as DeliveryRow[];
      const completed = deliveries.filter((row) => row.status === 'delivered');
      const trend = fourWeeks();
      for (const row of completed) trend[weekIndex(row.created_at)].value += 1;
      const zoneCounts = new Map<string, number>();
      for (const row of completed) { const key = `${row.pickup_zone || 'Départ à préciser'} → ${row.dropoff_zone || 'Arrivée à préciser'}`; zoneCounts.set(key, (zoneCounts.get(key) ?? 0) + 1); }
      const popular = [...zoneCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
      if (current) { setRows(deliveries); setWeeks(trend); setTopZones(popular); setPhase('ready'); }
    };
    void load().catch(() => { if (current) setPhase('error'); });
    return () => { current = false; };
  }, [user?.id]);

  if (!isSupabaseConfigured) return <section><h2 className="font-display text-2xl font-extrabold">Revenus et statistiques</h2><div className="mt-5"><SetupNotice /></div></section>;
  if (phase === 'loading') return <div className="card-surface mt-5 h-40 animate-pulse" />;
  if (phase === 'locked') return <section><h2 className="font-display text-2xl font-extrabold">Revenus et statistiques</h2><LockedReport role="courier" title="Les statistiques de revenus" /></section>;
  if (phase === 'error') return <section><h2 className="font-display text-2xl font-extrabold">Revenus et statistiques</h2><div className="mt-5"><EmptyState title="Les statistiques n’ont pas pu être chargées"><p>Vérifiez la connexion Supabase, puis revenez réessayer.</p></EmptyState></div></section>;

  const delivered = rows.filter((row) => row.status === 'delivered');
  const priced = delivered.filter((row) => row.fee_xof != null);
  const recordedFees = priced.reduce((sum, row) => sum + Number(row.fee_xof || 0), 0);
  const open = rows.filter((row) => row.status === 'accepted' || row.status === 'in_progress').length;
  return <section>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Offre active : {planName}</p><h2 className="mt-1 font-display text-2xl font-extrabold">Revenus et statistiques</h2><p className="mt-2 text-sm text-faso-muted">Période : 30 derniers jours</p></div><span className="badge-soft">{planName} actif</span></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><div className="card-surface p-5"><Truck className="h-5 w-5 text-faso-forest" /><p className="mt-4 text-sm text-faso-muted">Courses livrées</p><p className="mt-1 font-display text-3xl font-extrabold">{delivered.length}</p></div><div className="card-surface p-5"><CircleDollarSign className="h-5 w-5 text-faso-forest" /><p className="mt-4 text-sm text-faso-muted">Rémunération enregistrée</p><p className="mt-1 font-display text-2xl font-extrabold">{formatXof(recordedFees)}</p><p className="mt-1 text-xs text-faso-muted">Somme des frais renseignés pour les courses livrées, pas preuve de versement.</p></div><div className="card-surface p-5"><PackageCheck className="h-5 w-5 text-faso-forest" /><p className="mt-4 text-sm text-faso-muted">Courses actives</p><p className="mt-1 font-display text-3xl font-extrabold">{open}</p></div></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2"><article className="card-surface p-5"><h3 className="font-display text-lg font-extrabold">Livraisons par semaine</h3><p className="mt-1 text-xs text-faso-muted">Courses marquées livrées, quatre dernières semaines</p><WeeklyBars points={weeks} unit="courses" /></article><article className="card-surface p-5"><h3 className="font-display text-lg font-extrabold">Itinéraires fréquents</h3><p className="mt-1 text-xs text-faso-muted">Trajets enregistrés sur les courses terminées</p>{topZones.length ? <ol className="mt-4 space-y-3">{topZones.map((zone, index) => <li key={zone.name} className="flex items-center justify-between gap-3 border-b border-faso-line pb-2 text-sm"><span className="min-w-0 truncate"><span className="mr-2 text-xs text-faso-muted">{index + 1}.</span>{zone.name}</span><strong>{zone.count}</strong></li>)}</ol> : <p className="mt-4 text-sm text-faso-muted">Aucune course livrée sur cette période.</p>}<p className="mt-4 text-xs text-faso-muted">Montants calculés à partir des frais enregistrés. FasoFlow ne traite pas les versements aux livreurs.</p></article></div>
    {delivered.length > 0 && priced.length < delivered.length && <p className="mt-4 text-xs text-faso-muted">{delivered.length - priced.length} course(s) livrée(s) sans frais renseignés ne sont pas incluses dans le total.</p>}
    {rows.length === 0 && <div className="mt-5"><EmptyState title="Aucune activité sur cette période"><p>Les statistiques apparaîtront après vos premières courses.</p></EmptyState></div>}
  </section>;
}
