import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Briefcase, MessageCircle, UserRound } from 'lucide-react';
import { ChatPanel } from '../../features/messaging/ChatPanel';
import { useAuth } from '../../app/auth';
import { EmptyState, SetupNotice } from '../../components/ui/Callout';
import { isSupabaseConfigured } from '../../lib/supabase';
import { ProviderProfileForm } from './ProviderProfileForm';
import { ProviderServicesManager } from './ProviderServicesManager';
import { ProviderRequestsPanel } from './ProviderRequestsPanel';

export function ServiceProviderDashboardPage() {
  const { section = 'dashboard' } = useParams();
  const { profile } = useAuth();
  if (!isSupabaseConfigured) return <div><h2 className="font-display text-2xl font-extrabold">Espace prestataire</h2><div className="mt-5"><SetupNotice /></div></div>;
  if (section === 'profile') return <ProviderProfileForm />;
  if (section === 'services') return <ProviderServicesManager />;
  if (section === 'requests') return <ProviderRequestsPanel />;
  if (section === 'messages') return <ChatPanel />;
  if (section !== 'dashboard') return <section><h2 className="font-display text-2xl font-extrabold">Espace prestataire</h2><div className="mt-5"><EmptyState title="Section indisponible"><Link to="/provider/dashboard" className="font-bold text-faso-forest">Retour au tableau de bord</Link></EmptyState></div></section>;
  return <section><p className="eyebrow">Votre activité de services</p><h2 className="mt-1 font-display text-2xl font-extrabold">Bonjour{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-faso-muted">Présentez votre savoir-faire, recevez des demandes de devis et convenez directement avec vos clients. L’inscription prestataire est gratuite ; aucune commission ou réservation n’est gérée par FasoFlow.</p>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><DashboardLink to="/provider/profile" icon={<UserRound />} title="Profil professionnel" detail="Ajoutez une présentation, une ville et vos zones d’intervention." /><DashboardLink to="/provider/services" icon={<Briefcase />} title="Mes prestations" detail="Publiez vos services et tarifs indicatifs après modération." /><DashboardLink to="/provider/requests" icon={<MessageCircle />} title="Demandes reçues" detail="Répondez aux besoins et partagez un devis." /></div>
    <div className="mt-6 rounded-3xl bg-faso-forest p-6 text-white"><p className="text-xs font-bold uppercase tracking-wide text-faso-saffron">À savoir</p><h3 className="mt-2 font-display text-xl font-extrabold">Restez maître de l’accord</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">Une demande de devis ne réserve pas automatiquement votre temps. Le client confirme ensuite le prix, la date et le lieu convenus. Le paiement de la prestation se fait hors FasoFlow.</p><Link to="/services" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-faso-forest">Voir la vitrine publique <ArrowRight className="h-4 w-4" /></Link></div>
  </section>;
}

function DashboardLink({ to, icon, title, detail }: { to: string; icon: React.ReactNode; title: string; detail: string }) {
  return <Link to={to} className="card-surface p-5 transition hover:-translate-y-0.5 hover:shadow-card"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-faso-ivory text-faso-forest">{icon}</span><h3 className="mt-4 font-display text-lg font-extrabold">{title}</h3><p className="mt-2 text-sm leading-6 text-faso-muted">{detail}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-faso-forest">Ouvrir <ArrowRight className="h-4 w-4" /></span></Link>;
}
