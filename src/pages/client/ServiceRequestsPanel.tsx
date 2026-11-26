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

interface RequestRow extends ServiceRequest { service_listings?: { title: string } | null; service_provider_profiles?: { display_name: string } | null }
interface ExistingReview { request_id: string; status: string }

export function ClientServiceRequestsPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [reviews, setReviews] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [requestError, setRequestError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const refresh = useCallback(async () => {
    if (!supabase || !user) {
      setLoading(false);
      setRequestError('Session utilisateur indisponible.');
      return;
    }
    setLoading(true);
    setRequestError('');
    try {
      const [requestResult, reviewResult] = await Promise.all([
        supabase.from('service_requests').select('*,service_listings(title),service_provider_profiles(display_name)').eq('client_id', user.id).order('created_at', { ascending: false }),
        supabase.from('service_reviews').select('request_id,status').eq('client_id', user.id),
      ]);
      if (requestResult.error) {
        const missing = isMissingServicesMigration(requestResult.error.message);
        setMigrationMissing(missing);
        setRequestError(requestResult.error.message);
        setRows([]);
        toast.error(`Demandes non chargées : ${requestResult.error.message}`);
      } else {
        setMigrationMissing(false);
        setRequestError('');
        setRows((requestResult.data as unknown as RequestRow[] | null) ?? []);
      }
      if (reviewResult.error) {
        setReviewError(reviewResult.error.message);
        toast.error(`Statut des avis indisponible : ${reviewResult.error.message}`);
      } else {
        setReviewError('');
        setReviews(new Map(((reviewResult.data as ExistingReview[] | null) ?? []).map((review) => [review.request_id, review.status])));
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'erreur réseau inattendue';
      setRequestError(message);
      setRows([]);
      setMigrationMissing(isMissingServicesMigration(message));
      toast.error(`Demandes non chargées : ${message}`);
    } finally {
      setLoading(false);
    }
  }, [user]);
  useEffect(() => { void refresh(); }, [refresh, retry]);

  async function openConversation(id: string) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc('get_or_create_service_conversation', { p_request_id: id });
      if (error) toast.error(`Conversation indisponible : ${error.message}`);
      else if (!data) toast.error('La conversation n’a pas été renvoyée par Supabase.');
      else navigate(`/client/messages?conversation=${encodeURIComponent(String(data))}`);
    } catch (reason) {
      toast.error(`Conversation indisponible : ${reason instanceof Error ? reason.message : 'erreur réseau inattendue'}`);
    }
  }

  async function decide(request: RequestRow, accept: boolean, event?: FormEvent<HTMLFormElement>) {
    if (!supabase) return;
    let agreedAt: string | null = null;
    let agreedLocation: string | null = null;
    if (accept && event) {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const localDate = String(form.get('agreed_at') ?? '');
      const parsedDate = new Date(localDate);
      if (!localDate || !Number.isFinite(parsedDate.getTime())) { toast.error('Choisissez une date et une heure valides.'); return; }
      if (parsedDate.getTime() <= Date.now()) { toast.error('La date convenue doit être dans le futur.'); return; }
      agreedAt = parsedDate.toISOString();
      agreedLocation = String(form.get('agreed_location') ?? '').trim();
      if (agreedLocation.length < 3 || agreedLocation.length > 500) { toast.error('Le lieu convenu doit contenir entre 3 et 500 caractères.'); return; }
    }
    setBusy(request.id);
    try {
      const { error } = await supabase.rpc('decide_service_quote', { p_request_id: request.id, p_accept: accept, p_agreed_at: agreedAt, p_agreed_location: agreedLocation });
      if (error) throw error;
      toast.success(accept ? 'Le devis et les conditions ont été confirmés.' : 'Devis décliné.');
      await refresh();
    } catch (reason) {
      toast.error(`Décision non enregistrée : ${reason instanceof Error ? reason.message : 'erreur réseau inattendue'}`);
    } finally {
      setBusy(null);
    }
  }

  async function complete(id: string) {
    if (!supabase) return;
    setBusy(id);
    try {
      const { error } = await supabase.rpc('complete_service_request', { p_request_id: id });
      if (error) throw error;
      toast.success('Réalisation confirmée. Vous pouvez laisser un avis.');
      await refresh();
    } catch (reason) {
      toast.error(`Fin de prestation non confirmée : ${reason instanceof Error ? reason.message : 'erreur réseau inattendue'}`);
    } finally {
      setBusy(null);
    }
  }

  async function review(request: RequestRow, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || reviewError) return;
    const form = new FormData(event.currentTarget);
    setBusy(request.id);
    try {
      const { error } = await supabase.from('service_reviews').insert({
        request_id: request.id, service_id: request.service_id, provider_id: request.provider_id,
        client_id: user.id, rating: Number(form.get('rating')), comment: String(form.get('comment') ?? '').trim(), status: 'pending_review',
      });
      if (error) throw error;
      toast.success('Merci. Votre avis est envoyé en modération.');
      await refresh();
    } catch (reason) {
      toast.error(`Avis non envoyé : ${reason instanceof Error ? reason.message : 'erreur réseau inattendue'}`);
    } finally {
      setBusy(null);
    }
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  return <section><p className="eyebrow">Suivi des devis</p><h2 className="mt-1 font-display text-2xl font-extrabold">Mes demandes de services</h2><p className="mt-2 text-sm leading-6 text-faso-muted">Une demande ne constitue pas une réservation. La date et le lieu ne sont enregistrés comme convenus qu’après acceptation du devis.</p>
    {migrationMissing && <p role="status" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Le suivi des demandes nécessite la migration locale 015.</p>}
    {requestError && !migrationMissing && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800"><p>Demandes indisponibles : {requestError}</p><button type="button" className="mt-2 font-bold underline" onClick={() => setRetry((value) => value + 1)}>Réessayer</button></div>}
    {loading ? <div className="mt-5 h-36 animate-pulse rounded-3xl bg-white" /> : migrationMissing || requestError ? null : <div className="mt-5 grid gap-4">{rows.length ? rows.map((request) => <article key={request.id} className="card-surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-display text-lg font-extrabold">{request.service_listings?.title ?? 'Prestation'}</p><p className="mt-1 text-xs text-faso-muted">{request.service_provider_profiles?.display_name ?? 'Professionnel'} · Demande #{request.id.slice(0, 8)} · {formatDate(request.created_at)}</p></div><span className="badge-soft">{serviceRequestStatusLabels[request.status]}</span></div>
      <div className="mt-4 flex flex-wrap items-center gap-3">{request.quoted_price_xof !== null && <strong className="font-display text-xl text-faso-forest">{formatXof(request.quoted_price_xof)}</strong>}<button className="btn-secondary !min-h-9 !px-3 !py-2" onClick={() => void openConversation(request.id)}><MessageCircle className="h-4 w-4" />Discussion</button></div>
      {request.quote_message && <p className="mt-3 whitespace-pre-line rounded-2xl bg-faso-ivory p-4 text-sm leading-6">{request.quote_message}</p>}
      {request.status === 'quoted' && <div className="mt-4 grid gap-3 border-t border-faso-line pt-4"><form onSubmit={(event) => void decide(request, true, event)} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><label className="label">Date convenue avec le prestataire<input className="field mt-1" type="datetime-local" name="agreed_at" required /></label><label className="label">Lieu convenu<input className="field mt-1" name="agreed_location" required minLength={3} maxLength={500} defaultValue={request.requested_location ?? ''} /></label><button className="btn-primary" disabled={busy === request.id}>{busy === request.id ? 'Enregistrement…' : 'Accepter le devis'}</button></form><button className="justify-self-start text-sm font-bold text-faso-terracotta" disabled={busy === request.id} onClick={() => void decide(request, false)}>Décliner le devis</button></div>}
      {request.status === 'accepted' && <div className="mt-4 rounded-2xl bg-emerald-50 p-4"><p className="text-sm font-bold text-emerald-900">Date et lieu convenus</p><p className="mt-1 text-sm text-emerald-900">{request.agreed_at ? formatDate(request.agreed_at) : ''} · {request.agreed_location}</p><button className="btn-primary mt-3 !min-h-9 !px-3 !py-2" disabled={busy === request.id} onClick={() => void complete(request.id)}>{busy === request.id ? 'Enregistrement…' : 'Confirmer la prestation terminée'}</button></div>}
      {request.status === 'completed' && (reviewError ? <div role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><p>Le statut de votre avis ne peut pas être vérifié : {reviewError}</p><button type="button" className="mt-2 font-bold underline" onClick={() => setRetry((value) => value + 1)}>Vérifier à nouveau</button></div> : reviews.has(request.id) ? <p className="mt-4 rounded-xl bg-faso-ivory p-3 text-sm">Avis envoyé · {reviews.get(request.id) === 'published' ? 'publié' : 'en modération'}</p> : <form onSubmit={(event) => void review(request, event)} className="mt-4 grid gap-3 border-t border-faso-line pt-4 sm:grid-cols-[150px_1fr_auto]"><label className="label">Votre note<select className="field mt-1" name="rating" defaultValue="5"><option value="5">5 étoiles</option><option value="4">4 étoiles</option><option value="3">3 étoiles</option><option value="2">2 étoiles</option><option value="1">1 étoile</option></select></label><label className="label">Commentaire<textarea className="field mt-1 min-h-20" name="comment" maxLength={2000} placeholder="Votre retour (facultatif)" /></label><button className="btn-primary self-end" disabled={busy === request.id}>Envoyer mon avis</button></form>)}
    </article>) : <EmptyState title="Aucune demande pour l’instant"><p>Les demandes envoyées depuis une fiche de prestation apparaîtront ici.</p></EmptyState>}</div>}
  </section>;
}
