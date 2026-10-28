import { useCallback, useEffect, useState } from 'react';
import { Check, MapPin, PackageCheck, RefreshCw, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../app/auth';
import { EmptyState, SetupNotice } from '../../components/ui/Callout';
import { formatDate, formatXof, statusLabels } from '../../lib/utils';
import type { Delivery } from '../../types';

type DeliveryRow = Delivery & { orders?: { id: string; total_xof: number; delivery_address: Record<string, unknown>; order_items?: { product_name_snapshot: string; quantity: number }[] } | null };

export function CourierDeliveriesPage() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState<DeliveryRow[]>([]);
  const [mine, setMine] = useState<DeliveryRow[]>([]);
  const [preferredZone, setPreferredZone] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!supabase || !user) return;
    const [available, assigned, subscription] = await Promise.all([
      supabase.from('deliveries').select('*,orders(id,total_xof,delivery_address,order_items(product_name_snapshot,quantity))').is('courier_id', null).eq('status', 'pending').order('created_at', { ascending: true }),
      supabase.from('deliveries').select('*,orders(id,total_xof,delivery_address,order_items(product_name_snapshot,quantity))').eq('courier_id', user.id).in('status', ['accepted', 'in_progress', 'delivered', 'cancelled']).order('created_at', { ascending: false }).limit(30),
      supabase.from('subscriptions').select('current_period_end,plans!inner(code,audience)').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const currentSubscription = subscription.data as { current_period_end: string | null; plans: { code?: string; audience?: string } | { code?: string; audience?: string }[] | null } | null;
    const plan = Array.isArray(currentSubscription?.plans) ? currentSubscription?.plans[0] : currentSubscription?.plans;
    const paidPreference = Boolean(currentSubscription && (!currentSubscription.current_period_end || new Date(currentSubscription.current_period_end).getTime() > Date.now()) && plan?.audience === 'courier' && ['premium', 'pro'].includes(plan.code ?? ''));
    const zone = paidPreference ? (profile?.preferred_delivery_zone ?? '').trim() : '';
    setPreferredZone(zone);
    const availableRows = (available.data as unknown as DeliveryRow[] | null) ?? [];
    if (zone) {
      const normalizedZone = zone.toLocaleLowerCase('fr');
      availableRows.sort((a, b) => {
        const matches = (row: DeliveryRow) => `${row.pickup_zone ?? ''} ${row.dropoff_zone ?? ''}`.toLocaleLowerCase('fr').includes(normalizedZone);
        return Number(matches(b)) - Number(matches(a));
      });
    }
    setOpen(availableRows);
    setMine((assigned.data as unknown as DeliveryRow[] | null) ?? []);
    setLoading(false);
  }, [user, profile?.preferred_delivery_zone]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function accept(id: string) { if (!supabase) return; setBusy(id); const { error } = await supabase.rpc('accept_delivery', { p_delivery_id: id }); setBusy(null); if (error) toast.error(error.message); else { toast.success('Course acceptée. Consultez les détails et adresse dans « Mes courses ».'); await refresh(); } }
  async function updateStatus(id: string, next: 'in_progress' | 'delivered' | 'cancelled') { if (!supabase) return; setBusy(id); const { error } = await supabase.rpc('update_delivery_status', { p_delivery_id: id, p_status: next }); setBusy(null); if (error) toast.error(error.message); else { toast.success(`Statut : ${statusLabels[next]}.`); await refresh(); } }
  if (!isSupabaseConfigured) return <section><h2 className="font-display text-2xl font-extrabold">Courses de livraison</h2><div className="mt-5"><SetupNotice /></div></section>;
  return <section>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Votre activité de livraison</p><h2 className="mt-1 font-display text-2xl font-extrabold">Courses disponibles</h2><p className="mt-2 text-sm text-faso-muted">L’affectation est atomique. Indiquez d’abord votre disponibilité dans <Link className="font-bold text-faso-forest" to="/courier/settings">Paramètres</Link>. Aucun suivi GPS permanent n’est actif.{preferredZone && <span className="mt-2 block font-semibold text-faso-forest">Votre zone préférée ({preferredZone}) est remontée en premier.</span>}</p></div><button onClick={() => void refresh()} className="btn-secondary !min-h-10 !px-3 !py-2"><RefreshCw className="h-4 w-4" />Actualiser</button></div>
    {loading ? <div className="mt-5 h-32 animate-pulse rounded-3xl bg-white" /> : open.length ? <div className="mt-5 grid gap-3">{open.map((delivery) => <article key={delivery.id} className="card-surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-faso-ivory text-faso-forest"><Truck /></div><div className="flex-1"><p className="font-display font-extrabold">Course #{delivery.id.slice(0, 8)}</p><p className="mt-2 flex flex-wrap gap-3 text-xs text-faso-muted"><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{delivery.pickup_zone || 'Zone de départ à confirmer'}</span><span>→</span><span>{delivery.dropoff_zone || 'Zone d’arrivée à confirmer'}</span></p><p className="mt-2 text-xs text-faso-muted">Demande du {formatDate(delivery.created_at)} · adresse et détails visibles après acceptation</p></div><div className="flex items-center gap-4"><strong className="text-sm text-faso-forest">{delivery.fee_xof != null ? formatXof(delivery.fee_xof) : 'Rémunération à confirmer'}</strong><button disabled={busy === delivery.id} onClick={() => void accept(delivery.id)} className="btn-primary"><Check className="h-4 w-4" />Accepter</button></div></article>)}</div> : <div className="mt-5"><EmptyState title="Aucune course disponible"><p>Les nouvelles demandes apparaîtront ici. Vous pouvez actualiser plus tard.</p></EmptyState></div>}
    <h3 className="mt-10 font-display text-xl font-extrabold">Mes courses</h3><div className="mt-4">{mine.length ? <div className="grid gap-3">{mine.map((delivery) => { const address = delivery.orders?.delivery_address ?? {}; const items = delivery.orders?.order_items ?? []; return <article key={delivery.id} className="rounded-2xl border border-faso-line bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold">Course #{delivery.id.slice(0, 8)}</p><p className="mt-1 text-xs text-faso-muted">{delivery.pickup_zone || 'Départ'} → {delivery.dropoff_zone || 'Arrivée'}</p></div><span className="badge-soft">{statusLabels[delivery.status]}</span></div>{delivery.courier_id === user?.id && delivery.status !== 'cancelled' && delivery.status !== 'delivered' && <div className="mt-3 rounded-xl bg-faso-ivory p-3 text-sm"><p><strong>Adresse :</strong> {[address.address, address.city].filter(Boolean).join(', ') || 'non renseignée'}</p><p className="mt-1"><strong>Téléphone :</strong> {String(address.phone ?? 'non renseigné')}</p>{items.length > 0 && <p className="mt-1"><strong>Colis :</strong> {items.map((item) => `${item.product_name_snapshot} × ${item.quantity}`).join(', ')}</p>}</div>}<div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-sm font-extrabold text-faso-forest">{delivery.fee_xof != null ? formatXof(delivery.fee_xof) : 'Rémunération à confirmer'}</span>{delivery.status === 'accepted' && <div className="flex gap-2"><button className="btn-secondary !min-h-9 !px-3 !py-2" disabled={busy === delivery.id} onClick={() => void updateStatus(delivery.id, 'in_progress')}><PackageCheck className="h-4 w-4" />Commencer</button><button className="btn-secondary !min-h-9 !px-3 !py-2" disabled={busy === delivery.id} onClick={() => void updateStatus(delivery.id, 'cancelled')}><X className="h-4 w-4" />Annuler</button></div>}{delivery.status === 'in_progress' && <button className="btn-primary !min-h-9 !px-3 !py-2" disabled={busy === delivery.id} onClick={() => void updateStatus(delivery.id, 'delivered')}><Check className="h-4 w-4" />Marquer livrée</button>}</div></article>; })}</div> : <EmptyState title="Votre historique est vide"><p>Les courses acceptées et leur progression seront enregistrées ici.</p></EmptyState>}</div>
  </section>;
}
