import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Shield, Store, Users, PackageCheck, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { EmptyState, SetupNotice } from '../../components/ui/Callout';
import { formatDate, statusLabels } from '../../lib/utils';

interface AdminRow { id: string; name?: string; full_name?: string; role?: string; city?: string; status?: string; created_at?: string; owner_id?: string; shop_id?: string; reason?: string; target_type?: string; product_id?: string; user_id?: string; price_xof?: number; total_xof?: number; fee_xof?: number; current_period_end?: string; plan_id?: string; target_id?: string; customer_id?: string; order_id?: string }
const sections: Record<string, { title: string; table: string; icon: typeof Users; columns: string[] }> = {
  users: { title: 'Utilisateurs', table: 'profiles', icon: Users, columns: ['id', 'full_name', 'role', 'city', 'created_at'] },
  shops: { title: 'Boutiques à gérer', table: 'shops', icon: Store, columns: ['id', 'name', 'city', 'status', 'created_at'] },
  products: { title: 'Modération des produits', table: 'products', icon: PackageCheck, columns: ['id', 'name', 'price_xof', 'status', 'shop_id', 'created_at'] },
  reports: { title: 'Signalements', table: 'reports', icon: Flag, columns: ['id', 'target_type', 'target_id', 'reason', 'status', 'created_at'] },
  subscriptions: { title: 'Abonnements', table: 'subscriptions', icon: Shield, columns: ['id', 'user_id', 'plan_id', 'status', 'current_period_end'] },
  orders: { title: 'Commandes', table: 'orders', icon: PackageCheck, columns: ['id', 'customer_id', 'shop_id', 'status', 'total_xof', 'created_at'] },
  deliveries: { title: 'Livraisons', table: 'deliveries', icon: PackageCheck, columns: ['id', 'order_id', 'courier_id', 'status', 'fee_xof', 'created_at'] },
};

export function AdminOperationsPage() {
  const [section, setSection] = useState('users');
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [busy, setBusy] = useState<string | null>(null);
  const config = sections[section] ?? sections.users;
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from(config.table).select(config.columns.join(',')).order('created_at', { ascending: false }).limit(100);
    if (error) toast.error(`Chargement impossible : ${error.message}`);
    setRows((data as AdminRow[] | null) ?? []); setLoading(false);
  }, [config]);
  useEffect(() => { setLoading(true); void refresh(); }, [refresh]);
  async function changeStatus(row: AdminRow, status: string) {
    if (!supabase) return;
    setBusy(row.id);
    let result: { error: { message: string } | null };
    if (section === 'shops') result = await supabase.rpc('admin_set_shop_status', { p_shop_id: row.id, p_status: status });
    else if (section === 'products') result = await supabase.rpc('admin_set_product_status', { p_product_id: row.id, p_status: status });
    else if (section === 'users') result = await supabase.rpc('admin_set_profile_role', { p_user_id: row.id, p_role: status });
    else if (section === 'reports') result = await supabase.rpc('admin_review_report', { p_report_id: row.id, p_status: status, p_note: '' });
    else if (section === 'orders') result = await supabase.rpc('merchant_update_order_status', { p_order_id: row.id, p_status: status });
    else { setBusy(null); toast.info('Les livraisons et abonnements affichent leur statut; leurs transitions sont réservées aux parcours métier.'); return; }
    setBusy(null);
    if (result.error) toast.error(`Modification refusée : ${result.error.message}`); else { toast.success('Modification enregistrée.'); await refresh(); }
  }
  if (!isSupabaseConfigured) return <section><h2 className="font-display text-2xl font-extrabold">Administration</h2><div className="mt-5"><SetupNotice /></div></section>;

  const Icon = config.icon;
  return <section><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Accès administrateur</p><h2 className="mt-1 flex items-center gap-2 font-display text-2xl font-extrabold"><Icon className="h-6 w-6 text-faso-forest" />{config.title}</h2><p className="mt-2 text-sm text-faso-muted">Actions sensibles effectuées par fonctions RPC protégées côté base.</p></div><button onClick={() => void refresh()} className="btn-secondary !min-h-10 !px-3 !py-2"><RefreshCw className="h-4 w-4" />Actualiser</button></div>
    <div className="mt-5 flex flex-wrap gap-2">{Object.entries(sections).map(([key, item]) => <button key={key} onClick={() => setSection(key)} className={`rounded-full px-4 py-2 text-xs font-bold ${section === key ? 'bg-faso-forest text-white' : 'border border-faso-line bg-white text-faso-muted'}`}>{item.title.split(' ')[0]}</button>)}</div>
    <div className="mt-5">{loading ? <div className="h-40 animate-pulse rounded-3xl bg-white" /> : rows.length ? <div className="grid gap-3">{rows.map((row) => <article key={row.id} className="rounded-2xl border border-faso-line bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="font-bold">{row.full_name || row.name || `${section.slice(0, -1)} #${row.id.slice(0, 8)}`}</p><p className="mt-1 text-xs text-faso-muted">{row.city || row.target_type || row.shop_id || row.user_id || row.reason || `#${row.id.slice(0, 12)}`}</p><p className="mt-1 text-xs text-faso-muted">{row.created_at ? formatDate(row.created_at) : ''}</p></div><div className="flex flex-wrap items-center gap-2"><span className="badge-soft">{statusLabels[row.status ?? row.role ?? ''] ?? row.status ?? row.role ?? 'Enregistré'}</span>{section === 'users' && <select className="field !w-auto !py-2 text-xs" value={row.role} disabled={busy === row.id} onChange={(e) => void changeStatus(row, e.target.value)}><option value="client">Client</option><option value="merchant">Commerçant</option><option value="courier">Livreur</option><option value="admin">Admin</option></select>}{section === 'shops' && <select className="field !w-auto !py-2 text-xs" value={row.status} disabled={busy === row.id} onChange={(e) => void changeStatus(row, e.target.value)}><option value="pending_review">À valider</option><option value="active">Activer</option><option value="suspended">Suspendre</option><option value="rejected">Rejeter</option></select>}{section === 'products' && <select className="field !w-auto !py-2 text-xs" value={row.status} disabled={busy === row.id} onChange={(e) => void changeStatus(row, e.target.value)}><option value="pending_review">À valider</option><option value="active">Publier</option><option value="rejected">Rejeter</option><option value="archived">Archiver</option></select>}{section === 'reports' && <select className="field !w-auto !py-2 text-xs" value={row.status} disabled={busy === row.id} onChange={(e) => void changeStatus(row, e.target.value)}><option value="open">Ouvert</option><option value="in_review">En cours</option><option value="resolved">Résolu</option><option value="rejected">Rejeté</option></select>}{section === 'orders' && row.status === 'pending' && <button className="btn-primary !min-h-9 !px-3 !py-2" onClick={() => void changeStatus(row, 'accepted')}>Confirmer</button>}</div></div>{section === 'products' && typeof row.price_xof === 'number' && <p className="mt-2 text-sm font-bold text-faso-forest">{new Intl.NumberFormat('fr-FR',{style:'currency',currency:'XOF',maximumFractionDigits:0}).format(row.price_xof)}</p>}</article>)}</div> : <EmptyState title={`Aucun élément dans « ${config.title} »`}><p>Les éléments apparaîtront ici au fur et à mesure de l’activité FasoFlow.</p></EmptyState>}</div>
  </section>;
}
