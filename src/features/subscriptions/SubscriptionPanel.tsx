import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../app/auth';
import { supabase } from '../../lib/supabase';
import { formatXof } from '../../lib/utils';
import type { AppRole } from '../../types';
import { PLANS } from './plans';
import { EmptyState } from '../../components/ui/Callout';

export function SubscriptionPanel({ role }: { role: AppRole }) {
  const { user } = useAuth();
  const [active, setActive] = useState<Record<string, unknown> | null>(null);
  const [pendingSession, setPendingSession] = useState(() => { try { return localStorage.getItem('fasoflow-last-payment') ?? ''; } catch { return ''; } });
  const [needsReview, setNeedsReview] = useState(false);
  const [paying, setPaying] = useState(false);
  const paymentLock = useRef(false);
  const [manualInstructions, setManualInstructions] = useState('');
  const [manualPlan, setManualPlan] = useState<string | null>(null);
  const [manualReference, setManualReference] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  const refreshSnapshot = useCallback(async () => {
    if (!supabase || !user) return;
    const [subscriptionResult, paymentResult] = await Promise.all([
      supabase.from('subscriptions').select('*,plans(name,price_xof)').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
      supabase.from('payments').select('id,provider,status,checkout_url').eq('user_id', user.id).eq('provider', 'saspay').in('status', ['pending', 'creating']).is('checkout_url', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (subscriptionResult.error) toast.error('Impossible de rafraîchir votre abonnement.');
    setActive((subscriptionResult.data as Record<string, unknown> | null) ?? null);
    if (!paymentResult.error) setNeedsReview(Boolean(paymentResult.data));
  }, [user]);

  useEffect(() => { void refreshSnapshot(); }, [refreshSnapshot]);
  useEffect(() => { if (!supabase) return; void supabase.rpc('get_manual_payment_instructions').then(({ data }) => setManualInstructions(typeof data === 'string' ? data : '')); }, []);

  const plans = role === 'merchant' || role === 'courier' ? PLANS.filter((plan) => plan.audience === role) : [];

  async function choose(planId: string, price: number) {
    if (!user || !supabase) return;
    if (price === 0) {
      const response = await supabase.rpc('select_free_plan', { p_plan_code: planId.split('-')[1] });
      if (response.error) toast.error(response.error.message);
      else { toast.success('Offre gratuite activée.'); await refreshSnapshot(); }
      return;
    }
    if (needsReview) { toast.error('Une tentative SasPay doit d’abord être vérifiée par un administrateur.'); return; }
    if (paymentLock.current) return;
    paymentLock.current = true;
    setPaying(true);
    const intentStorageKey = `fasoflow-payment-intent:${user.id}:${planId}`;
    try {
      const session = (await supabase.auth.getSession()).data.session;
      let idempotencyKey: string = crypto.randomUUID();
      try { idempotencyKey = localStorage.getItem(intentStorageKey) ?? idempotencyKey; localStorage.setItem(intentStorageKey, idempotencyKey); } catch { /* persistent retry safety is unavailable */ }
      const response = await fetch('/api/payments/create', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ planId }) });
      const result = await response.json() as { checkoutUrl?: string; sessionId?: string; paymentId?: string; status?: string; retrySafe?: boolean; error?: string };
      if (result.status === 'needs_admin_review') {
        setNeedsReview(true);
        if (result.sessionId) { try { localStorage.setItem('fasoflow-last-payment', result.sessionId); } catch { /* status remains available on the server */ } setPendingSession(result.sessionId); }
        toast.error(result.error ?? 'Vérification admin nécessaire avant toute nouvelle tentative.');
        return;
      }
      if (result.status === 'failed' && result.retrySafe) {
        try { localStorage.removeItem(intentStorageKey); } catch { /* safe retry still needs a new key */ }
        toast.error(`${result.error ?? 'La tentative a échoué.'} Vous pouvez lancer une nouvelle tentative.`);
        return;
      }
      if (result.status === 'paid') {
        try { localStorage.removeItem(intentStorageKey); } catch { /* non-critical */ }
        toast.success(result.error ?? 'Cette tentative est déjà confirmée. Actualisez votre abonnement.');
        await refreshSnapshot();
        return;
      }
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error ?? 'Paiement indisponible.');
      if (result.sessionId) { try { localStorage.setItem('fasoflow-last-payment', result.sessionId); } catch { /* session remains available from provider checkout history */ } setPendingSession(result.sessionId); }
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Erreur de paiement.');
      await refreshSnapshot();
    } finally {
      paymentLock.current = false;
      setPaying(false);
    }
  }

  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !manualPlan || needsReview) return;
    setManualBusy(true);
    const { error } = await supabase.rpc('create_manual_payment', { p_plan_code: manualPlan, p_reference: manualReference.trim() });
    setManualBusy(false);
    if (error) toast.error(error.message);
    else { setManualPlan(null); setManualReference(''); toast.success('Référence transmise. Le paiement restera en attente jusqu’à vérification admin.'); }
  }

  return <section>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-2xl font-extrabold">Mon abonnement</h2><button type="button" onClick={() => void refreshSnapshot()} className="text-xs font-bold text-faso-forest">Actualiser</button></div>
    <div className="card-surface mt-5 p-5"><p className="text-xs font-bold uppercase tracking-wide text-faso-muted">Offre active</p><p className="mt-2 font-display text-xl font-extrabold">{active ? String((active.plans as Record<string, unknown> | undefined)?.name ?? 'Plan actif') : 'Starter gratuit'}</p><p className="mt-2 text-sm text-faso-muted">Les informations d’abonnement sont confirmées en base. Les paiements manuels restent en attente jusqu’à validation.</p>{pendingSession && <Link to={`/payment/return?session_id=${encodeURIComponent(pendingSession)}`} className="btn-secondary mt-4">Vérifier un paiement SasPay en cours</Link>}</div>
    {needsReview && <div role="alert" className="mt-4 rounded-2xl border border-faso-saffron/40 bg-[#FFF8E8] p-4 text-sm leading-6 text-faso-ink"><strong className="block">Tentative de paiement à vérifier</strong>Le résultat de création SasPay est incertain. N’effectuez pas une nouvelle tentative ni un paiement manuel avant la vérification admin. Un administrateur doit consulter le compte marchand SasPay puis enregistrer sa décision. <button type="button" onClick={() => void refreshSnapshot()} className="mt-2 block font-bold text-faso-forest">Rafraîchir l’état après vérification</button></div>}
    <h3 className="mt-8 font-display text-lg font-extrabold">Changer d’offre</h3>
    {plans.length ? <div className="mt-4 grid gap-4 md:grid-cols-3">{plans.map((plan) => <article key={plan.id} className="rounded-3xl border border-faso-line bg-white p-5"><p className="font-bold">{plan.name}</p><p className="mt-2 font-display text-xl font-extrabold">{plan.price_xof ? formatXof(plan.price_xof) : 'Gratuit'}<span className="text-xs font-medium text-faso-muted">{plan.price_xof ? ' / mois' : ''}</span></p><button disabled={paying || (needsReview && plan.price_xof > 0)} className="btn-primary mt-5 w-full" onClick={() => void choose(plan.id, plan.price_xof)}>{paying ? 'Préparation…' : needsReview && plan.price_xof ? 'Vérification en attente' : plan.price_xof ? 'Payer avec SasPay' : 'Choisir Starter'}</button>{plan.price_xof > 0 && manualInstructions.length > 3 && <button type="button" disabled={manualBusy || needsReview} className="btn-secondary mt-2 w-full" onClick={() => setManualPlan(plan.code)}>Paiement manuel</button>}</article>)}</div> : <div className="mt-4"><EmptyState title="Aucune offre configurée pour ce rôle" /></div>}
    {manualPlan && <form onSubmit={(event) => void submitManual(event)} className="card-surface mt-6 max-w-2xl p-5"><h3 className="font-display text-lg font-extrabold">Référence de paiement manuel</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-faso-muted">{manualInstructions}</p><label className="label mt-4">Référence / identifiant de transaction<input className="field" required minLength={2} maxLength={160} value={manualReference} onChange={(event) => setManualReference(event.target.value)} /></label><p className="mt-2 text-xs text-faso-muted">La soumission ne confirme pas le paiement. L’abonnement restera en attente jusqu’à validation par un administrateur.</p><div className="mt-4 flex gap-2"><button disabled={manualBusy} className="btn-primary">{manualBusy ? 'Transmission…' : 'Soumettre la référence'}</button><button type="button" className="btn-secondary" onClick={() => setManualPlan(null)}>Annuler</button></div></form>}
    <p className="mt-4 text-xs text-faso-muted">SasPay est appelé uniquement côté serveur. Le navigateur ne confirme jamais un paiement. Aucun frais de commission FasoFlow n’est ajouté aux ventes.</p>
  </section>;
}
