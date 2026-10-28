import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Clock3, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../app/auth';
import { supabase } from '../../lib/supabase';
import { formatXof } from '../../lib/utils';
import type { AppRole } from '../../types';
import { PLANS } from './plans';
import { EmptyState } from '../../components/ui/Callout';

type PlanRef = { code?: string; name?: string; price_xof?: number; audience?: string };
type ActiveSubscription = Record<string, unknown> & {
  current_period_end?: string | null;
  plans?: PlanRef | PlanRef[] | null;
};
type PendingPayment = {
  provider: string;
  status: string;
  checkout_url: string | null;
  created_at: string;
  plans?: PlanRef | PlanRef[] | null;
};

function relatedPlan(value: PlanRef | PlanRef[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

export function SubscriptionPanel({ role }: { role: AppRole }) {
  const { user } = useAuth();
  const [active, setActive] = useState<ActiveSubscription | null>(null);
  const [pendingSession, setPendingSession] = useState(() => {
    try { return localStorage.getItem('fasoflow-last-payment') ?? ''; } catch { return ''; }
  });
  const [needsReview, setNeedsReview] = useState(false);
  const [manualPending, setManualPending] = useState(false);
  const [creationInProgress, setCreationInProgress] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [openPlanCode, setOpenPlanCode] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const paymentLock = useRef(false);
  const [manualInstructions, setManualInstructions] = useState('');
  const [manualPlan, setManualPlan] = useState<string | null>(null);
  const [manualReference, setManualReference] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  const refreshSnapshot = useCallback(async () => {
    if (!supabase || !user) return;
    const [subscriptionResult, paymentResult] = await Promise.all([
      supabase.from('subscriptions').select('*,plans(code,name,price_xof,audience)').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('payments').select('id,provider,status,checkout_url,created_at,plans!inner(code,audience)').eq('user_id', user.id).in('status', ['pending', 'creating']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (subscriptionResult.error) toast.error('Impossible de rafraîchir votre abonnement.');
    const candidate = (subscriptionResult.data as ActiveSubscription | null) ?? null;
    const periodEnd = candidate?.current_period_end ? new Date(candidate.current_period_end).getTime() : null;
    setActive(periodEnd !== null && periodEnd <= Date.now() ? null : candidate);
    if (!paymentResult.error) {
      const payment = (paymentResult.data as PendingPayment | null) ?? null;
      const plan = relatedPlan(payment?.plans);
      const ageMs = payment ? Date.now() - new Date(payment.created_at).getTime() : Infinity;
      setManualPending(payment?.provider === 'manual');
      setCheckoutOpen(payment?.provider === 'saspay' && Boolean(payment.checkout_url));
      setOpenPlanCode(payment?.provider === 'saspay' ? plan?.code ?? null : null);
      setCreationInProgress(payment?.provider === 'saspay' && payment.status === 'creating' && ageMs < 30_000);
      setNeedsReview(payment?.provider === 'saspay' && (!payment.checkout_url && (payment.status !== 'creating' || ageMs >= 30_000)));
    } else {
      toast.error('Impossible de vérifier les paiements en cours.');
    }
  }, [user]);

  useEffect(() => { void refreshSnapshot(); }, [refreshSnapshot]);
  useEffect(() => {
    if (!supabase) return;
    void supabase.rpc('get_manual_payment_instructions').then(({ data }) => setManualInstructions(typeof data === 'string' ? data : ''));
  }, []);

  const plans = role === 'merchant' || role === 'courier' ? PLANS.filter((plan) => plan.audience === role) : [];
  const activePlan = relatedPlan(active?.plans);
  const activePaid = Boolean(active && activePlan?.code && activePlan.code !== 'starter');
  const activePeriodEnd = active?.current_period_end ? new Date(active.current_period_end) : null;

  async function choose(planId: string, price: number) {
    if (!user || !supabase) return;
    const selected = plans.find((plan) => plan.id === planId);
    if (activePaid) {
      toast.error('Votre abonnement payant reste actif jusqu’à son échéance ; aucun nouveau prélèvement ni changement anticipé n’est autorisé.');
      return;
    }
    if (manualPending) { toast.error('Une demande de paiement manuel attend la décision de l’administrateur.'); return; }
    if (needsReview) { toast.error('Une tentative SasPay incertaine doit d’abord être vérifiée par un administrateur.'); return; }
    if (creationInProgress) { toast.info('La création du paiement est déjà en cours. Actualisez dans quelques instants.'); return; }
    if (checkoutOpen && openPlanCode && selected?.code !== openPlanCode) { toast.error('Terminez ou faites vérifier le paiement SasPay déjà ouvert avant de choisir une autre offre.'); return; }
    if (price === 0) {
      if (checkoutOpen) { toast.error('Terminez ou annulez le checkout SasPay ouvert avant de changer d’offre.'); return; }
      const response = await supabase.rpc('select_free_plan', { p_plan_code: planId.split('-')[1] });
      if (response.error) toast.error(response.error.message);
      else { toast.success('Offre gratuite activée.'); await refreshSnapshot(); }
      return;
    }
    if (paymentLock.current) return;
    paymentLock.current = true;
    setPaying(true);
    const intentStorageKey = `fasoflow-payment-intent:${user.id}:${planId}`;
    try {
      const session = (await supabase.auth.getSession()).data.session;
      let idempotencyKey: string = crypto.randomUUID();
      try {
        idempotencyKey = localStorage.getItem(intentStorageKey) ?? idempotencyKey;
        localStorage.setItem(intentStorageKey, idempotencyKey);
      } catch { /* la clé serveur et l’index unique restent le garde-fou */ }
      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ planId }),
      });
      const result = await response.json() as { checkoutUrl?: string; sessionId?: string; status?: string; retrySafe?: boolean; error?: string };
      if (result.status === 'in_progress') {
        setCreationInProgress(true);
        toast.info(result.error ?? 'Création du paiement en cours.');
        await refreshSnapshot();
        return;
      }
      if (result.status === 'needs_admin_review') {
        setNeedsReview(true);
        if (result.sessionId) {
          try { localStorage.setItem('fasoflow-last-payment', result.sessionId); } catch { /* le statut reste en base */ }
          setPendingSession(result.sessionId);
        }
        toast.error(result.error ?? 'Vérification administrateur requise avant toute nouvelle tentative.');
        return;
      }
      if (result.status === 'failed' && result.retrySafe) {
        try { localStorage.removeItem(intentStorageKey); } catch { /* une nouvelle clé sera créée */ }
        toast.error(result.error ?? 'La tentative a échoué. Vous pouvez réessayer.');
        return;
      }
      if (result.status === 'paid') {
        try { localStorage.removeItem(intentStorageKey); } catch { /* non critique */ }
        toast.success(result.error ?? 'Cette tentative est déjà confirmée.');
        await refreshSnapshot();
        return;
      }
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error ?? 'Paiement indisponible.');
      if (result.sessionId) {
        try { localStorage.setItem('fasoflow-last-payment', result.sessionId); } catch { /* la session reste en base */ }
        setPendingSession(result.sessionId);
      }
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
    if (!supabase || !manualPlan || needsReview || manualPending || activePaid || checkoutOpen || creationInProgress) return;
    setManualBusy(true);
    const { error } = await supabase.rpc('create_manual_payment', { p_plan_code: manualPlan, p_reference: manualReference.trim() });
    setManualBusy(false);
    if (error) toast.error(error.message);
    else {
      setManualPlan(null);
      setManualReference('');
      setManualPending(true);
      toast.success('Référence transmise. Le paiement restera en attente jusqu’à vérification admin.');
      await refreshSnapshot();
    }
  }

  const planChangeBlocked = activePaid || manualPending || needsReview || creationInProgress;
  const getButtonLabel = (plan: (typeof PLANS)[number]) => {
    if (paying) return 'Préparation…';
    if (activePaid) return plan.code === activePlan?.code ? 'Offre active' : `Après le ${activePeriodEnd?.toLocaleDateString('fr-FR') ?? 'échéance'}`;
    if (manualPending) return 'Validation manuelle en attente';
    if (needsReview) return 'Vérification admin requise';
    if (creationInProgress) return 'Création en cours…';
    if (checkoutOpen && plan.code === openPlanCode) return 'Reprendre le checkout SasPay';
    return plan.price_xof ? 'Payer avec SasPay' : 'Choisir Starter';
  };

  return <section>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-display text-2xl font-extrabold">Mon abonnement</h2>
      <button type="button" onClick={() => void refreshSnapshot()} className="text-xs font-bold text-faso-forest">Actualiser</button>
    </div>

    <div className="card-surface mt-5 p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-faso-muted">Offre active</p>
      <p className="mt-2 font-display text-xl font-extrabold">{activePlan?.name ?? 'Starter gratuit'}</p>
      {activePaid && <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-faso-forest"><Clock3 className="h-4 w-4" />Valide jusqu’au {activePeriodEnd?.toLocaleDateString('fr-FR') ?? 'à confirmation'}</p>}
      <p className="mt-2 text-sm text-faso-muted">L’accès payant reste actif jusqu’à la date d’échéance. Les changements et renouvellements anticipés sont bloqués pour éviter un nouveau prélèvement ou la perte du temps déjà payé.</p>
      {pendingSession && <Link to={`/payment/return?session_id=${encodeURIComponent(pendingSession)}`} className="btn-secondary mt-4">Vérifier un paiement SasPay en cours</Link>}
    </div>

    {manualPending && <div role="status" className="mt-4 rounded-2xl border border-faso-forest/20 bg-faso-ivory p-4 text-sm leading-6"><strong className="block">Paiement manuel en attente</strong>Une demande existe déjà pour votre compte. Les autres paiements et changements d’offre sont bloqués jusqu’à la décision de l’administrateur.</div>}
    {creationInProgress && <div role="status" className="mt-4 rounded-2xl border border-faso-forest/20 bg-faso-ivory p-4 text-sm leading-6"><strong className="block">Création SasPay en cours</strong>Ne relancez pas la demande. Actualisez dans quelques instants ; une tentative qui reste ambiguë sera envoyée à la réconciliation administrateur.</div>}
    {checkoutOpen && <div role="status" className="mt-4 rounded-2xl border border-faso-forest/20 bg-faso-ivory p-4 text-sm leading-6"><strong className="block">Checkout SasPay déjà ouvert</strong>Reprenez l’offre correspondante ci-dessous ou vérifiez son statut ; aucun autre paiement ne peut être créé en parallèle.</div>}
    {needsReview && <div role="alert" className="mt-4 rounded-2xl border border-faso-saffron/40 bg-[#FFF8E8] p-4 text-sm leading-6 text-faso-ink"><strong className="block">Tentative SasPay à vérifier</strong>Le résultat de création SasPay est incertain. N’effectuez pas une autre tentative ni un paiement manuel. Un administrateur doit consulter le compte marchand et enregistrer sa décision. <button type="button" onClick={() => void refreshSnapshot()} className="mt-2 block font-bold text-faso-forest">Rafraîchir après vérification</button></div>}

    <h3 className="mt-8 font-display text-lg font-extrabold">Offres {role === 'merchant' ? 'commerçant' : 'livreur'}</h3>
    {plans.length ? <div className="mt-4 grid gap-4 md:grid-cols-3">{plans.map((plan) => {
      const selectedCheckout = checkoutOpen && plan.code === openPlanCode;
      const disabled = paying || planChangeBlocked || (checkoutOpen && !selectedCheckout) || (manualPending && plan.price_xof > 0);
      return <article key={plan.id} className={`rounded-3xl border bg-white p-5 ${plan.code === activePlan?.code && activePaid ? 'border-faso-forest ring-2 ring-faso-forest/10' : 'border-faso-line'}`}>
        <div className="flex items-start justify-between gap-2"><p className="font-bold">{plan.name}</p>{plan.code === activePlan?.code && activePaid && <span className="badge-soft">Actif</span>}</div>
        <p className="mt-2 font-display text-xl font-extrabold">{plan.price_xof ? formatXof(plan.price_xof) : 'Gratuit'}<span className="text-xs font-medium text-faso-muted">{plan.price_xof ? ' / mois' : ''}</span></p>
        <ul className="mt-4 grid gap-2 text-sm text-faso-muted">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-faso-forest" />{feature}</li>)}</ul>
        <button disabled={disabled} className="btn-primary mt-5 w-full" onClick={() => void choose(plan.id, plan.price_xof)}>{getButtonLabel(plan)}</button>
        {plan.price_xof > 0 && manualInstructions.length > 3 && !checkoutOpen && <button type="button" disabled={manualBusy || Boolean(planChangeBlocked)} className="btn-secondary mt-2 w-full" onClick={() => setManualPlan(plan.code)}>Paiement manuel</button>}
      </article>;
    })}</div> : <div className="mt-4"><EmptyState title="Aucune offre configurée pour ce rôle" /></div>}

    {manualPlan && <form onSubmit={(event) => void submitManual(event)} className="card-surface mt-6 max-w-2xl p-5">
      <h3 className="font-display text-lg font-extrabold">Référence de paiement manuel</h3>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-faso-muted">{manualInstructions}</p>
      <label className="label mt-4">Référence / identifiant de transaction<input className="field" required minLength={2} maxLength={160} value={manualReference} onChange={(event) => setManualReference(event.target.value)} /></label>
      <p className="mt-2 text-xs text-faso-muted">La soumission ne confirme pas le paiement. L’abonnement restera en attente jusqu’à validation par un administrateur.</p>
      <div className="mt-4 flex gap-2"><button disabled={manualBusy || Boolean(planChangeBlocked)} className="btn-primary">{manualBusy ? 'Transmission…' : 'Soumettre la référence'}</button><button type="button" className="btn-secondary" onClick={() => setManualPlan(null)}>Annuler</button></div>
    </form>}
    <p className="mt-4 inline-flex items-center gap-2 text-xs text-faso-muted"><ShieldCheck className="h-4 w-4" />SasPay est appelé uniquement côté serveur. Le navigateur ne confirme jamais un paiement. Aucune commission n’est ajoutée aux ventes.</p>
  </section>;
}
