import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { EmptyState, SetupNotice } from '../../components/ui/Callout';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { formatDate, formatXof } from '../../lib/utils';
import type { ServiceRequest } from '../../types';
import { isMissingServicesMigration, serviceRequestStatusLabels } from '../../features/services/service-utils';

interface RequestRow extends ServiceRequest { service_listings?: { title: string } | null }

export function ProviderRequestsPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !user) { setLoading(false); return; }
    const { data, error } = await supabase.from('service_requests').select('*,service_listings(title)').eq('provider_id', user.id).order('created_at', { ascending: false });
    const message = error?.message ?? '';
    setMigrationMissing(Boolean(error && isMissingServicesMigration(message)));
    if (error && !isMissingServicesMigration(message)) toast.error(`Demandes non chargées : ${message}`);
    setRows((data as unknown as RequestRow[] | null) ?? []);
    setLoading(false);
  }, [user]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function answer(request: RequestRow, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get('quoted_price_xof'));
    const message = String(form.get('quote_message') ?? '').trim();
    if (!Number.isSafeInteger(amount) || amount < 0) { toast.error('Saisissez un tarif valide en XOF.'); return; }
    setBusy(request.id);
    const { error } = await supabase.rpc('respond_service_request', { p_request_id: request.id, p_status: 'quoted', p_quoted_price_xof: amount, p_quote_message: message || null });
    setBusy(null);
    if (error) toast.error(`Devis non envoyé : ${error.message}`); else { toast.success('Devis enregistré. Le client peut le consulter et discuter avec vous.'); await refresh(); }
  }

  async function decline(id: string) {
    if (!supabase) return;
    setBusy(id);
    const { error } = await supabase.rpc('respond_service_request', { p_request_id: id, p_status: 'declined', p_quoted_price_xof: null, p_quote_message: null });
    setBusy(null);
    if (error) toast.error(error.message); else { toast.success('Demande marquée comme indisponible.'); await refresh(); }
  }

  async function openConversation(id: string) {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('get_or_create_service_conversation', { p_request_id: id });
    if (error) toast.error(`Conversation indisponible : ${error.message}`);
    else navigate(`/provider/messages?conversation=${encodeURIComponent(String(data))}`);
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  return <section><p className="eyebrow">Échanges professionnels</p><h2 className="mt-1 font-display text-2xl font-extrabold">Demandes reçues</h2><p className="mt-2 text-sm leading-6 text-faso-muted">Répondez avec un prix et des conditions. Le devis n’entraîne ni réservation automatique ni paiement sur FasoFlow.</p>
    {migrationMissing && <p role="status" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Les demandes nécessitent la migration locale 015.</p>}
    {loading ? <div className="mt-5 h-36 animate-pulse rounded-3xl bg-white" /> : !migrationMissing && <div className="mt-5 grid gap-4">{rows.length ? rows.map((request) => <article key={request.id} className="card-surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-display text-lg font-extrabold">{request.service_listings?.title ?? 'Demande de prestation'}</p><p className="mt-1 text-xs text-faso-muted">Demande #{request.id.slice(0, 8)} · {formatDate(request.created_at)}</p></div><span className="badge-soft">{serviceRequestStatusLabels[request.status]}</span></div><p className="mt-4 whitespace-pre-line text-sm leading-6">{request.message}</p>{(request.requested_at || request.requested_location) && <p className="mt-2 text-xs text-faso-muted">Préférence client : {request.requested_at ? formatDate(request.requested_at) : ''}{request.requested_at && request.requested_location ? ' · ' : ''}{request.requested_location ?? ''}</p>}
      {request.quoted_price_xof !== null && <div className="mt-4 rounded-2xl bg-faso-ivory p-4"><p className="text-xs font-bold uppercase tracking-wide text-faso-muted">Devis envoyé</p><p className="mt-1 font-display text-xl font-extrabold text-faso-forest">{formatXof(request.quoted_price_xof)}</p>{request.quote_message && <p className="mt-2 whitespace-pre-line text-sm">{request.quote_message}</p>}</div>}
      <div className="mt-4 flex flex-wrap gap-2"><button className="btn-secondary !min-h-9 !px-3 !py-2" onClick={() => void openConversation(request.id)}><MessageCircle className="h-4 w-4" />Ouvrir la discussion</button>{['requested','quoted'].includes(request.status) && <button className="btn-secondary !min-h-9 !px-3 !py-2 text-faso-terracotta" disabled={busy === request.id} onClick={() => void decline(request.id)}>Indisponible</button>}</div>
      {['requested','quoted'].includes(request.status) && <form onSubmit={(event) => void answer(request, event)} className="mt-4 grid gap-3 border-t border-faso-line pt-4 sm:grid-cols-[180px_1fr_auto]"><label className="label">Prix proposé (XOF)<input className="field mt-1" type="number" name="quoted_price_xof" min="0" step="1" defaultValue={request.quoted_price_xof ?? ''} required /></label><label className="label">Conditions / réponse<textarea className="field mt-1 min-h-20" name="quote_message" maxLength={2000} defaultValue={request.quote_message ?? ''} placeholder="Précisez les conditions, la durée, les éléments inclus…" /></label><button disabled={busy === request.id} className="btn-primary self-end">{busy === request.id ? 'Envoi…' : request.status === 'quoted' ? 'Mettre à jour le devis' : 'Envoyer le devis'}</button></form>}
      {request.status === 'accepted' && <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">Accord enregistré : {request.agreed_at ? formatDate(request.agreed_at) : 'date non précisée'} · {request.agreed_location}</p>}
    </article>) : <EmptyState title="Aucune demande reçue"><p>Les demandes de devis envoyées par les clients apparaîtront ici.</p></EmptyState>}</div>}
  </section>;
}
