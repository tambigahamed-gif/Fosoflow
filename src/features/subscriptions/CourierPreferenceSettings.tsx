import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../app/auth';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { EmptyState, SetupNotice } from '../../components/ui/Callout';

type Subscription = { current_period_end: string | null; plans: { code?: string; audience?: string } | { code?: string; audience?: string }[] | null };

export function CourierPreferenceSettings() {
  const { user, profile, refreshProfile } = useAuth();
  const [phase, setPhase] = useState<'loading' | 'enabled' | 'locked' | 'error'>('loading');
  const [zone, setZone] = useState(profile?.preferred_delivery_zone ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setZone(profile?.preferred_delivery_zone ?? ''); }, [profile?.preferred_delivery_zone]);
  useEffect(() => {
    const userId = user?.id;
    if (!supabase || !userId) return;
    let current = true;
    void supabase.from('subscriptions').select('current_period_end,plans!inner(code,audience)').eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data, error }) => {
      if (error) { if (current) setPhase('error'); return; }
      const subscription = data as Subscription | null;
      const plan = Array.isArray(subscription?.plans) ? subscription?.plans[0] : subscription?.plans;
      const unexpired = !subscription?.current_period_end || new Date(subscription.current_period_end).getTime() > Date.now();
      const entitled = unexpired && plan?.audience === 'courier' && ['premium', 'pro'].includes(plan.code ?? '');
      if (current) setPhase(entitled ? 'enabled' : 'locked');
    });
    return () => { current = false; };
  }, [user?.id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true);
    const { error } = await supabase.rpc('set_courier_delivery_preference', { p_zone: zone.trim() || null });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await refreshProfile();
    toast.success(zone.trim() ? 'Préférence de zone enregistrée.' : 'Préférence de zone effacée.');
  }

  if (!isSupabaseConfigured) return <div className="mt-5"><SetupNotice /></div>;
  if (phase === 'loading') return <div className="card-surface mt-5 h-28 animate-pulse" />;
  if (phase === 'error') return <div className="mt-5"><EmptyState title="Préférence indisponible"><p>Appliquez les migrations FasoFlow et vérifiez les règles d’accès avant de réessayer.</p></EmptyState></div>;
  if (phase === 'locked') return <div className="card-surface mt-5 flex flex-wrap items-center justify-between gap-4 p-5"><div><h3 className="font-bold">Préférences de livraison</h3><p className="mt-1 text-sm text-faso-muted">Le tri par zone est inclus dans les offres livreur Premium et Pro. Vos données de profil restent conservées.</p></div><Link to="/courier/subscription" className="btn-secondary">Voir les offres <ArrowRight className="h-4 w-4" /></Link></div>;

  return <form onSubmit={(event) => void save(event)} className="card-surface mt-5 p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-faso-ivory text-faso-forest"><MapPin className="h-5 w-5" /></span><div><h3 className="font-bold">Ma zone préférée <span className="badge-soft ml-2">Premium · Pro</span></h3><p className="mt-1 text-sm leading-6 text-faso-muted">Les demandes correspondantes seront remontées en premier ; les autres courses restent accessibles. Cette préférence ne déclenche ni géolocalisation ni suivi GPS.</p></div></div><label className="label mt-4">Ville ou zone (2 à 120 caractères)<input className="field" value={zone} onChange={(event) => setZone(event.target.value)} minLength={zone.trim() ? 2 : undefined} maxLength={120} placeholder="Ex. Ouagadougou, Karpala" /></label><div className="mt-4 flex flex-wrap gap-2"><button disabled={saving} className="btn-primary">{saving ? 'Enregistrement…' : 'Enregistrer ma préférence'}</button><button type="button" disabled={saving || !zone} onClick={() => setZone('')} className="btn-secondary">Effacer</button></div></form>;
}
