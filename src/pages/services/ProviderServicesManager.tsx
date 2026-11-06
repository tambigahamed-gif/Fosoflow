import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ImagePlus, PackagePlus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../app/auth';
import { EmptyState, SetupNotice } from '../../components/ui/Callout';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import type { ServiceCategory, ServiceListing, ServiceProviderProfile } from '../../types';
import { isMissingServicesMigration, parseServiceArea, servicePriceLabel } from '../../features/services/service-utils';

const statusLabels: Record<ServiceListing['status'], string> = { pending_review: 'En attente de modération', active: 'Publié', rejected: 'À corriger', archived: 'Archivé' };

export function ProviderServicesManager() {
  const { user } = useAuth();
  const [services, setServices] = useState<ServiceListing[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [profile, setProfile] = useState<ServiceProviderProfile | null>(null);
  const [editing, setEditing] = useState<ServiceListing | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [migrationMissing, setMigrationMissing] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !user) { setLoading(false); return; }
    setLoading(true);
    const [profileResult, serviceResult, categoryResult] = await Promise.all([
      supabase.from('service_provider_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('service_listings').select('*').eq('provider_id', user.id).order('created_at', { ascending: false }),
      supabase.from('service_categories').select('*').eq('is_active', true).order('sort_order').order('name'),
    ]);
    const queryError = profileResult.error ?? serviceResult.error ?? categoryResult.error;
    const message = queryError?.message ?? '';
    setMigrationMissing(Boolean(queryError && isMissingServicesMigration(message)));
    setError(queryError && !isMissingServicesMigration(message) ? message : '');
    setProfile(profileResult.data as ServiceProviderProfile | null);
    setServices((serviceResult.data as ServiceListing[] | null) ?? []);
    setCategories((categoryResult.data as ServiceCategory[] | null) ?? []);
    setLoading(false);
  }, [user]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !profile) { toast.error('Créez d’abord votre profil professionnel.'); return; }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get('title') ?? '').trim();
    const minRaw = String(form.get('price_min_xof') ?? '').trim();
    const maxRaw = String(form.get('price_max_xof') ?? '').trim();
    const min = minRaw ? Number(minRaw) : null;
    const max = maxRaw ? Number(maxRaw) : null;
    if (title.length < 3) { toast.error('Le titre doit contenir au moins trois caractères.'); return; }
    if ((min !== null && (!Number.isSafeInteger(min) || min < 0)) || (max !== null && (!Number.isSafeInteger(max) || max < 0))) { toast.error('Les tarifs indicatifs doivent être des nombres entiers positifs en XOF.'); return; }
    if (min !== null && max !== null && max < min) { toast.error('Le prix maximum doit être supérieur ou égal au prix minimum.'); return; }
    const selectedFiles = Array.from(form.getAll('images')).filter((file): file is File => file instanceof File && file.size > 0);
    if (selectedFiles.some((file) => !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { toast.error('Utilisez des images JPG, PNG ou WebP de 5 Mo maximum chacune.'); return; }
    setBusy(true);
    const imageUrls = [...(editing?.image_urls ?? [])];
    for (const file of selectedFiles) {
      if (imageUrls.length >= 8) { setBusy(false); toast.error('Une prestation peut avoir au maximum 8 photos.'); return; }
      const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const upload = await supabase.storage.from('service-images').upload(path, file, { upsert: false, contentType: file.type });
      if (upload.error) { setBusy(false); toast.error(`Photo non envoyée : ${upload.error.message}`); return; }
      imageUrls.push(supabase.storage.from('service-images').getPublicUrl(path).data.publicUrl);
    }
    const payload = {
      provider_id: user.id,
      category_id: String(form.get('category_id') ?? '') || null,
      title,
      description: String(form.get('description') ?? '').trim(),
      city: String(form.get('city') ?? '').trim(),
      service_area: parseServiceArea(String(form.get('service_area') ?? '')),
      price_min_xof: min,
      price_max_xof: max,
      price_unit: String(form.get('price_unit') ?? '').trim() || null,
      image_urls: imageUrls,
      status: 'pending_review' as const,
    };
    const result = editing
      ? await supabase.from('service_listings').update(payload).eq('id', editing.id).select('*').single()
      : await supabase.from('service_listings').insert(payload).select('*').single();
    setBusy(false);
    if (result.error) { toast.error(`Prestation non enregistrée : ${result.error.message}`); return; }
    toast.success(editing ? 'Modifications enregistrées. La prestation repasse en modération.' : 'Prestation envoyée en modération.');
    setEditing(null); setShowForm(false); formElement.reset(); await refresh();
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  return <section><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Votre catalogue professionnel</p><h2 className="mt-1 font-display text-2xl font-extrabold">Mes prestations</h2><p className="mt-2 text-sm text-faso-muted">Les nouvelles prestations et les modifications sont vérifiées avant publication.</p></div><button className="btn-primary" onClick={() => { setEditing(null); setShowForm((value) => !value); }}><PackagePlus className="h-4 w-4" />{showForm ? 'Fermer' : 'Ajouter une prestation'}</button></div>
    {migrationMissing && <p role="status" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">La migration 015 n’est pas installée dans le schéma connecté. Le formulaire n’envoie aucune donnée prétendument enregistrée.</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!profile && !loading && !migrationMissing && <p className="mt-5 rounded-2xl bg-faso-ivory p-4 text-sm">Complétez d’abord votre <a className="font-bold text-faso-forest" href="/provider/profile">profil professionnel</a>.</p>}
    {showForm && !migrationMissing && profile && <form onSubmit={(event) => void save(event)} className="card-surface mt-5 grid gap-4 p-5 sm:grid-cols-2">
      <h3 className="font-display text-lg font-extrabold sm:col-span-2">{editing ? `Modifier ${editing.title}` : 'Nouvelle prestation'}</h3>
      <label className="label">Titre<input className="field mt-1" name="title" required minLength={3} maxLength={160} defaultValue={editing?.title ?? ''} /></label>
      <label className="label">Famille<select className="field mt-1" name="category_id" defaultValue={editing?.category_id ?? ''}><option value="">Choisir une famille</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="label sm:col-span-2">Description<textarea className="field mt-1 min-h-28" name="description" maxLength={4000} defaultValue={editing?.description ?? ''} placeholder="Décrivez ce qui est inclus, vos méthodes et les limites du service…" /></label>
      <label className="label">Ville principale<input className="field mt-1" name="city" maxLength={100} defaultValue={editing?.city ?? profile.city} /></label>
      <label className="label">Zones d’intervention<input className="field mt-1" name="service_area" maxLength={500} defaultValue={editing?.service_area?.join(', ') ?? profile.service_area.join(', ')} placeholder="Séparez les zones par des virgules" /></label>
      <label className="label">Tarif minimum indicatif (XOF)<input className="field mt-1" type="number" name="price_min_xof" min="0" step="1" defaultValue={editing?.price_min_xof ?? ''} placeholder="Facultatif" /></label>
      <label className="label">Tarif maximum indicatif (XOF)<input className="field mt-1" type="number" name="price_max_xof" min="0" step="1" defaultValue={editing?.price_max_xof ?? ''} placeholder="Facultatif" /></label>
      <label className="label sm:col-span-2">Unité / précision du tarif<input className="field mt-1" name="price_unit" maxLength={80} defaultValue={editing?.price_unit ?? ''} placeholder="Ex. par intervention, par journée, sur devis" /></label>
      <label className="label sm:col-span-2">Photos<input className="field mt-1" type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple /><span className="mt-1 flex items-center gap-1 text-xs font-normal text-faso-muted"><ImagePlus className="h-3.5 w-3.5" />JPG, PNG ou WebP · 5 Mo maximum par photo · 8 photos au total.{editing?.image_urls?.length ? ` ${editing.image_urls.length} photo(s) existante(s) conservée(s).` : ''}</span></label>
      <button disabled={busy} className="btn-primary sm:col-span-2">{busy ? 'Envoi…' : editing ? 'Enregistrer et renvoyer en modération' : 'Envoyer en modération'}</button>
    </form>}
    {loading ? <div className="mt-6 h-40 animate-pulse rounded-3xl bg-white" /> : !migrationMissing && <div className="mt-6 grid gap-3">{services.length ? services.map((service) => <article key={service.id} className="flex flex-col gap-4 rounded-2xl border border-faso-line bg-white p-4 sm:flex-row sm:items-center"><div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-faso-ivory text-faso-forest">{service.image_urls?.[0] ? <img src={service.image_urls[0]} alt="" loading="lazy" className="h-full w-full object-cover" /> : <PackagePlus />}</div><div className="min-w-0 flex-1"><h3 className="font-bold">{service.title}</h3><p className="mt-1 text-xs text-faso-muted">{servicePriceLabel(service.price_min_xof, service.price_max_xof, service.price_unit)} · {service.city || profile?.city || 'Zone non renseignée'} · {statusLabels[service.status]}</p></div><button className="btn-secondary !min-h-9 !px-3 !py-2" onClick={() => { setEditing(service); setShowForm(true); }} aria-label={`Modifier ${service.title}`}><Pencil className="h-4 w-4" />Modifier</button></article>) : <EmptyState title="Votre catalogue attend sa première prestation"><p>Créez une fiche claire avec vos tarifs indicatifs ou laissez le tarif sur devis.</p></EmptyState>}</div>}
  </section>;
}
