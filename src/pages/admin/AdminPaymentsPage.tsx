import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, ExternalLink, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { EmptyState, SetupNotice } from '../../components/ui/Callout';
import { formatDate, formatXof } from '../../lib/utils';

interface PendingPayment {
  id: string;
  user_id: string;
  plan_id: string | null;
  amount_xof: number;
  provider: string;
  status: string;
  provider_session_id: string | null;
  checkout_url: string | null;
  proof_url: string | null;
  reference: string | null;
  provider_reference: string | null;
  created_at: string;
  profiles?: { full_name: string; role: string } | null;
  plans?: { name: string } | null;
}
interface Reconciliation { payment: PendingPayment; paid: boolean }

export function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [busy, setBusy] = useState<string | null>(null);
  const [instructions, setInstructions] = useState('');
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [transactionReference, setTransactionReference] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [attested, setAttested] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('payments')
      .select('id,user_id,plan_id,amount_xof,provider,status,provider_session_id,checkout_url,proof_url,reference,provider_reference,created_at,profiles(full_name,role),plans(name)')
      .in('provider', ['manual', 'saspay']).in('status', ['pending', 'creating'])
      .order('created_at', { ascending: true }).limit(100);
    if (error) toast.error(error.message);
    else setPayments(((data as unknown as PendingPayment[]) ?? []).filter((payment) =>
      (payment.provider === 'manual' && payment.status === 'pending') ||
      (payment.provider === 'saspay' && !payment.checkout_url)
    ));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void refresh();
    void supabase.rpc('get_manual_payment_instructions').then(({ data }) => setInstructions(typeof data === 'string' ? data : ''));
  }, [refresh]);

  async function reviewManual(id: string, approve: boolean) {
    if (!supabase) return;
    const note = approve ? 'Paiement manuel vérifié par un administrateur.' : 'Paiement manuel rejeté après vérification.';
    setBusy(id);
    const { error } = await supabase.rpc('admin_review_manual_payment', { p_payment_id: id, p_approve: approve, p_note: note });
    setBusy(null);
    if (error) toast.error(`Décision non enregistrée : ${error.message}`);
    else { toast.success(approve ? 'Paiement validé et abonnement activé.' : 'Paiement rejeté.'); await refresh(); }
  }

  async function saveInstructions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setSavingInstructions(true);
    const { error } = await supabase.rpc('admin_set_manual_payment_instructions', { p_value: { instructions: instructions.trim() } });
    setSavingInstructions(false);
    if (error) toast.error(`Instructions non enregistrées : ${error.message}`);
    else toast.success('Instructions de paiement manuel enregistrées.');
  }

  function openReconciliation(payment: PendingPayment, paid: boolean) {
    setTransactionReference('');
    setReviewNote('');
    setAttested(false);
    setReconciliation({ payment, paid });
  }

  async function submitReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !reconciliation || !attested) return;
    setBusy(reconciliation.payment.id);
    const { error } = await supabase.rpc('admin_reconcile_saspay_payment', {
      p_payment_id: reconciliation.payment.id,
      p_paid: reconciliation.paid,
      p_reference: transactionReference.trim() || null,
      p_note: reviewNote.trim(),
    });
    setBusy(null);
    if (error) toast.error(`Réconciliation non enregistrée : ${error.message}`);
    else {
      toast.success(reconciliation.paid ? 'Paiement SasPay confirmé et abonnement activé.' : 'Aucun paiement confirmé ; la tentative peut être relancée.');
      setReconciliation(null);
      await refresh();
    }
  }

  if (!isSupabaseConfigured) return <section><h2 className="font-display text-2xl font-extrabold">Validation des paiements</h2><div className="mt-5"><SetupNotice /></div></section>;
  return <section>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Espace administrateur</p><h2 className="mt-1 font-display text-2xl font-extrabold">Paiements à examiner</h2><p className="mt-2 text-sm text-faso-muted">Validation manuelle et réconciliation des checkouts SasPay incertains.</p></div><button onClick={() => void refresh()} className="btn-secondary !min-h-10 !px-3 !py-2"><RefreshCw className="h-4 w-4" />Actualiser</button></div>
    <form onSubmit={(event) => void saveInstructions(event)} className="card-surface mt-5 p-5"><h3 className="font-display font-extrabold">Instructions affichées au payeur</h3><p className="mt-1 text-xs text-faso-muted">Laissez vide pour désactiver le paiement manuel. N’entrez que des coordonnées réellement vérifiées par l’exploitant.</p><textarea className="field mt-3 min-h-28" value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={4000} placeholder="Instructions officielles de paiement — à compléter par l’exploitant" /><button disabled={savingInstructions} className="btn-primary mt-3">{savingInstructions ? 'Enregistrement…' : 'Enregistrer les instructions'}</button></form>
    <div className="mt-5 rounded-2xl border border-faso-saffron/30 bg-[#FFF8E8] p-4 text-sm text-faso-ink"><ShieldCheck className="mr-2 inline h-4 w-4 text-[#9B6B00]" />Ne validez qu’après vérification effective dans le compte marchand SasPay ou sur le justificatif. Le navigateur ne peut pas confirmer un paiement à votre place.</div>
    {loading ? <div className="mt-5 h-36 animate-pulse rounded-3xl bg-white" /> : payments.length ? <div className="mt-5 grid gap-3">{payments.map((payment) => payment.provider === 'manual' ? <article key={payment.id} className="card-surface p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-display font-extrabold">{payment.profiles?.full_name ?? 'Utilisateur'} · {payment.profiles?.role ?? 'membre'}</p><p className="mt-1 text-xs text-faso-muted">{payment.plans?.name ?? 'Abonnement'} · Réf. {payment.reference || 'non renseignée'}</p><p className="mt-1 text-xs text-faso-muted">Soumis le {formatDate(payment.created_at)} · paiement manuel</p></div><strong className="text-lg text-faso-forest">{formatXof(payment.amount_xof)}</strong></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3">{payment.proof_url ? <a className="inline-flex items-center gap-1 text-sm font-bold text-faso-forest" href={payment.proof_url} target="_blank" rel="noreferrer">Voir le justificatif <ExternalLink className="h-4 w-4" /></a> : <span className="text-xs text-faso-muted">Aucun justificatif joint.</span>}<div className="flex gap-2"><button type="button" disabled={busy === payment.id} onClick={() => void reviewManual(payment.id, false)} className="btn-secondary !min-h-9 !px-3 !py-2 text-faso-terracotta"><X className="h-4 w-4" />Rejeter</button><button type="button" disabled={busy === payment.id} onClick={() => void reviewManual(payment.id, true)} className="btn-primary !min-h-9 !px-3 !py-2"><Check className="h-4 w-4" />Valider</button></div></div></article> : <article key={payment.id} className="card-surface border-l-4 border-l-faso-saffron p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-display font-extrabold">Résultat SasPay incertain · {payment.profiles?.full_name ?? 'Utilisateur'} · {payment.profiles?.role ?? 'membre'}</p><p className="mt-1 text-xs text-faso-muted">{payment.plans?.name ?? 'Abonnement'} · Créée le {formatDate(payment.created_at)} · statut {payment.status}</p><p className="mt-1 text-xs text-faso-muted">Tentative #{payment.id.slice(0, 8)}{payment.provider_session_id ? ` · session ${payment.provider_session_id}` : ''}</p></div><strong className="text-lg text-faso-forest">{formatXof(payment.amount_xof)}</strong></div><p className="mt-4 text-sm leading-6 text-faso-muted">Vérifiez le compte marchand SasPay en comparant la référence, le montant et l’heure. Confirmez uniquement une transaction réellement réussie ; sinon classez-la comme non payée.</p><div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={busy === payment.id} onClick={() => openReconciliation(payment, false)} className="btn-secondary !min-h-9 !px-3 !py-2 text-faso-terracotta"><X className="h-4 w-4" />Classer non payée</button><button type="button" disabled={busy === payment.id} onClick={() => openReconciliation(payment, true)} className="btn-primary !min-h-9 !px-3 !py-2"><Check className="h-4 w-4" />Confirmer après vérification</button></div></article>)}</div> : <div className="mt-5"><EmptyState title="Aucun paiement à examiner"><p>Les demandes manuelles et les résultats SasPay incertains apparaîtront ici.</p></EmptyState></div>}
    {reconciliation && <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"><form role="dialog" aria-modal="true" aria-labelledby="reconcile-title" onSubmit={(event) => void submitReconciliation(event)} className="card-surface w-full max-w-lg p-6"><p className="eyebrow">Réconciliation admin</p><h3 id="reconcile-title" className="mt-1 font-display text-xl font-extrabold">{reconciliation.paid ? 'Confirmer un paiement SasPay' : 'Classer la tentative non payée'}</h3><p className="mt-2 text-sm leading-6 text-faso-muted">{reconciliation.paid ? 'Saisissez la référence de transaction affichée dans le compte marchand après avoir vérifié le paiement.' : 'Ajoutez une note indiquant la vérification effectuée dans le compte marchand SasPay.'}</p>{reconciliation.paid && <label className="label mt-4">Référence de transaction<input className="field" required minLength={3} maxLength={160} value={transactionReference} onChange={(event) => setTransactionReference(event.target.value)} /></label>}<label className="label mt-4">Note d’audit<textarea className="field min-h-24" required minLength={8} maxLength={1000} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Indiquez ce qui a été vérifié dans le compte SasPay." /></label><label className="mt-4 flex items-start gap-3 text-xs leading-5 text-faso-muted"><input className="mt-1" type="checkbox" required checked={attested} onChange={(event) => setAttested(event.target.checked)} />J’ai vérifié cette tentative directement dans le compte marchand SasPay et confirme que ma décision correspond à son état réel.</label><div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setReconciliation(null)}>Annuler</button><button disabled={busy === reconciliation.payment.id} className="btn-primary">{busy === reconciliation.payment.id ? 'Enregistrement…' : 'Enregistrer la décision'}</button></div></form></div>}
  </section>;
}
