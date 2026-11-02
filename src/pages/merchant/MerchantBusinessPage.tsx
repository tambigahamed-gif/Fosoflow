import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, BarChart3, Boxes, CircleDollarSign, PackageCheck, Plus, RefreshCw, ShoppingBag, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../app/auth';
import { EmptyState, SetupNotice } from '../../components/ui/Callout';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { formatDate, formatXof, statusLabels } from '../../lib/utils';
import type { BusinessExpense, BusinessOrder, BusinessPeriod, Product, StockMovement } from '../../types';
import { aggregateTopProducts, buildMonthlyPaidTrend, buildPeriodTrend, calculateBusinessMetrics, canShowEstimatedProfit, getPeriodBounds, type BusinessTruncation } from '../../features/business/businessMath';
import { loadBusinessData, type BusinessData } from '../../features/business/businessData';
import { Link } from 'react-router-dom';
import { checkMerchantBusinessAccess } from '../../features/business/access';

const periods: { value: BusinessPeriod; label: string }[] = [
  { value: 'day', label: 'Journalier' },
  { value: 'week', label: 'Hebdomadaire' },
  { value: 'month', label: 'Mensuel' },
];
const paymentLabels: Record<string, string> = { paid: 'Payée — encaissée', refunded: 'Remboursée', pending: 'Paiement en attente', unpaid: 'Non réglée' };
const movementLabels: Record<StockMovement['movement_type'], string> = { order_sale: 'Sortie — commande', order_return: 'Retour — annulation', adjustment: 'Ajustement de stock' };
const truncationLabels: Record<BusinessTruncation, string> = { orders: 'commandes (plafond 2 000)', expenses: 'dépenses (plafond 1 000)', products: 'produits (plafond 500)', order_items: 'lignes de commande (plafond 1 000)', stock_movements: 'mouvements de stock (plafond 100)' };

function AccessibleBarChart({ title, points }: { title: string; points: { label: string; value: number }[] }) {
  const maximum = Math.max(...points.map((point) => point.value), 1);
  return <div>
    <div role="img" aria-label={`${title}. ${points.map((point) => `${point.label} : ${formatXof(point.value)}`).join('; ')}`} className="mt-5 flex min-h-44 items-end gap-1 border-b border-l border-faso-line px-2 pb-2">
      {points.map((point) => <div key={point.label} className="flex h-40 min-w-0 flex-1 flex-col justify-end" aria-hidden="true"><div className="mx-auto w-full max-w-7 rounded-t-md bg-faso-forest/80" style={{ height: `${Math.max(point.value === 0 ? 0 : 4, (point.value / maximum) * 100)}%` }} /><span className="mt-1 truncate text-center text-[9px] text-faso-muted">{point.label}</span></div>)}
    </div>
    <details className="mt-2 text-xs text-faso-muted"><summary className="w-fit cursor-pointer font-semibold underline">Consulter les données du graphique</summary><div className="mt-2 overflow-x-auto"><table className="w-full text-left"><caption className="sr-only">{title}</caption><thead><tr><th scope="col" className="py-1 pr-4">Période</th><th scope="col" className="py-1">Encaissements confirmés</th></tr></thead><tbody>{points.map((point) => <tr key={point.label}><th scope="row" className="py-1 pr-4 font-medium">{point.label}</th><td className="py-1">{formatXof(point.value)}</td></tr>)}</tbody></table></div></details>
  </div>;
}

function MetricCard({ title, amount, caption, icon: Icon, tone = 'green' }: { title: string; amount: string; caption: string; icon: typeof Wallet; tone?: 'green' | 'amber' | 'ink' }) {
  const tones = { green: 'bg-emerald-50 text-emerald-800', amber: 'bg-amber-50 text-amber-900', ink: 'bg-faso-ivory text-faso-forest' };
  return <article className="rounded-2xl border border-faso-line bg-white p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-faso-muted">{title}</p><p className="mt-2 font-display text-xl font-extrabold sm:text-2xl">{amount}</p></div><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" aria-hidden="true" /></span></div><p className="mt-2 text-xs leading-relaxed text-faso-muted">{caption}</p></article>;
}

function canAdvance(status: BusinessOrder['status']) {
  if (status === 'pending') return { next: 'accepted', label: 'Accepter' };
  if (status === 'accepted') return { next: 'preparing', label: 'Démarrer la préparation' };
  if (status === 'preparing') return { next: 'ready_for_delivery', label: 'Prête pour livraison' };
  return null;
}

export function MerchantBusinessPage() {
  const { user } = useAuth();
  const [data, setData] = useState<BusinessData | null>(null);
  const [period, setPeriod] = useState<BusinessPeriod>('month');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [busyExpense, setBusyExpense] = useState(false);
  const [error, setError] = useState('');
  const [access, setAccess] = useState<'loading' | 'allowed' | 'locked' | 'error'>('loading');

  const refresh = useCallback(async () => {
    if (!user || !supabase) return;
    setError('');
    setLoading(true);
    try {
      const allowed = await checkMerchantBusinessAccess(supabase, user.id);
      if (!allowed) { setAccess('locked'); setData(null); return; }
      setAccess('allowed');
      setData(await loadBusinessData(user.id));
    }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'Erreur inattendue'; setAccess('error'); setError(message); toast.error(`Données Business impossibles à charger : ${message}`); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const metrics = useMemo(() => data ? calculateBusinessMetrics(data.orders, data.items, data.expenses, period) : null, [data, period]);
  const bounds = useMemo(() => getPeriodBounds(period), [period]);
  const periodOrders = useMemo(() => data?.orders.filter((order) => {
    const time = new Date(order.created_at).getTime();
    return time >= bounds.start.getTime() && time < bounds.end.getTime();
  }) ?? [], [data, bounds]);
  const recentExpenses = useMemo(() => data?.expenses.filter((expense) => {
    const time = new Date(expense.spent_at).getTime();
    return time >= bounds.start.getTime() && time < bounds.end.getTime();
  }) ?? [], [data, bounds]);
  const trend = useMemo(() => data ? buildPeriodTrend(data.orders, period) : [], [data, period]);
  const monthlyTrend = useMemo(() => data ? buildMonthlyPaidTrend(data.orders) : [], [data]);
  const topProducts = useMemo(() => data ? aggregateTopProducts(periodOrders, data.items) : [], [data, periodOrders]);
  const clients = useMemo(() => {
    const byCustomer = new Map<string, { orders: number; paidXof: number; latestOrder: BusinessOrder }>();
    periodOrders.filter((order) => order.status !== 'cancelled' && order.status !== 'delivery_cancelled').forEach((order) => {
      const current = byCustomer.get(order.customer_id);
      if (!current) byCustomer.set(order.customer_id, { orders: 1, paidXof: order.payment_status === 'paid' ? order.subtotal_xof : 0, latestOrder: order });
      else {
        current.orders += 1;
        if (order.payment_status === 'paid') current.paidXof += order.subtotal_xof;
        if (order.created_at > current.latestOrder.created_at) current.latestOrder = order;
      }
    });
    const rows = [...byCustomer.entries()].map(([id, value]) => ({ id, ...value })).sort((a, b) => b.latestOrder.created_at.localeCompare(a.latestOrder.created_at));
    return { unique: byCustomer.size, repeat: [...byCustomer.values()].filter((value) => value.orders > 1).length, rows };
  }, [periodOrders]);
  const lowStock = useMemo(() => data?.products.filter((product) => product.status === 'active' && product.stock_quantity <= 5) ?? [], [data]);
  const orderList = useMemo(() => [...periodOrders].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12), [periodOrders]);
  const expensesInScope = useMemo(() => [...recentExpenses].sort((a, b) => b.spent_at.localeCompare(a.spent_at)).slice(0, 8), [recentExpenses]);
  const movementsInScope = useMemo(() => (data?.movements ?? []).filter((movement) => {
    const time = new Date(movement.created_at).getTime();
    return time >= bounds.start.getTime() && time < bounds.end.getTime();
  }).slice(0, 10), [data, bounds]);
  const customerAlias = useMemo(() => new Map([...new Set(periodOrders.map((order) => order.customer_id))].sort().map((id, index) => [id, `Client ${String(index + 1).padStart(3, '0')}`])), [periodOrders]);
  const profitAvailable = Boolean(metrics && data && canShowEstimatedProfit(data.migrationMissing, data.truncated, metrics));

  if (!isSupabaseConfigured) return <section><h2 className="font-display text-2xl font-extrabold">FasoFlow Business</h2><div className="mt-5"><SetupNotice /></div></section>;

  async function advanceOrder(order: BusinessOrder, nextStatus: string) {
    if (!supabase) return;
    setBusyOrder(order.id);
    const { error: rpcError } = await supabase.rpc('merchant_update_order_status', { p_order_id: order.id, p_status: nextStatus });
    setBusyOrder(null);
    if (rpcError) toast.error(`Commande non modifiée : ${rpcError.message}`);
    else { toast.success('Statut de commande enregistré.'); await refresh(); }
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !data) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const rawDate = String(form.get('spent_at') ?? '');
    const spentAt = rawDate ? new Date(rawDate).toISOString() : new Date().toISOString();
    setBusyExpense(true);
    const { error: insertError } = await supabase.from('business_expenses').insert({
      shop_id: data.shop.id,
      title: String(form.get('title') ?? '').trim(),
      category: String(form.get('category') ?? '').trim() || 'Autre',
      amount_xof: Number(form.get('amount_xof')),
      spent_at: spentAt,
      created_by: user.id,
    });
    setBusyExpense(false);
    if (insertError) toast.error(`Dépense non enregistrée : ${insertError.message}`);
    else { formElement.reset(); toast.success('Dépense enregistrée.'); await refresh(); }
  }

  if (loading) return <section><p className="eyebrow">Gestion commerçant</p><h2 className="mt-1 font-display text-2xl font-extrabold">FasoFlow Business</h2><div className="mt-6 h-48 animate-pulse rounded-3xl bg-white" /></section>;
  if (access === 'locked') return <section><p className="eyebrow">Gestion commerçant</p><h2 className="mt-1 font-display text-2xl font-extrabold">FasoFlow Business</h2><div className="card-surface mt-5 max-w-2xl p-6"><h3 className="font-display text-lg font-extrabold">Rapports avancés réservés à l’offre Business</h3><p className="mt-2 text-sm leading-6 text-faso-muted">L’accès aux coûts privés, dépenses, mouvements de stock et rapports avancés nécessite un abonnement commerçant Business actif à 15 000 FCFA/mois. Vos produits, commandes et historiques sont conservés si l’offre expire.</p><Link className="btn-primary mt-5" to="/merchant/subscription">Voir les offres commerçant</Link></div></section>;
  if (access === 'error') return <section><p className="eyebrow">Gestion commerçant</p><h2 className="mt-1 font-display text-2xl font-extrabold">FasoFlow Business</h2><div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error || 'Impossible de vérifier le plan Business actif.'}</div><button onClick={() => void refresh()} className="btn-secondary mt-4 !min-h-10 !px-3 !py-2"><RefreshCw className="h-4 w-4" />Réessayer</button></section>;
  if (!data) return <section><div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Gestion commerçant</p><h2 className="mt-1 font-display text-2xl font-extrabold">FasoFlow Business</h2></div><button onClick={() => void refresh()} className="btn-secondary !min-h-10 !px-3 !py-2"><RefreshCw className="h-4 w-4" />Réessayer</button></div>{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="mt-6"><EmptyState title="Aucune boutique trouvée"><p>Créez d’abord votre boutique dans la gestion des produits pour consulter vos données Business.</p><a className="btn-primary mt-4" href="/merchant/products">Ouvrir mes produits</a></EmptyState></div></section>;

  return <section className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Gestion commerçant · {data.shop.name}</p><h2 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">FasoFlow Business</h2><p className="mt-2 max-w-2xl text-sm text-faso-muted">Suivi des commandes, encaissements confirmés, dépenses et stocks à partir des données de votre boutique.</p></div><button onClick={() => void refresh()} className="btn-secondary !min-h-10 !px-3 !py-2" aria-label="Actualiser les données"><RefreshCw className="h-4 w-4" />Actualiser</button></header>

    <nav aria-label="Période du rapport" className="flex flex-wrap gap-2">{periods.map((option) => <button key={option.value} onClick={() => setPeriod(option.value)} aria-pressed={period === option.value} className={`rounded-full px-4 py-2 text-sm font-bold ${period === option.value ? 'bg-faso-forest text-white' : 'border border-faso-line bg-white text-faso-muted hover:bg-faso-ivory'}`}>{option.label}</button>)}</nav>

    {data.migrationMissing && <div role="status" className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><div><p className="font-bold">Migration Business 013 requise</p><p className="mt-1">Les commandes et ventes disponibles restent consultables. Les dépenses, l’historique complet de stock ou les coûts d’achat peuvent rester indisponibles tant que `supabase/migrations/013_business_operations.sql` n’a pas été appliquée par l’administrateur de la base.</p></div></div>}
    {data.truncated.length > 0 && <div role="status" className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><div><p className="font-bold">Certaines listes sont partielles</p><p className="mt-1">Plafond atteint : {data.truncated.map((group) => truncationLabels[group]).join(', ')}. Les totaux, graphiques ou listes concernés ne couvrent que les lignes chargées. Le bénéfice est masqué si les commandes, lignes de vente ou dépenses sont incomplètes.</p></div></div>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Certaines données n’ont pas pu être chargées : {error}</p>}

    {metrics && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard title={`Montant des commandes${data.truncated.includes('orders') ? ' (partiel)' : ''}`} amount={`${data.truncated.includes('orders') ? '≥ ' : ''}${formatXof(metrics.orderAmountXof)}`} caption={`${metrics.orderCount} commande(s) non annulée(s), quel que soit le statut du paiement.`} icon={ShoppingBag} />
      <MetricCard title={`Encaissements confirmés${data.truncated.includes('orders') ? ' (partiels)' : ''}`} amount={`${data.truncated.includes('orders') ? '≥ ' : ''}${formatXof(metrics.paidRevenueXof)}`} caption={`${metrics.paidOrderCount} commande(s) avec payment_status = paid. Une livraison seule ne compte jamais comme encaissement.`} icon={CircleDollarSign} tone="green" />
      <MetricCard title={`Livrées, non réglées${data.truncated.includes('orders') ? ' (partiel)' : ''}`} amount={`${data.truncated.includes('orders') ? '≥ ' : ''}${formatXof(metrics.deliveredUnpaidXof)}`} caption={`${metrics.deliveredUnpaidCount} commande(s) livrée(s) mais sans paiement confirmé.`} icon={PackageCheck} tone="amber" />
      <MetricCard title={profitAvailable ? 'Bénéfice estimatif' : 'Bénéfice estimatif indisponible'} amount={profitAvailable ? formatXof(metrics.estimatedProfitXof) : '—'} caption={profitAvailable ? `Ventes payées à coût connu − coûts d’achat − dépenses (${formatXof(metrics.expenseXof)}).` : 'Non calculé tant que les coûts nécessaires, les dépenses ou les lignes de vente sont inconnus ou incomplets.'} icon={Wallet} tone={profitAvailable ? 'ink' : 'amber'} />
    </div>}

    {metrics?.estimatedProfitIncomplete && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">Le bénéfice estimatif n’est pas affiché : {metrics.unknownCostLines} ligne(s) payée(s) ne contiennent pas de coût d’achat figé. Les ventes restent visibles dans les montants de commandes/encaissements ; les coûts historiques manquants ne sont pas inventés ni recalculés.</p>}

    <div className="grid gap-5 xl:grid-cols-2">
      <article className="card-surface p-4 sm:p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-faso-ivory text-faso-forest"><BarChart3 aria-hidden="true" /></span><div><h3 className="font-display text-lg font-extrabold">Rapport {periods.find((item) => item.value === period)?.label.toLowerCase()}</h3><p className="mt-1 text-xs text-faso-muted">Chiffre d’affaires encaissé — commandes payées uniquement.</p></div></div><AccessibleBarChart title="Encaissements confirmés sur la période sélectionnée" points={trend} /></article>
      <article className="card-surface p-4 sm:p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><TrendingUp aria-hidden="true" /></span><div><h3 className="font-display text-lg font-extrabold">Évolution du chiffre d’affaires</h3><p className="mt-1 text-xs text-faso-muted">Encaissements confirmés par mois · six derniers mois.</p></div></div><AccessibleBarChart title="Évolution mensuelle des encaissements confirmés sur six mois" points={monthlyTrend} /></article>
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(270px,1fr)]">
      <article className="card-surface overflow-hidden"><div className="flex flex-wrap items-end justify-between gap-3 p-4 sm:p-5"><div><h3 className="font-display text-lg font-extrabold">Ventes et commandes</h3><p className="mt-1 text-xs text-faso-muted">{orderList.length} commande(s) affichée(s) sur {periodOrders.length} pour la période.</p></div><span className="badge-soft">{periods.find((item) => item.value === period)?.label}</span></div>{orderList.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><caption className="sr-only">Commandes de la période avec montant et état de paiement</caption><thead className="bg-faso-ivory text-xs text-faso-muted"><tr><th scope="col" className="px-4 py-3">Commande / client agrégé</th><th scope="col" className="px-4 py-3">État</th><th scope="col" className="px-4 py-3">Paiement</th><th scope="col" className="px-4 py-3 text-right">Montant</th><th scope="col" className="px-4 py-3">Action</th></tr></thead><tbody>{orderList.map((order) => { const action = canAdvance(order.status); return <tr key={order.id} className="border-t border-faso-line"><th scope="row" className="px-4 py-3 font-semibold"><span className="block">#{order.id.slice(0, 8)}</span><span className="mt-1 block text-xs font-normal text-faso-muted">{customerAlias.get(order.customer_id)} · {formatDate(order.created_at)}</span></th><td className="px-4 py-3">{statusLabels[order.status] ?? order.status}</td><td className="px-4 py-3"><span className={order.payment_status === 'paid' ? 'font-semibold text-emerald-800' : 'text-faso-muted'}>{paymentLabels[order.payment_status] ?? order.payment_status}</span></td><td className="whitespace-nowrap px-4 py-3 text-right font-bold">{formatXof(order.total_xof)}</td><td className="px-4 py-3">{action ? <div className="flex gap-2"><button disabled={busyOrder === order.id} className="btn-secondary !min-h-8 !px-2 !py-1 text-xs" onClick={() => void advanceOrder(order, action.next)}>{busyOrder === order.id ? '…' : action.label}</button>{(order.status === 'pending' || order.status === 'accepted' || order.status === 'preparing') && <button disabled={busyOrder === order.id} className="rounded-lg px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-50" onClick={() => void advanceOrder(order, 'cancelled')}>Annuler</button>}</div> : <span className="text-xs text-faso-muted">—</span>}</td></tr>; })}</tbody></table></div> : <div className="p-4"><EmptyState title="Aucune commande sur cette période"><p>Les commandes issues de Supabase apparaîtront ici.</p></EmptyState></div>}</article>
      <article className="card-surface p-4 sm:p-5">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-faso-ivory text-faso-forest"><Boxes aria-hidden="true" /></span><div><h3 className="font-display text-lg font-extrabold">Clients et fidélité</h3><p className="text-xs text-faso-muted">Activité agrégée de la période, sans nom ni coordonnées.</p></div></div>
        <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-faso-ivory p-3"><p className="text-xs text-faso-muted">Clients distincts</p><p className="mt-1 font-display text-2xl font-extrabold">{clients.unique}</p></div><div className="rounded-xl bg-faso-ivory p-3"><p className="text-xs text-faso-muted">Récurrents</p><p className="mt-1 font-display text-2xl font-extrabold">{clients.repeat}</p></div></div>
        {clients.rows.length ? <ul className="mt-4 divide-y divide-faso-line">{clients.rows.slice(0, 6).map((client) => <li key={client.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-semibold">{customerAlias.get(client.id) ?? 'Client'}</p><p className="mt-1 text-xs text-faso-muted">{client.orders} commande(s) · dernière activité {formatDate(client.latestOrder.created_at)}</p></div><div className="shrink-0 text-right"><p className="text-xs text-faso-muted">Payé</p><p className="font-bold">{formatXof(client.paidXof)}</p></div></li>)}</ul> : <p className="mt-4 text-sm text-faso-muted">Aucun client avec commande non annulée sur cette période.</p>}
        <p className="mt-3 text-xs leading-relaxed text-faso-muted">Les comptes sont dédupliqués uniquement pour ce tableau ; l’identifiant client est masqué. Les montants ne comptent que les sous-totaux de commandes au statut payé.</p>
        <Link className="mt-4 inline-flex text-sm font-bold text-faso-forest" to="/merchant/orders">Ouvrir la gestion des commandes</Link>
      </article>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <article className="card-surface p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-display text-lg font-extrabold">Produits les plus vendus</h3><p className="mt-1 text-xs text-faso-muted">Classement par unités vendues et payées sur la période.</p></div><ShoppingBag className="h-5 w-5 text-faso-forest" aria-hidden="true" /></div>{topProducts.length ? <ol className="mt-4 space-y-3">{topProducts.map((product, index) => <li key={product.product_name_snapshot} className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-faso-ivory text-sm font-extrabold text-faso-forest">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{product.product_name_snapshot}</p><p className="text-xs text-faso-muted">{product.quantity} unité(s) · {formatXof(product.salesXof)} encaissés</p></div></li>)}</ol> : <p className="mt-4 text-sm text-faso-muted">Aucune ligne de vente disponible pour cette période.</p>}</article>
      <article className="card-surface p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-lg font-extrabold">Alertes de stock faible</h3><p className="mt-1 text-xs text-faso-muted">Seuil affiché : 5 unités ou moins, produits actifs.</p></div><AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden="true" /></div>{lowStock.length ? <ul className="mt-4 space-y-2">{lowStock.map((product: Product) => <li key={product.id} className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-sm"><span className="truncate font-semibold">{product.name}</span><span className="shrink-0 font-extrabold text-amber-900">{product.stock_quantity} restant(s)</span></li>)}</ul> : <p className="mt-4 text-sm text-faso-muted">Aucune alerte pour le moment.</p>}</article>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <article className="card-surface p-4 sm:p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-900"><Wallet aria-hidden="true" /></span><div><h3 className="font-display text-lg font-extrabold">Dépenses</h3><p className="text-xs text-faso-muted">Seules les dépenses saisies réduisent l’estimation.</p></div></div><form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={addExpense}><label className="label sm:col-span-2">Libellé<input required minLength={2} maxLength={160} name="title" className="field" placeholder="Ex. transport, emballage" /></label><label className="label">Catégorie<input name="category" maxLength={80} className="field" placeholder="Transport, fournitures…" /></label><label className="label">Montant (FCFA)<input required type="number" min="1" step="1" name="amount_xof" className="field" /></label><label className="label sm:col-span-2">Date de dépense<input name="spent_at" type="datetime-local" className="field" /></label><button disabled={busyExpense || data.migrationMissing} className="btn-primary sm:col-span-2">{busyExpense ? 'Enregistrement…' : <><Plus className="h-4 w-4" />Ajouter la dépense</>}</button></form>{data.migrationMissing && <p className="mt-2 text-xs text-amber-900">Saisie disponible après application de la migration 013.</p>}<div className="mt-5 border-t border-faso-line pt-4"><div className="flex items-center justify-between gap-2"><h4 className="text-sm font-bold">Historique de la période</h4><span className="text-sm font-extrabold">{formatXof(metrics?.expenseXof ?? 0)}</span></div>{expensesInScope.length ? <ul className="mt-3 divide-y divide-faso-line">{expensesInScope.map((expense: BusinessExpense) => <li key={expense.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0"><span className="block truncate font-semibold">{expense.title}</span><span className="text-xs text-faso-muted">{expense.category} · {formatDate(expense.spent_at)}</span></span><span className="shrink-0 font-bold">{formatXof(expense.amount_xof)}</span></li>)}</ul> : <p className="mt-3 text-xs text-faso-muted">Aucune dépense enregistrée pour cette période.</p>}</div></article>
      <article className="card-surface p-4 sm:p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-faso-ivory text-faso-forest"><Boxes aria-hidden="true" /></span><div><h3 className="font-display text-lg font-extrabold">Mouvements de stock</h3><p className="text-xs text-faso-muted">Sorties de commande et restitutions restent liées à la commande quand disponible.</p></div></div>{movementsInScope.length ? <ul className="mt-4 divide-y divide-faso-line">{movementsInScope.map((movement: StockMovement) => <li key={movement.id} className="flex items-start justify-between gap-3 py-3 text-sm"><span className="min-w-0"><span className="block truncate font-semibold">{movement.product_name_snapshot}</span><span className="text-xs text-faso-muted">{movementLabels[movement.movement_type]}{movement.order_id ? ` · commande #${movement.order_id.slice(0, 8)}` : ''} · {formatDate(movement.created_at)} · stock {movement.stock_before} → {movement.stock_after}</span></span><span className={`shrink-0 font-extrabold ${movement.quantity_delta < 0 ? 'text-red-700' : 'text-emerald-800'}`}>{movement.quantity_delta > 0 ? '+' : ''}{movement.quantity_delta}</span></li>)}</ul> : <p className="mt-4 text-sm text-faso-muted">Aucun mouvement historisé pour cette période. La migration 013 journalise automatiquement les variations de stock.</p>}</article>
    </div>
    <p className="text-xs leading-relaxed text-faso-muted">Les rapports utilisent les données visibles de votre boutique dans Supabase. Le statut « livrée » décrit l’exécution de la livraison ; seul `payment_status = paid` est compté comme encaissement. Aucune donnée d’exemple n’est affichée.</p>
  </section>;
}
