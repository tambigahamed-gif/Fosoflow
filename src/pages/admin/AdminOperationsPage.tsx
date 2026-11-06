import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Flag, PackageCheck, RefreshCw, Shield, Store, Users, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { EmptyState, SetupNotice } from '../../components/ui/Callout';
import { formatDate, statusLabels } from '../../lib/utils';

interface AdminRow {
  id: string;
  name?: string;
  display_name?: string;
  full_name?: string;
  role?: string;
  city?: string;
  status?: string;
  review_status?: string;
  created_at?: string;
  owner_id?: string;
  shop_id?: string;
  reason?: string;
  target_type?: string;
  product_id?: string;
  provider_id?: string;
  service_id?: string;
  rating?: number;
  user_id?: string;
  price_xof?: number;
  total_xof?: number;
  fee_xof?: number;
  payment_status?: string;
  current_period_end?: string;
  plan_id?: string;
  target_id?: string;
  customer_id?: string;
  order_id?: string;
}

const sections: Record<string, { title: string; table: string; icon: typeof Users; columns: string[]; readOnly?: boolean; orderBy?: string }> = {
  users: { title: 'Utilisateurs', table: 'profiles', icon: Users, columns: ['id', 'full_name', 'role', 'city', 'created_at'] },
  providers: { title: 'Profils prestataires', table: 'service_provider_profiles', icon: Wrench, columns: ['user_id', 'display_name', 'city', 'review_status', 'created_at'] },
  shops: { title: 'Boutiques à gérer', table: 'shops', icon: Store, columns: ['id', 'name', 'city', 'status', 'created_at'] },
  products: { title: 'Modération des produits', table: 'products', icon: PackageCheck, columns: ['id', 'name', 'price_xof', 'status', 'shop_id', 'created_at'] },
  services: { title: 'Modération des prestations', table: 'service_listings', icon: Wrench, columns: ['id', 'title', 'status', 'provider_id', 'city', 'created_at'] },
  'service-requests': { title: 'Demandes de devis', table: 'service_requests', icon: Wrench, columns: ['id', 'service_id', 'client_id', 'provider_id', 'status', 'created_at'], readOnly: true },
  'service-reviews': { title: 'Avis de services', table: 'service_reviews', icon: Flag, columns: ['id', 'service_id', 'client_id', 'rating', 'status', 'created_at'] },
  reports: { title: 'Signalements', table: 'reports', icon: Flag, columns: ['id', 'target_type', 'target_id', 'reason', 'status', 'created_at'] },
  subscriptions: { title: 'Abonnements', table: 'subscriptions', icon: Shield, columns: ['id', 'user_id', 'plan_id', 'status', 'current_period_end'] },
  orders: { title: 'Commandes', table: 'orders', icon: PackageCheck, columns: ['id', 'customer_id', 'shop_id', 'status', 'payment_status', 'total_xof', 'created_at'] },
  deliveries: { title: 'Livraisons', table: 'deliveries', icon: PackageCheck, columns: ['id', 'order_id', 'courier_id', 'status', 'fee_xof', 'created_at'] },
  settings: { title: 'Paramètres de plateforme', table: 'platform_settings', icon: Shield, columns: ['key', 'updated_at'], readOnly: true, orderBy: 'updated_at' },
};

export function AdminOperationsPage() {
  const { section: routeSection } = useParams();
  const navigate = useNavigate();
  const section = routeSection && sections[routeSection] ? routeSection : 'users';
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [busy, setBusy] = useState<string | null>(null);
  const config = sections[section];

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from(config.table).select(config.columns.join(',')).order(config.orderBy ?? 'created_at', { ascending: false }).limit(100);
    if (error) {
      toast.error(`Chargement impossible : ${error.message}`);
      setRows([]);
    } else {
      const normalized = ((data as unknown as Record<string, unknown>[] | null) ?? []).map((entry) => ({
        ...entry,
        id: String(entry.id ?? entry.user_id ?? entry.request_id ?? entry.key ?? ''),
        name: typeof entry.key === 'string' ? entry.key : undefined,
        status: String(entry.status ?? entry.review_status ?? ''),
        review_status: typeof entry.review_status === 'string' ? entry.review_status : undefined,
      })) as AdminRow[];
      setRows(normalized);
    }
    setLoading(false);
  }, [config]);

  useEffect(() => {
    if (routeSection && !sections[routeSection]) {
      navigate('/admin/users', { replace: true });
      return;
    }
    setLoading(true);
    void refresh();
  }, [routeSection, navigate, refresh]);

  async function changeStatus(row: AdminRow, status: string) {
    if (!supabase) return;
    setBusy(row.id);
    let result: { error: { message: string } | null };
    if (section === 'shops') result = await supabase.rpc('admin_set_shop_status', { p_shop_id: row.id, p_status: status });
    else if (section === 'products') result = await supabase.rpc('admin_set_product_status', { p_product_id: row.id, p_status: status });
    else if (section === 'users') result = await supabase.rpc('admin_set_profile_role', { p_user_id: row.id, p_role: status });
    else if (section === 'providers') result = await supabase.rpc('admin_set_service_provider_status', { p_user_id: row.user_id ?? row.id, p_status: status });
    else if (section === 'services') result = await supabase.rpc('admin_set_service_status', { p_service_id: row.id, p_status: status });
    else if (section === 'service-reviews') result = await supabase.rpc('admin_set_service_review_status', { p_review_id: row.id, p_status: status });
    else if (section === 'reports') result = await supabase.rpc('admin_review_report', { p_report_id: row.id, p_status: status, p_note: '' });
    else if (section === 'orders') result = await supabase.rpc('merchant_update_order_status', { p_order_id: row.id, p_status: status });
    else { setBusy(null); toast.info('Cette section affiche les enregistrements sans transition administrative directe.'); return; }
    setBusy(null);
    if (result.error) toast.error(`Modification refusée : ${result.error.message}`);
    else { toast.success('Modification enregistrée.'); await refresh(); }
  }

  if (!isSupabaseConfigured) return <section><h2 className="font-display text-2xl font-extrabold">Administration</h2><div className="mt-5"><SetupNotice /></div></section>;

  const Icon = config.icon;
  return <section>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Accès administrateur</p><h2 className="mt-1 flex items-center gap-2 font-display text-2xl font-extrabold"><Icon className="h-6 w-6 text-faso-forest" />{config.title}</h2><p className="mt-2 text-sm text-faso-muted">La section affichée suit l’adresse `/admin/{section}`. Les actions sensibles passent par des fonctions RPC protégées côté base.</p></div><button onClick={() => void refresh()} className="btn-secondary !min-h-10 !px-3 !py-2"><RefreshCw className="h-4 w-4" />Actualiser</button></div>
    <div className="mt-5 flex gap-2 overflow-x-auto pb-2">{Object.entries(sections).map(([key, item]) => <button key={key} onClick={() => navigate(`/admin/${key}`)} aria-current={section === key ? 'page' : undefined} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${section === key ? 'bg-faso-forest text-white' : 'border border-faso-line bg-white text-faso-muted'}`}>{item.title}</button>)}</div>
    <div className="mt-5">{loading ? <div className="h-40 animate-pulse rounded-3xl bg-white" /> : rows.length ? <div className="grid gap-3">{rows.map((row) => <article key={row.id} className="rounded-2xl border border-faso-line bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="font-bold">{row.full_name || row.display_name || row.name || `${section} #${row.id.slice(0, 8)}`}</p><p className="mt-1 text-xs text-faso-muted">{row.city || row.target_type || row.shop_id || row.user_id || row.provider_id || row.service_id || row.reason || `#${row.id.slice(0, 12)}`}</p><p className="mt-1 text-xs text-faso-muted">{row.created_at ? formatDate(row.created_at) : ''}</p>{section === 'orders' && <p className="mt-2 text-xs font-semibold text-faso-forest">Paiement : {statusLabels[row.payment_status ?? 'unpaid'] ?? row.payment_status ?? 'Non payé'}</p>}{section === 'service-reviews' && typeof row.rating === 'number' && <p className="mt-2 text-xs text-faso-muted">Note : {row.rating}/5</p>}</div><div className="flex flex-wrap items-center gap-2"><span className="badge-soft">{statusLabels[row.status ?? row.role ?? ''] ?? row.status ?? row.role ?? 'Enregistré'}</span>{section === 'users' && <select aria-label={`Rôle de ${row.full_name ?? row.id}`} className="field !w-auto !py-2 text-xs" value={row.role} disabled={busy === row.id} onChange={(event) => void changeStatus(row, event.target.value)}><option value="client">Client</option><option value="merchant">Commerçant</option><option value="courier">Livreur</option><option value="service_provider">Prestataire</option><option value="admin">Admin</option></select>}{section === 'providers' && <select aria-label={`Modération du profil ${row.display_name ?? row.id}`} className="field !w-auto !py-2 text-xs" value={row.review_status ?? row.status} disabled={busy === row.id} onChange={(event) => void changeStatus(row, event.target.value)}><option value="pending_review">À valider</option><option value="active">Activer</option><option value="suspended">Suspendre</option><option value="rejected">Rejeter</option></select>}{section === 'shops' && <select aria-label={`Statut boutique ${row.name ?? row.id}`} className="field !w-auto !py-2 text-xs" value={row.status} disabled={busy === row.id} onChange={(event) => void changeStatus(row, event.target.value)}><option value="pending_review">À valider</option><option value="active">Activer</option><option value="suspended">Suspendre</option><option value="rejected">Rejeter</option></select>}{section === 'products' && <select aria-label={`Modération de ${row.name ?? row.id}`} className="field !w-auto !py-2 text-xs" value={row.status} disabled={busy === row.id} onChange={(event) => void changeStatus(row, event.target.value)}><option value="pending_review">À valider</option><option value="active">Publier</option><option value="rejected">Rejeter</option><option value="archived">Archiver</option></select>}{section === 'services' && <select aria-label={`Modération de ${row.name ?? row.id}`} className="field !w-auto !py-2 text-xs" value={row.status} disabled={busy === row.id} onChange={(event) => void changeStatus(row, event.target.value)}><option value="pending_review">À valider</option><option value="active">Publier</option><option value="rejected">Rejeter</option><option value="archived">Archiver</option></select>}{section === 'service-reviews' && <select aria-label={`Modération de l’avis ${row.id}`} className="field !w-auto !py-2 text-xs" value={row.status} disabled={busy === row.id} onChange={(event) => void changeStatus(row, event.target.value)}><option value="pending_review">À valider</option><option value="published">Publier</option><option value="rejected">Rejeter</option></select>}{section === 'reports' && <select aria-label={`Suivi du signalement ${row.id}`} className="field !w-auto !py-2 text-xs" value={row.status} disabled={busy === row.id} onChange={(event) => void changeStatus(row, event.target.value)}><option value="open">Ouvert</option><option value="in_review">En cours</option><option value="resolved">Résolu</option><option value="rejected">Rejeté</option></select>}{section === 'orders' && row.status === 'pending' && <button className="btn-primary !min-h-9 !px-3 !py-2" disabled={busy === row.id} onClick={() => void changeStatus(row, 'accepted')}>Confirmer</button>}</div></div>{section === 'products' && typeof row.price_xof === 'number' && <p className="mt-2 text-sm font-bold text-faso-forest">{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(row.price_xof)}</p>}{section === 'orders' && typeof row.total_xof === 'number' && <p className="mt-2 text-sm font-bold text-faso-forest">{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(row.total_xof)}</p>}</article>)}</div> : <EmptyState title={`Aucun élément dans « ${config.title} »`}><p>Les éléments apparaîtront ici au fur et à mesure de l’activité FasoFlow.</p></EmptyState>}</div>
  </section>;
}
