import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../app/auth';
import { SetupNotice } from '../../components/ui/Callout';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import type { ServiceProviderProfile } from '../../types';
import { isMissingServicesMigration, parseServiceArea } from '../../features/services/service-utils';

const statusLabels: Record<ServiceProviderProfile['review_status'], string> = {
  pending_review: 'En attente de vérification', active: 'Profil validé et visible', suspended: 'Suspendu', rejected: 'À corriger',
};

export function ProviderProfileForm() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ServiceProviderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [migrationMissing, setMigrationMissing] = useState(false);

  useEffect(() => {
    if (!supabase || !user) { setLoading(false); return; }
    let live = true;
    void supabase.from('service_provider_profiles').select('*').eq('user_id', user.id).maybeSingle().then(({ data, error: queryError }) => {
      if (!live) return;
      const message = queryError?.message ?? '';
      setMigrationMissing(Boolean(queryError && isMissingServicesMigration(message)));
      setError(queryError && !isMissingServicesMigration(message) ? message : '');
      setProfile(data as ServiceProviderProfile | null);
      setLoading(false);
    }, (reason: unknown) => { if (live) { setError(reason instanceof Error ? reason.message : 'Impossible de charger le profil.'); setLoading(false); } });
    return () => { live = false; };
  }, [user]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user) return;
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get('display_name') ?? '').trim();
    const bio = String(form.get('bio') ?? '').trim();
    if (displayName.length < 2) { toast.error('Le nom professionnel doit contenir au moins deux caractères.'); return; }
    setBusy(true);
    const result = await supabase.from('service_provider_profiles').upsert({
      user_id: user.id,
      display_name: displayName,
      bio,
      city: String(form.get('city') ?? '').trim(),
      service_area: parseServiceArea(String(form.get('service_area') ?? '')),
      public_contact_phone: String(form.get('public_contact_phone') ?? '').trim() || null,
    }, { onConflict: 'user_id' }).select('*').single();
    setBusy(false);
    if (result.error) { toast.error(`Profil non enregistré : ${result.error.message}`); return; }
    setProfile(result.data as ServiceProviderProfile);
    toast.success('Profil enregistré et envoyé en vérification.');
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  return <section className="max-w-3xl"><p className="eyebrow">Votre identité professionnelle</p><h2 className="mt-1 font-display text-2xl font-extrabold">Profil professionnel</h2><p className="mt-2 text-sm leading-6 text-faso-muted">Présentez votre activité et vos zones d’intervention. Les coordonnées personnelles restent privées ; seul le numéro que vous choisissez de publier sera montré aux visiteurs.</p>
    {migrationMissing && <p role="status" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">La migration 015 n’est pas disponible dans le schéma connecté. Le formulaire ne prétend pas enregistrer votre profil.</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading ? <div className="mt-5 h-40 animate-pulse rounded-3xl bg-white" /> : !migrationMissing && <>
      {profile && <p className="mt-5 rounded-2xl bg-faso-ivory p-4 text-sm"><span className="font-bold">État :</span> <span className="font-semibold text-faso-forest">{statusLabels[profile.review_status]}</span>{profile.review_status === 'active' && <span className="mt-1 block text-xs text-faso-muted">Toute modification du profil repasse par une vérification.</span>}</p>}
      <form onSubmit={(event) => void save(event)} className="card-surface mt-5 grid gap-4 p-5 sm:grid-cols-2">
        <label className="label sm:col-span-2">Nom professionnel<input className="field mt-1" name="display_name" defaultValue={profile?.display_name ?? ''} required minLength={2} maxLength={120} /></label>
        <label className="label">Ville principale<input className="field mt-1" name="city" defaultValue={profile?.city ?? ''} maxLength={100} placeholder="Ouagadougou" /></label>
        <label className="label">Zones d’intervention<input className="field mt-1" name="service_area" defaultValue={profile?.service_area?.join(', ') ?? ''} maxLength={500} placeholder="Ex. Karpala, Dassasgho" /><span className="mt-1 block text-xs font-normal text-faso-muted">Séparez les zones par des virgules.</span></label>
        <label className="label sm:col-span-2">Présentation<textarea className="field mt-1 min-h-28" name="bio" defaultValue={profile?.bio ?? ''} maxLength={2500} placeholder="Votre expérience, vos méthodes et les types de besoins auxquels vous répondez…" /></label>
        <label className="label sm:col-span-2">Téléphone public (facultatif)<input className="field mt-1" name="public_contact_phone" type="tel" defaultValue={profile?.public_contact_phone ?? ''} maxLength={32} placeholder="+226 …" /><span className="mt-1 block text-xs font-normal text-faso-muted">Ce numéro sera visible sur votre profil public. La messagerie FasoFlow reste disponible sans publier de numéro.</span></label>
        <button disabled={busy} className="btn-primary sm:col-span-2">{busy ? 'Enregistrement…' : profile ? 'Enregistrer les modifications' : 'Créer mon profil professionnel'}</button>
      </form>
    </>}
  </section>;
}
