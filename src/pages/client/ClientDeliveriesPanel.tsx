import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../app/auth';
import { EmptyState } from '../../components/ui/Callout';
import { formatDate, statusLabels } from '../../lib/utils';
import { supabase } from '../../lib/supabase';

type RelatedOrder = { id: string; customer_id: string; created_at: string; status: string } | { id: string; customer_id: string; created_at: string; status: string }[] | null;
type ClientDelivery = {
  id: string;
  status: string;
  pickup_zone: string | null;
  dropoff_zone: string | null;
  created_at: string;
  updated_at: string;
  orders: RelatedOrder;
};

function relatedOrder(value: RelatedOrder) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function ClientDeliveriesPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ClientDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!supabase || !user) {
      setRows([]);
      setLoading(false);
      setError('Connectez-vous pour consulter vos livraisons.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('deliveries')
        .select('id,status,pickup_zone,dropoff_zone,created_at,updated_at,orders!inner(id,customer_id,created_at,status)')
        .eq('orders.customer_id', user.id)
        .order('created_at', { ascending: false })
        .range(0, 50);
      if (queryError) throw queryError;
      const page = (data as unknown as ClientDelivery[] | null) ?? [];
      setRows(page.slice(0, 50));
      setHasMore(page.length > 50);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'erreur réseau inattendue';
      setRows([]);
      setError(message);
      toast.error(`Livraisons impossibles à charger : ${message}`);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function loadMore() {
    if (!supabase || !user || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { data, error: queryError } = await supabase.from('deliveries')
        .select('id,status,pickup_zone,dropoff_zone,created_at,updated_at,orders!inner(id,customer_id,created_at,status)')
        .eq('orders.customer_id', user.id).order('created_at', { ascending: false })
        .range(rows.length, rows.length + 50);
      if (queryError) throw queryError;
      const page = (data as unknown as ClientDelivery[] | null) ?? [];
      setRows((current) => [...current, ...page.slice(0, 50)]);
      setHasMore(page.length > 50);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'erreur réseau inattendue';
      setError(message);
      toast.error(`Historique des livraisons incomplet : ${message}`);
    } finally {
      setLoadingMore(false);
    }
  }

  return <section>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">Suivi réel</p><h2 className="mt-1 font-display text-2xl font-extrabold">Mes livraisons</h2><p className="mt-2 text-sm text-faso-muted">Les livraisons associées à vos commandes, selon leur statut enregistré.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="btn-secondary !min-h-10 !px-3 !py-2"><RefreshCw className="h-4 w-4" />Actualiser</button>
    </div>
    {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>Les livraisons ne sont pas disponibles : {error}</p><button type="button" className="mt-2 min-h-10 font-bold underline" onClick={() => void refresh()}>Réessayer</button></div>}
    {loading ? <div className="mt-5 h-36 animate-pulse rounded-3xl bg-white" aria-label="Chargement des livraisons" /> : !error && rows.length ? <div className="mt-5 grid gap-3">{rows.map((delivery) => {
      const order = relatedOrder(delivery.orders);
      return <article key={delivery.id} className="card-surface flex flex-wrap items-center gap-4 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-faso-ivory text-faso-forest"><Truck className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><p className="font-bold">Livraison de la commande #{order?.id.slice(0, 8) ?? '—'}</p><p className="mt-1 text-xs text-faso-muted">{delivery.pickup_zone || 'Départ à confirmer'} → {delivery.dropoff_zone || 'Arrivée à confirmer'}</p><p className="mt-1 text-xs text-faso-muted">Mise à jour : {formatDate(delivery.updated_at || delivery.created_at)}</p></div>
        <span className="badge-soft">{statusLabels[delivery.status] ?? delivery.status}</span>
      </article>;
    })}{hasMore && <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="btn-secondary mt-3 w-full">{loadingMore ? 'Chargement…' : 'Afficher les livraisons suivantes'}</button>}</div> : !error && <div className="mt-5"><EmptyState title="Aucune livraison associée à vos commandes"><p>Le suivi apparaîtra ici lorsqu’une livraison réelle sera créée pour une commande.</p></EmptyState></div>}
  </section>;
}
