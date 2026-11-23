import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Briefcase, Check, CircleAlert, LoaderCircle, MessageCircle, UserRound } from 'lucide-react';
import { ChatPanel } from '../../features/messaging/ChatPanel';
import { useAuth } from '../../app/auth';
import { EmptyState, SetupNotice } from '../../components/ui/Callout';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { ProviderProfileForm } from './ProviderProfileForm';
import { ProviderServicesManager } from './ProviderServicesManager';
import { ProviderRequestsPanel } from './ProviderRequestsPanel';

export function ServiceProviderDashboardPage() {
  const { section = 'dashboard' } = useParams();
  const { user, profile } = useAuth();
  const userId = user?.id;
  const [setupState, setSetupState] = useState<'checking' | 'profile' | 'service' | 'review' | 'rejected' | 'archived' | 'ready' | 'unavailable'>('checking');
  const [setupError, setSetupError] = useState('');
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  useEffect(() => {
    if (!supabase || !userId) { setSetupState('unavailable'); setSetupError('La session ou la connexion aux données est indisponible.'); return; }
    let active = true;
    setSetupState('checking');
    setSetupError('');
    void (async () => {
      try {
        const { data: provider, error: providerError } = await supabase
          .from('service_provider_profiles').select('user_id').eq('user_id', userId).maybeSingle();
        if (providerError) throw providerError;
        if (!provider) { if (active) setSetupState('profile'); return; }
        const [activeListing, reviewListing, rejectedListing, archivedListing] = await Promise.all([
          supabase.from('service_listings').select('id').eq('provider_id', userId).eq('status', 'active').limit(1),
          supabase.from('service_listings').select('id').eq('provider_id', userId).eq('status', 'pending_review').limit(1),
          supabase.from('service_listings').select('id').eq('provider_id', userId).eq('status', 'rejected').limit(1),
          supabase.from('service_listings').select('id').eq('provider_id', userId).eq('status', 'archived').limit(1),
        ]);
        const listingError = activeListing.error ?? reviewListing.error ?? rejectedListing.error ?? archivedListing.error;
        if (listingError) throw listingError;
        if (active) setSetupState(activeListing.data?.length ? 'ready' : reviewListing.data?.length ? 'review' : rejectedListing.data?.length ? 'rejected' : archivedListing.data?.length ? 'archived' : 'service');
      } catch (reason) {
        if (active) {
          setSetupState('unavailable');
          setSetupError(reason instanceof Error ? reason.message : 'Erreur de lecture inattendue.');
        }
      }
    })();
    return () => { active = false; };
  }, [userId, verificationAttempt]);
  if (!isSupabaseConfigured) return <div><h2 className="font-display text-2xl font-extrabold">Espace prestataire</h2><div className="mt-5"><SetupNotice /></div></div>;
  if (section === 'profile') return <ProviderProfileForm />;
  if (section === 'services') return <ProviderServicesManager />;
  if (section === 'requests') return <ProviderRequestsPanel />;
  if (section === 'messages') return <ChatPanel />;
  if (section !== 'dashboard') return <section><h2 className="font-display text-2xl font-extrabold">Espace prestataire</h2><div className="mt-5"><EmptyState title="Section indisponible"><Link to="/provider/dashboard" className="font-bold text-faso-forest">Retour au tableau de bord</Link></EmptyState></div></section>;
  return <section><p className="eyebrow">Votre activité de services</p><h2 className="mt-1 font-display text-2xl font-extrabold">Bonjour{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-faso-muted">Présentez votre savoir-faire, recevez des demandes de devis et convenez directement avec vos clients. L’inscription prestataire est gratuite ; aucune commission ou réservation n’est gérée par FasoFlow.</p>
    <div className="mt-6 rounded-3xl border border-faso-line bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Mise en route</p><h3 className="mt-1 font-display text-xl font-extrabold">Votre vitrine professionnelle</h3><p className="mt-1 text-sm text-faso-muted">Deux étapes pour commencer à présenter vos services.</p></div>{setupState === 'checking' && <span role="status" className="inline-flex items-center gap-2 rounded-full bg-faso-ivory px-3 py-1.5 text-xs font-bold text-faso-muted"><LoaderCircle className="h-4 w-4 animate-spin" />Vérification…</span>}</div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Étapes de mise en route prestataire">
        <SetupStep number="1" title="Créer le profil professionnel" state={setupState === 'profile' ? 'current' : ['service', 'review', 'rejected', 'archived', 'ready'].includes(setupState) ? 'complete' : 'pending'} detail={setupState === 'profile' ? 'Ajoutez votre activité et votre zone.' : ['service', 'review', 'rejected', 'archived', 'ready'].includes(setupState) ? 'Profil enregistré.' : setupState === 'unavailable' ? 'État non vérifiable.' : 'Vérification en cours.'} />
        <SetupStep number="2" title="Ajouter une prestation" state={['service', 'rejected', 'archived'].includes(setupState) ? 'current' : ['review', 'ready'].includes(setupState) ? 'complete' : 'pending'} detail={setupState === 'service' ? 'Votre profil est prêt pour la première offre.' : setupState === 'review' ? 'Prestation envoyée, en attente de modération.' : setupState === 'rejected' ? 'Une prestation doit être corrigée.' : setupState === 'archived' ? 'Votre fiche est archivée; vous pouvez en créer une nouvelle.' : setupState === 'ready' ? 'Au moins une prestation est publiée.' : setupState === 'unavailable' ? 'État non vérifiable.' : 'Disponible après le profil.'} />
      </ol>
      {setupState === 'profile' && <div className="mt-5"><p className="text-sm leading-6 text-faso-muted">Votre compte est créé, mais le profil métier n’est pas encore enregistré. Il est nécessaire avant d’ajouter une prestation.</p><Link to="/provider/profile" className="btn-primary mt-3 w-full sm:w-auto">Créer mon profil professionnel <ArrowRight className="h-4 w-4" /></Link></div>}
      {setupState === 'service' && <div role="status" className="mt-5 rounded-2xl border border-faso-saffron/50 bg-faso-saffron/10 p-5"><p className="font-bold text-faso-forest">Profil enregistré : ajoutez votre première prestation</p><p className="mt-1 text-sm leading-6 text-faso-muted">La prestation sera envoyée à l’administration pour vérification avant sa publication.</p><Link to="/provider/services?create=1" className="btn-primary mt-4 w-full sm:w-auto">Créer ma première prestation <ArrowRight className="h-4 w-4" /></Link></div>}
      {setupState === 'review' && <div role="status" className="mt-5 rounded-2xl border border-faso-saffron/50 bg-faso-saffron/10 p-5"><p className="font-bold text-faso-forest">Votre prestation est en cours de modération</p><p className="mt-1 text-sm leading-6 text-faso-muted">Elle n’est pas encore présentée comme publiée. Vous pouvez consulter son état dans votre catalogue.</p><Link to="/provider/services" className="mt-3 inline-flex min-h-11 items-center gap-2 font-bold text-faso-forest">Consulter mes prestations <ArrowRight className="h-4 w-4" /></Link></div>}
      {setupState === 'rejected' && <div role="status" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5"><p className="font-bold text-amber-950">Une prestation demande votre attention</p><p className="mt-1 text-sm leading-6 text-amber-900">Consultez le motif de correction et modifiez la fiche concernée avant de la renvoyer en modération.</p><Link to="/provider/services" className="btn-primary mt-3 w-full sm:w-auto">Corriger ma prestation <ArrowRight className="h-4 w-4" /></Link></div>}
      {setupState === 'archived' && <div role="status" className="mt-5 rounded-2xl border border-faso-line bg-faso-ivory p-5"><p className="font-bold text-faso-ink">Vos anciennes prestations sont archivées</p><p className="mt-1 text-sm leading-6 text-faso-muted">Aucune prestation active n’est actuellement publiée. Vous pouvez créer une nouvelle fiche si vous souhaitez reprendre.</p><Link to="/provider/services?create=1" className="btn-primary mt-3 w-full sm:w-auto">Créer une nouvelle prestation <ArrowRight className="h-4 w-4" /></Link></div>}
      {setupState === 'ready' && <div role="status" className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-bold text-emerald-900">Votre espace est prêt à être utilisé</p><p className="mt-1 text-sm leading-6 text-emerald-800">Une prestation est enregistrée. Consultez vos demandes pour suivre les sollicitations des clients.</p><Link to="/provider/requests" className="mt-3 inline-flex items-center gap-2 font-bold text-faso-forest">Voir mes demandes <ArrowRight className="h-4 w-4" /></Link></div>}
      {setupState === 'unavailable' && <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4"><div className="flex gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" /><div><p className="font-bold text-red-900">Impossible de vérifier votre progression</p><p className="mt-1 text-sm leading-6 text-red-800">{setupError || 'La lecture du profil a échoué.'} Aucune étape n’est marquée comme terminée.</p><button type="button" onClick={() => setVerificationAttempt((attempt) => attempt + 1)} className="mt-3 min-h-11 rounded-full bg-white px-4 py-2 text-sm font-bold text-red-900 ring-1 ring-red-200 hover:bg-red-100">Réessayer</button></div></div></div>}
    </div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><DashboardLink to="/provider/profile" icon={<UserRound />} title="Profil professionnel" detail="Ajoutez une présentation, une ville et vos zones d’intervention." /><DashboardLink to="/provider/services" icon={<Briefcase />} title="Mes prestations" detail="Publiez vos services et tarifs indicatifs après modération." /><DashboardLink to="/provider/requests" icon={<MessageCircle />} title="Demandes reçues" detail="Répondez aux besoins et partagez un devis." /></div>
    <div className="mt-6 rounded-3xl bg-faso-forest p-6 text-white"><p className="text-xs font-bold uppercase tracking-wide text-faso-saffron">À savoir</p><h3 className="mt-2 font-display text-xl font-extrabold">Restez maître de l’accord</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">Une demande de devis ne réserve pas automatiquement votre temps. Le client confirme ensuite le prix, la date et le lieu convenus. Le paiement de la prestation se fait hors FasoFlow.</p><Link to="/services" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-faso-forest">Voir la vitrine publique <ArrowRight className="h-4 w-4" /></Link></div>
  </section>;
}

function DashboardLink({ to, icon, title, detail }: { to: string; icon: React.ReactNode; title: string; detail: string }) {
  return <Link to={to} className="card-surface p-5 transition hover:-translate-y-0.5 hover:shadow-card"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-faso-ivory text-faso-forest">{icon}</span><h3 className="mt-4 font-display text-lg font-extrabold">{title}</h3><p className="mt-2 text-sm leading-6 text-faso-muted">{detail}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-faso-forest">Ouvrir <ArrowRight className="h-4 w-4" /></span></Link>;
}

function SetupStep({ number, title, detail, state }: { number: string; title: string; detail: string; state: 'current' | 'complete' | 'pending' }) {
  return <li aria-current={state === 'current' ? 'step' : undefined} className={`flex min-w-0 items-start gap-3 rounded-2xl border p-4 ${state === 'current' ? 'border-faso-forest bg-faso-forest/[.04]' : state === 'complete' ? 'border-emerald-200 bg-emerald-50/70' : 'border-faso-line bg-faso-ivory/50'}`}>
    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold ${state === 'complete' ? 'bg-emerald-700 text-white' : state === 'current' ? 'bg-faso-forest text-white' : 'bg-white text-faso-muted ring-1 ring-faso-line'}`}>{state === 'complete' ? <Check className="h-4 w-4" aria-label="Terminé" /> : number}</span>
    <span className="min-w-0"><span className="block text-sm font-bold text-faso-ink">{title}</span><span className="mt-1 block text-xs leading-5 text-faso-muted">{detail}</span></span>
  </li>;
}
