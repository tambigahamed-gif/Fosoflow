import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Briefcase, MapPin, Phone, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../app/auth';
import { EmptyState, LoadingState, SetupNotice } from '../../components/ui/Callout';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import type { ServiceCategory, ServiceListing, ServiceProviderProfile } from '../../types';
import { isMissingServicesMigration, servicePriceLabel } from '../../features/services/service-utils';
import { ServiceProviderReviews } from './ServiceProviderReviews';

interface PublicService extends ServiceListing {
  service_categories?: Pick<ServiceCategory, 'name' | 'slug'> | null;
  service_provider_profiles?: Pick<ServiceProviderProfile, 'user_id' | 'display_name' | 'city' | 'bio' | 'service_area' | 'public_contact_phone' | 'review_status'> | null;
}

export function ServicesPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [city, setCity] = useState(params.get('city') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [services, setServices] = useState<PublicService[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');
  const [migrationMissing, setMigrationMissing] = useState(false);

  useEffect(() => { setSearch(params.get('q') ?? ''); setCity(params.get('city') ?? ''); setCategory(params.get('category') ?? ''); }, [params]);
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    setError('');
    void Promise.all([
      supabase.from('service_listings').select('*,service_categories(name,slug),service_provider_profiles!inner(user_id,display_name,city,bio,service_area,public_contact_phone,review_status)').eq('status', 'active').eq('service_provider_profiles.review_status', 'active').order('created_at', { ascending: false }).limit(80),
      supabase.from('service_categories').select('*').eq('is_active', true).order('sort_order').order('name'),
    ]).then(([listingResult, categoryResult]) => {
      if (!live) return;
      const queryError = listingResult.error ?? categoryResult.error;
      const message = queryError?.message ?? '';
      setMigrationMissing(Boolean(queryError && isMissingServicesMigration(message)));
      setError(queryError && !isMissingServicesMigration(message) ? message : '');
      setServices((listingResult.data as unknown as PublicService[] | null) ?? []);
      setCategories((categoryResult.data as ServiceCategory[] | null) ?? []);
      setLoading(false);
    }, (reason: unknown) => {
      if (live) { setError(reason instanceof Error ? reason.message : 'Vérifiez votre connexion puis réessayez.'); setLoading(false); }
    });
    return () => { live = false; };
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('fr');
    const cityTerm = city.trim().toLocaleLowerCase('fr');
    return services.filter((item) => {
      const provider = item.service_provider_profiles;
      const searchable = `${item.title} ${item.description} ${item.city} ${item.service_categories?.name ?? ''} ${provider?.display_name ?? ''} ${(item.service_area ?? []).join(' ')}`.toLocaleLowerCase('fr');
      return (!term || searchable.includes(term))
        && (!cityTerm || `${item.city} ${provider?.city ?? ''} ${(item.service_area ?? []).join(' ')}`.toLocaleLowerCase('fr').includes(cityTerm))
        && (!category || item.service_categories?.slug === category);
    });
  }, [services, search, city, category]);

  function updateQuery(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (search.trim()) next.set('q', search.trim());
    if (city.trim()) next.set('city', city.trim());
    if (category) next.set('category', category);
    setParams(next);
  }

  return <section className="page-wrap py-12 sm:py-16">
    <div className="max-w-3xl"><p className="eyebrow">Savoir-faire près de vous</p><h1 className="section-title mt-2">Trouver un professionnel</h1><p className="mt-3 leading-7 text-faso-muted">Découvrez des prestations publiées par des professionnels du Burkina Faso. Demandez un devis, échangez avant de convenir d’une date et d’un lieu.</p></div>
    {!isSupabaseConfigured ? <div className="mt-8"><SetupNotice /></div> : <>
      <form onSubmit={updateQuery} className="mt-8 grid gap-3 rounded-3xl border border-faso-line bg-white p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <label className="label">Recherche<input className="field mt-1" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ex. plomberie, couture…" /></label>
        <label className="label">Ville / zone<input className="field mt-1" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ex. Ouagadougou" /></label>
        <label className="label">Famille<select className="field mt-1" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Toutes les familles</option>{categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>
        <button className="btn-primary sm:mb-0.5"><Search className="h-4 w-4" />Filtrer</button>
      </form>
      {migrationMissing && <p role="status" className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">La marketplace de services nécessite la migration locale `015_marketplace_services_and_product_modes.sql`. Aucune annonce fictive n’est affichée.</p>}
      {error && <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Impossible de charger les services : {error}. Réessayez plus tard.</div>}
      {loading ? <div className="mt-7"><LoadingState label="Chargement des prestations…" /></div> : !migrationMissing && !error && <div className="mt-7">{visible.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map((service) => <ServiceCard key={service.id} service={service} />)}</div> : <EmptyState title={services.length ? 'Aucun résultat pour ces filtres' : 'Aucune prestation publiée pour le moment'}><p>Les profils et prestations seront visibles après validation. Aucun prestataire ou tarif n’est inventé.</p>{services.length > 0 && <button className="mt-3 font-bold text-faso-forest" onClick={() => { setSearch(''); setCity(''); setCategory(''); setParams({}); }}>Effacer les filtres</button>}</EmptyState>}</div>}
    </>}
  </section>;
}

function ServiceCard({ service }: { service: PublicService }) {
  const image = service.image_urls?.[0];
  const provider = service.service_provider_profiles;
  return <article className="overflow-hidden rounded-3xl border border-faso-line bg-white transition hover:-translate-y-1 hover:shadow-card">
    <Link to={`/services/${service.id}`} className="block aspect-[4/3] overflow-hidden bg-faso-pale" aria-label={`Voir la prestation ${service.title}`}>
      {image ? <img src={image} loading="lazy" alt={service.title} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-faso-forest"><Briefcase className="h-10 w-10" /></div>}
    </Link>
    <div className="p-5"><div className="flex items-start justify-between gap-3"><h2 className="font-display text-lg font-extrabold"><Link to={`/services/${service.id}`} className="hover:text-faso-forest">{service.title}</Link></h2><span className="shrink-0 rounded-xl bg-faso-ivory px-2.5 py-1.5 text-xs font-bold text-faso-forest">{servicePriceLabel(service.price_min_xof, service.price_max_xof, service.price_unit)}</span></div>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-faso-muted">{service.description}</p><div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-faso-muted"><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{service.city || provider?.city || 'Burkina Faso'}</span>{service.service_categories?.name && <span className="rounded-full bg-faso-ivory px-2.5 py-1">{service.service_categories.name}</span>}</div>
      <Link to={`/providers/${service.provider_id}`} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-faso-forest"><span>{provider?.display_name ?? 'Professionnel FasoFlow'}</span><BadgeCheck className="h-4 w-4" /></Link>
    </div>
  </article>;
}

export function ServicePage() {
  const { id = '' } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [service, setService] = useState<PublicService | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let live = true;
    void supabase.from('service_listings').select('*,service_categories(name,slug),service_provider_profiles!inner(user_id,display_name,city,bio,service_area,public_contact_phone,review_status)').eq('id', id).eq('status', 'active').eq('service_provider_profiles.review_status', 'active').maybeSingle()
      .then(({ data, error: queryError }) => {
        if (!live) return;
        const message = queryError?.message ?? '';
        setMigrationMissing(Boolean(queryError && isMissingServicesMigration(message)));
        setError(queryError && !isMissingServicesMigration(message) ? message : '');
        setService(data as unknown as PublicService | null);
        setLoading(false);
      }, (reason: unknown) => { if (live) { setError(reason instanceof Error ? reason.message : 'Vérifiez votre connexion puis réessayez.'); setLoading(false); } });
    return () => { live = false; };
  }, [id]);

  async function requestQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) { navigate('/login?next=%2Fservices%2F' + encodeURIComponent(id)); return; }
    if (profile?.role !== 'client') { toast.error('Les demandes de devis sont réservées aux comptes clients.'); return; }
    if (!supabase || !service) return;
    const form = new FormData(event.currentTarget);
    const localDate = String(form.get('requested_at') ?? '');
    const requestedAt = localDate ? new Date(localDate).toISOString() : null;
    setBusy(true);
    const result = await supabase.rpc('create_service_request', {
      p_service_id: service.id,
      p_message: String(form.get('message') ?? '').trim(),
      p_requested_at: requestedAt,
      p_requested_location: String(form.get('requested_location') ?? '').trim() || null,
    });
    if (result.error) { setBusy(false); toast.error(`Demande non envoyée : ${result.error.message}`); return; }
    const conversation = await supabase.rpc('get_or_create_service_conversation', { p_request_id: result.data });
    setBusy(false);
    if (conversation.error) { toast.success('Demande enregistrée. Vous pourrez retrouver le professionnel dans vos demandes de devis.'); navigate('/client/service-requests'); return; }
    toast.success('Demande de devis envoyée. Vous pouvez poursuivre la discussion.');
    navigate(`/client/messages?conversation=${encodeURIComponent(String(conversation.data))}`);
  }

  if (loading) return <section className="page-wrap py-16"><LoadingState /></section>;
  if (!isSupabaseConfigured) return <section className="page-wrap py-16"><SetupNotice /></section>;
  if (migrationMissing) return <section className="page-wrap py-16"><EmptyState title="Migration services requise"><p>Appliquez d’abord la migration locale 015 après revue des préconditions Supabase. Aucune migration distante n’est exécutée par cette page.</p></EmptyState></section>;
  if (error) return <section className="page-wrap py-16"><div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">Impossible de charger cette prestation : {error}</div></section>;
  if (!service) return <section className="page-wrap py-16"><EmptyState title="Prestation introuvable"><Link to="/services" className="font-bold text-faso-forest">Parcourir les services</Link></EmptyState></section>;
  const provider = service.service_provider_profiles;
  return <section className="page-wrap py-12"><Link to="/services" className="text-sm font-bold text-faso-forest">← Tous les services</Link><div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
    <div><div className="grid gap-3 sm:grid-cols-2">{service.image_urls?.length ? service.image_urls.slice(0, 4).map((url, index) => <img key={`${url}-${index}`} src={url} alt={`${service.title} — photo ${index + 1}`} className="aspect-[4/3] w-full rounded-3xl bg-faso-pale object-cover" loading="lazy" />) : <div className="grid aspect-[4/3] place-items-center rounded-3xl bg-faso-pale text-faso-forest sm:col-span-2"><Briefcase className="h-12 w-12" /></div>}</div><p className="eyebrow mt-7">{service.service_categories?.name ?? 'Prestation locale'}</p><h1 className="section-title mt-2">{service.title}</h1><p className="mt-4 whitespace-pre-line leading-7 text-faso-muted">{service.description}</p><div className="mt-5 flex flex-wrap gap-2">{[service.city, ...(service.service_area ?? [])].filter(Boolean).map((area) => <span key={area} className="rounded-full bg-faso-ivory px-3 py-1.5 text-xs font-semibold text-faso-muted"><MapPin className="mr-1 inline h-3.5 w-3.5" />{area}</span>)}</div><Link to={`/providers/${service.provider_id}`} className="mt-7 flex items-center gap-4 rounded-2xl border border-faso-line bg-white p-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-faso-ivory text-faso-forest"><BadgeCheck /></div><div><p className="font-bold">{provider?.display_name}</p><p className="mt-1 text-xs text-faso-muted">Profil professionnel approuvé par FasoFlow · {provider?.city || 'Burkina Faso'}</p></div><ArrowRight className="ml-auto h-4 w-4 text-faso-forest" /></Link>{provider?.public_contact_phone && <a href={`tel:${provider.public_contact_phone}`} className="btn-secondary mt-3"><Phone className="h-4 w-4" />Appeler le professionnel</a>}</div>
    <aside className="card-surface h-fit p-5 sm:p-6"><p className="eyebrow">Tarif indicatif</p><p className="mt-2 font-display text-2xl font-extrabold text-faso-forest">{servicePriceLabel(service.price_min_xof, service.price_max_xof, service.price_unit)}</p><p className="mt-3 text-sm leading-6 text-faso-muted">Le tarif affiché, s’il existe, est indicatif. Le prestataire confirmera le prix et les conditions dans un devis. FasoFlow ne gère pas le paiement de la prestation.</p>
      <form onSubmit={(event) => void requestQuote(event)} className="mt-6 border-t border-faso-line pt-5"><h2 className="font-display text-lg font-extrabold">Demander un devis</h2><label className="label mt-4">Décrivez votre besoin<textarea className="field min-h-28" name="message" required minLength={5} maxLength={2000} placeholder="Expliquez le travail souhaité, les dimensions, l’urgence ou les détails utiles…" /></label><label className="label mt-4">Date souhaitée (facultatif)<input className="field" type="datetime-local" name="requested_at" /></label><label className="label mt-4">Lieu / zone (facultatif)<input className="field" name="requested_location" maxLength={500} placeholder="Ville, quartier ou repère" /></label><p className="mt-3 text-xs leading-5 text-faso-muted">La date et le lieu indiqués sont une préférence, pas une réservation. Ils ne deviennent convenus qu’après échange et accord.</p><button className="btn-primary mt-5 w-full" disabled={busy || (Boolean(user) && profile?.role !== 'client')}>{busy ? 'Envoi…' : user ? 'Envoyer ma demande' : 'Se connecter pour demander un devis'}</button></form>
    </aside>
  </div></section>;
}

export function ServiceProviderPage() {
  const { id = '' } = useParams();
  const [provider, setProvider] = useState<ServiceProviderProfile | null>(null);
  const [services, setServices] = useState<PublicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migrationMissing, setMigrationMissing] = useState(false);
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let live = true;
    void Promise.all([
      supabase.from('service_provider_profiles').select('*').eq('user_id', id).eq('review_status', 'active').maybeSingle(),
      supabase.from('service_listings').select('*,service_categories(name,slug),service_provider_profiles!inner(user_id,display_name,city,bio,service_area,public_contact_phone,review_status)').eq('provider_id', id).eq('status', 'active').eq('service_provider_profiles.review_status', 'active').order('created_at', { ascending: false }),
    ]).then(([providerResult, servicesResult]) => {
      if (!live) return;
      const queryError = providerResult.error ?? servicesResult.error;
      const message = queryError?.message ?? '';
      setMigrationMissing(Boolean(queryError && isMissingServicesMigration(message)));
      setError(queryError && !isMissingServicesMigration(message) ? message : '');
      setProvider(providerResult.data as ServiceProviderProfile | null);
      setServices((servicesResult.data as unknown as PublicService[] | null) ?? []);
      setLoading(false);
    }, (reason: unknown) => { if (live) { setError(reason instanceof Error ? reason.message : 'Vérifiez votre connexion puis réessayez.'); setLoading(false); } });
    return () => { live = false; };
  }, [id]);
  if (loading) return <section className="page-wrap py-16"><LoadingState /></section>;
  if (!isSupabaseConfigured) return <section className="page-wrap py-16"><SetupNotice /></section>;
  if (migrationMissing) return <section className="page-wrap py-16"><EmptyState title="Migration services requise"><p>Le profil professionnel sera visible après revue et application autorisée de la migration 015.</p></EmptyState></section>;
  if (error) return <section className="page-wrap py-16"><div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">Impossible de charger ce profil : {error}</div></section>;
  if (!provider) return <section className="page-wrap py-16"><EmptyState title="Profil professionnel introuvable"><Link to="/services" className="font-bold text-faso-forest">Découvrir les services</Link></EmptyState></section>;
  return <section className="page-wrap py-12"><Link to="/services" className="text-sm font-bold text-faso-forest">← Parcourir les services</Link><div className="mt-6 rounded-3xl border border-faso-line bg-white p-6 sm:p-9"><span className="badge-soft"><BadgeCheck className="mr-1.5 h-4 w-4" />Profil approuvé par FasoFlow</span><h1 className="mt-4 font-display text-3xl font-extrabold">{provider.display_name}</h1><p className="mt-2 inline-flex items-center gap-1 text-sm text-faso-muted"><MapPin className="h-4 w-4" />{provider.city || 'Burkina Faso'}{provider.service_area.length ? ` · ${provider.service_area.join(', ')}` : ''}</p><p className="mt-5 max-w-3xl whitespace-pre-line leading-7 text-faso-muted">{provider.bio || 'Aucune présentation renseignée.'}</p>{provider.public_contact_phone && <a className="btn-secondary mt-5" href={`tel:${provider.public_contact_phone}`}><Phone className="h-4 w-4" />Contacter {provider.display_name}</a>}</div><ServiceProviderReviews providerId={provider.user_id} /><h2 className="section-title mt-10">Prestations publiées</h2><div className="mt-5">{services.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{services.map((service) => <ServiceCard key={service.id} service={service} />)}</div> : <EmptyState title="Aucune prestation active"><p>Les prestations du professionnel apparaîtront ici après validation.</p></EmptyState>}</div></section>;
}
