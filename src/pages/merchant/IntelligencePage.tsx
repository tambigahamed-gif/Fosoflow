import { useEffect, useState } from 'react';
import { BrainCircuit, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { IntelligencePanel } from '../../features/intelligence/IntelligencePanel';
import { checkMerchantBusinessAccess } from '../../features/business/access';
import { supabase } from '../../lib/supabase';

type AccessState = 'checking' | 'allowed' | 'locked' | 'error';

export function IntelligencePage() {
  const { user } = useAuth();
  const [access, setAccess] = useState<AccessState>('checking');
  const [retry, setRetry] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    let active = true;
    setAccess('checking');
    if (!userId || !supabase) {
      setAccess('error');
      return () => { active = false; };
    }
    void checkMerchantBusinessAccess(supabase, userId).then((allowed) => {
      if (active) setAccess(allowed ? 'allowed' : 'locked');
    }).catch(() => {
      if (active) setAccess('error');
    });
    return () => { active = false; };
  }, [userId, retry]);

  return <section>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">Pilotage de boutique</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold">FasoFlow Intelligence</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-faso-muted">Descriptions, annonces, prix indicatifs, analyse des ventes et stocks, recommandations, alertes et résumés — uniquement à partir des données de votre boutique.</p>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-faso-line bg-white px-3 py-2 text-xs font-semibold text-faso-muted"><ShieldCheck className="h-4 w-4 text-faso-forest" />Données de boutique protégées</div>
    </div>
    <div className="mt-5 flex gap-3 rounded-2xl border border-faso-line bg-faso-ivory p-4 text-sm leading-6 text-faso-forest"><BrainCircuit className="mt-0.5 h-5 w-5 shrink-0" /><p>Les coordonnées, adresses et identifiants des clients ne sont pas envoyés au service d’analyse. Les appels IA sont faits exclusivement côté serveur. Aucun résultat n’est inventé si le service reste à configurer.</p></div>
    {access === 'checking' && <div role="status" className="mt-5 rounded-2xl border border-faso-line bg-white p-5 text-sm text-faso-muted">Vérification de votre abonnement Business…</div>}
    {access === 'locked' && <div className="card-surface mt-5 max-w-2xl p-6"><h3 className="font-display text-lg font-extrabold">Assistant réservé à l’offre Business</h3><p className="mt-2 text-sm leading-6 text-faso-muted">FasoFlow Intelligence est inclus dans l’offre commerçant Business à 15 000 FCFA/mois. L’abonnement doit être actif pour consulter ou analyser les données de la boutique.</p><Link to="/merchant/subscription" className="btn-primary mt-5">Voir les offres commerçant</Link></div>}
    {access === 'error' && <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><p>Impossible de vérifier votre accès Business. L’assistant reste fermé et aucune donnée n’a été envoyée.</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="btn-secondary mt-4 !min-h-10 !px-3 !py-2"><RefreshCw className="h-4 w-4" />Réessayer</button></div>}
    {access === 'allowed' && <div className="mt-5"><IntelligencePanel /></div>}
  </section>;
}
