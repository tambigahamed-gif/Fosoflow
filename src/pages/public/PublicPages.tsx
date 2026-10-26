import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BadgeCheck, ChevronRight, CircleHelp, Leaf, PackageCheck, Search, ShieldCheck, ShoppingBag, Store, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { formatXof } from '../../lib/utils';
import type { Category, Product, Shop } from '../../types';
import { ProductCard } from '../../components/products/ProductCard';
import { ProductActions } from '../../features/orders/ProductActions';
import { SetupNotice, EmptyState, LoadingState } from '../../components/ui/Callout';
import { plansFor } from '../../features/subscriptions/plans';
import { useAuth } from '../../app/auth';

const demoProducts: Product[] = [
  { id: 'demo-basket', shop_id: '', category_id: null, name: 'Panier tressé — exemple', description: 'Visuel de présentation uniquement.', price_xof: 8500, stock_quantity: 1, image_url: '/images/product-1.webp', status: 'active', created_at: new Date().toISOString(), shops: { id: '', name: 'Démonstration', city: 'Ouagadougou', logo_url: null } },
  { id: 'demo-textile', shop_id: '', category_id: null, name: 'Tissu tissé — exemple', description: 'Visuel de présentation uniquement.', price_xof: 12500, stock_quantity: 1, image_url: '/images/product-2.webp', status: 'active', created_at: new Date().toISOString(), shops: { id: '', name: 'Démonstration', city: 'Bobo-Dioulasso', logo_url: null } },
  { id: 'demo-shea', shop_id: '', category_id: null, name: 'Beurre de karité — exemple', description: 'Visuel de présentation uniquement.', price_xof: 4000, stock_quantity: 1, image_url: '/images/product-3.webp', status: 'active', created_at: new Date().toISOString(), shops: { id: '', name: 'Démonstration', city: 'Koudougou', logo_url: null } },
  { id: 'demo-produce', shop_id: '', category_id: null, name: 'Produits frais — exemple', description: 'Visuel de présentation uniquement.', price_xof: 2500, stock_quantity: 1, image_url: '/images/product-4.webp', status: 'active', created_at: new Date().toISOString(), shops: { id: '', name: 'Démonstration', city: 'Ouagadougou', logo_url: null } },
];

const categoryCards = [
  { name: 'Mode & artisanat', slug: 'mode-artisanat', detail: 'Créations et savoir-faire', icon: '✳', tone: 'bg-[#F1E6D7]' },
  { name: 'Maison', slug: 'maison', detail: 'Des pièces qui ont une histoire', icon: '⌂', tone: 'bg-[#E5EEE9]' },
  { name: 'Beauté & bien-être', slug: 'beaute-bien-etre', detail: 'Le soin au naturel', icon: '◌', tone: 'bg-[#F5E6E0]' },
  { name: 'Alimentation', slug: 'alimentation', detail: 'Le bon goût de chez nous', icon: '◉', tone: 'bg-[#F3ECCD]' },
];

export function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.from('products').select('*, shops(id,name,city,logo_url)').eq('status', 'active').order('created_at', { ascending: false }).limit(4)
      .then(({ data }) => { if (alive) { setProducts((data as Product[] | null) ?? []); setLoading(false); } }, () => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  const visible = useMemo(() => isSupabaseConfigured ? products : demoProducts, [products]);
  function submitSearch(e: FormEvent) { e.preventDefault(); const q = search.trim(); navigate(`/marketplace${q ? `?q=${encodeURIComponent(q)}` : ''}`); }
  return <>
    <section className="relative overflow-hidden bg-[#F0ECE0]">
      <div className="hero-grain absolute inset-0 opacity-40" />
      <div className="page-wrap relative grid min-h-[560px] items-center gap-10 py-12 lg:grid-cols-[.95fr_1.05fr] lg:py-16">
        <div className="max-w-xl fade-up">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-faso-forest/15 bg-white/75 px-4 py-2 text-xs font-bold text-faso-forest"><span className="h-2 w-2 rounded-full bg-faso-saffron" />Le commerce local en mouvement</div>
          <h1 className="font-display text-[2.8rem] font-extrabold leading-[1.04] tracking-[-.045em] text-faso-ink sm:text-6xl">Les bonnes trouvailles, <span className="text-faso-forest">près de vous.</span></h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-faso-muted sm:text-lg">Découvrez les boutiques du Burkina Faso, échangez directement avec les vendeurs et faites-vous livrer selon vos besoins.</p>
          <form className="mt-8 flex max-w-xl items-center gap-2 rounded-full border border-faso-line bg-white p-2 shadow-soft" onSubmit={submitSearch} role="search">
            <Search className="ml-3 h-5 w-5 shrink-0 text-faso-muted" /><input className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-faso-muted/70" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Produit, boutique, catégorie…" aria-label="Rechercher sur FasoFlow" />
            <button className="btn-primary !min-h-10 !px-5 !py-2.5" type="submit">Explorer</button>
          </form>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-faso-muted"><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-faso-forest" />Vendeurs et statuts clairs</span><span className="inline-flex items-center gap-2"><PackageCheck className="h-4 w-4 text-faso-forest" />Suivi de commande</span></div>
        </div>
        <div className="relative mx-auto w-full max-w-[610px] lg:ml-auto">
          <div className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-faso-saffron/35 blur-2xl" />
          <div className="relative aspect-[1.13/1] overflow-hidden rounded-[2.4rem] bg-faso-forest shadow-card sm:aspect-[1.25/1]">
            <img src="/images/hero.webp" alt="Marché de quartier contemporain au Burkina Faso" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-faso-ink/35 via-transparent to-transparent" />
            <div className="absolute bottom-5 left-5 rounded-2xl border border-white/50 bg-white/95 px-4 py-3 shadow-soft backdrop-blur sm:bottom-7 sm:left-7"><p className="text-[10px] font-bold uppercase tracking-[.13em] text-faso-muted">FasoFlow, tout simplement</p><p className="mt-1 font-display text-lg font-extrabold text-faso-forest">Acheter local. Avancer ensemble.</p></div>
            <div className="absolute right-5 top-5 grid h-12 w-12 place-items-center rounded-2xl bg-faso-saffron text-faso-forest shadow-soft"><Leaf className="h-6 w-6" /></div>
          </div>
          <div className="absolute -bottom-5 -left-5 hidden rounded-2xl border border-faso-line bg-white p-4 shadow-card sm:block"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-[#E5EEE9] text-faso-forest"><Store className="h-5 w-5" /></div><div><p className="text-xs font-extrabold">Une place pour chaque boutique</p><p className="mt-0.5 text-[11px] text-faso-muted">Inscription commerçant gratuite</p></div></div></div>
        </div>
      </div>
    </section>

    <section className="page-wrap py-16 sm:py-20">
      <div className="mb-8 flex items-end justify-between gap-4"><div><p className="eyebrow">Une belle découverte commence ici</p><h2 className="section-title mt-2">Explorer par univers</h2></div><Link to="/marketplace" className="hidden items-center gap-2 text-sm font-bold text-faso-forest sm:inline-flex">Tout voir <ArrowRight className="h-4 w-4" /></Link></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{categoryCards.map((item) => <Link key={item.slug} to={`/categories/${item.slug}`} className={`${item.tone} group rounded-3xl p-5 transition hover:-translate-y-1 hover:shadow-soft`}><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/80 font-display text-2xl text-faso-forest">{item.icon}</span><h3 className="mt-7 font-display text-lg font-extrabold">{item.name}</h3><p className="mt-1 text-sm text-faso-muted">{item.detail}</p><ArrowUpRight className="mt-5 h-5 w-5 text-faso-forest transition group-hover:translate-x-1 group-hover:-translate-y-1" /></Link>)}</div>
    </section>

    <section className="bg-white py-16 sm:py-20">
      <div className="page-wrap"><div className="mb-8 flex items-end justify-between gap-4"><div><p className="eyebrow">Sélection locale</p><h2 className="section-title mt-2">À découvrir maintenant</h2><p className="mt-2 text-sm text-faso-muted">Prix affichés en FCFA (XOF).</p></div><Link to="/marketplace" className="hidden items-center gap-2 text-sm font-bold text-faso-forest sm:inline-flex">Voir la marketplace <ArrowRight className="h-4 w-4" /></Link></div>
        {loading ? <LoadingState label="Recherche des dernières annonces…" /> : visible.length ? <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{visible.map((product) => <ProductCard key={product.id} product={product} demo={!isSupabaseConfigured} />)}</div>{!isSupabaseConfigured && <p className="mt-4 text-center text-xs text-faso-muted">Illustrations et prix ci-dessus sont des exemples visuels, pas des annonces ni une offre de vente.</p>}</> : <EmptyState title="Les nouvelles boutiques arrivent bientôt"><Link className="font-bold text-faso-forest" to="/signup?role=merchant">Ouvrir une boutique sur FasoFlow <ArrowRight className="inline h-4 w-4" /></Link></EmptyState>}
      </div>
    </section>

    <section className="page-wrap py-16 sm:py-20"><div className="overflow-hidden rounded-[2rem] bg-faso-forest p-7 text-white sm:p-10 lg:p-14"><div className="grid items-center gap-8 lg:grid-cols-[1.2fr_.8fr]"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-faso-saffron">Commerçants & livreurs</p><h2 className="mt-3 max-w-2xl font-display text-3xl font-extrabold leading-tight sm:text-4xl">Votre activité mérite une place qui avance avec vous.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-white/75">Créez votre profil, gérez vos produits ou vos livraisons et choisissez l’offre adaptée. Commencez gratuitement.</p><div className="mt-7 flex flex-wrap gap-3"><Link to="/signup?role=merchant" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-faso-forest hover:bg-faso-ivory">Vendre sur FasoFlow <ArrowRight className="h-4 w-4" /></Link><Link to="/signup?role=courier" className="inline-flex items-center gap-2 rounded-full border border-white/40 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">Rejoindre comme livreur <Truck className="h-4 w-4" /></Link></div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/10 p-5"><Store className="h-6 w-6 text-faso-saffron" /><p className="mt-8 font-display text-lg font-extrabold">Une vitrine</p><p className="mt-1 text-sm text-white/70">pour vos produits</p></div><div className="mt-7 rounded-2xl bg-white/10 p-5"><Truck className="h-6 w-6 text-faso-saffron" /><p className="mt-8 font-display text-lg font-extrabold">Des trajets</p><p className="mt-1 text-sm text-white/70">à votre rythme</p></div></div></div></div></section>
  </>;
}

function ProductResults({ products, loading, demo = false }: { products: Product[]; loading: boolean; demo?: boolean }) {
  if (loading) return <LoadingState label="Chargement des produits…" />;
  if (!products.length) return <EmptyState title="Aucun produit ne correspond pour le moment"><p>Essayez un autre terme ou revenez bientôt pour découvrir les prochaines annonces.</p></EmptyState>;
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{products.map((p) => <ProductCard key={p.id} product={p} demo={demo} />)}</div>;
}

export function MarketplacePage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    let live = true;
    let request = supabase.from('products').select('*, shops(id,name,city,logo_url)').eq('status', 'active').order('created_at', { ascending: false }).limit(48);
    if (q) request = request.ilike('name', `%${q}%`);
    void request.then(({ data, error: queryError }) => { if (!live) return; setProducts((data as Product[] | null) ?? []); setError(queryError?.message ?? ''); setLoading(false); }, () => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [q]);
  return <section className="page-wrap py-12 sm:py-16"><div className="max-w-2xl"><p className="eyebrow">Le marché local</p><h1 className="section-title mt-2">{q ? `Résultats pour « ${q} »` : 'Trouver votre prochaine belle découverte'}</h1><p className="mt-3 text-faso-muted">Parcourez les annonces publiées par les boutiques.</p></div>
    <div className="mt-8">{!isSupabaseConfigured && <SetupNotice />}{error && <p className="mb-5 rounded-2xl bg-red-50 p-4 text-sm text-red-800">Impossible de charger les annonces : {error}</p>}<ProductResults products={!isSupabaseConfigured ? [] : products} loading={loading} /></div>
  </section>;
}

export function ProductPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!supabase || !id || id.startsWith('demo-')) { setLoading(false); return; }
    void supabase.from('products').select('*, shops(id,name,city,logo_url)').eq('id', id).eq('status', 'active').maybeSingle().then(({ data }) => { setProduct(data as Product | null); setLoading(false); }, () => setLoading(false));
  }, [id]);
  if (loading) return <section className="page-wrap py-16"><LoadingState /></section>;
  if (!product) return <section className="page-wrap py-14"><div className="mb-8"><Link className="text-sm font-bold text-faso-forest" to="/marketplace">← Retour aux produits</Link></div>{id?.startsWith('demo-') ? <div className="card-surface mx-auto max-w-2xl p-8"><span className="badge-soft">Exemple de présentation</span><h1 className="mt-4 font-display text-3xl font-extrabold">Annonce illustrative</h1><p className="mt-3 text-sm leading-relaxed text-faso-muted">Cette fiche et son prix servent uniquement à présenter l’interface. Aucun produit n’est proposé à la vente.</p></div> : <EmptyState title="Produit introuvable"><Link className="font-bold text-faso-forest" to="/marketplace">Retourner à la marketplace</Link></EmptyState>}</section>;
  return <section className="page-wrap py-12"><div className="mb-7"><Link className="text-sm font-bold text-faso-forest" to="/marketplace">← Marketplace</Link></div><div className="grid gap-8 lg:grid-cols-2"><div className="overflow-hidden rounded-[2rem] bg-white"><img src={product.image_url ?? ''} alt={product.name} className="aspect-square w-full object-cover" /></div><div className="py-4"><span className="badge-soft">Annonce de boutique</span><h1 className="mt-4 font-display text-3xl font-extrabold">{product.name}</h1><p className="mt-4 font-display text-2xl font-extrabold text-faso-forest">{formatXof(product.price_xof)}</p><p className="mt-5 whitespace-pre-line leading-7 text-faso-muted">{product.description}</p><div className="mt-7 rounded-2xl border border-faso-line bg-white p-4"><Link to={`/shops/${product.shops?.id}`} className="font-bold hover:text-faso-forest">{product.shops?.name ?? 'Boutique FasoFlow'}</Link><p className="mt-1 text-sm text-faso-muted">{product.shops?.city ?? 'Burkina Faso'} · Stock : {product.stock_quantity}</p></div><ProductActions product={product} /><p className="mt-3 text-xs text-faso-muted">Le paiement n’est pas confirmé par cette fiche. La commande est enregistrée avant tout paiement et reste soumise à confirmation.</p></div></div></section>;
}

export function ShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  useEffect(() => { if (!supabase) return; void supabase.from('shops').select('*').eq('status', 'active').order('name').limit(60).then(({ data }) => { setShops((data as Shop[] | null) ?? []); setLoading(false); }, () => setLoading(false)); }, []);
  return <section className="page-wrap py-12"><p className="eyebrow">Les visages du commerce local</p><h1 className="section-title mt-2">Boutiques</h1><p className="mt-3 max-w-xl text-sm leading-6 text-faso-muted">Découvrez les boutiques qui partagent leurs produits et leur savoir-faire sur FasoFlow.</p><div className="mt-8">{!isSupabaseConfigured && <SetupNotice />}{loading ? <LoadingState /> : shops.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shops.map((shop) => <Link className="card-surface p-5 transition hover:-translate-y-1 hover:shadow-card" key={shop.id} to={`/shops/${shop.id}`}><div className="flex items-center gap-4">{shop.logo_url ? <img src={shop.logo_url} alt="" className="h-14 w-14 rounded-2xl object-cover" /> : <div className="grid h-14 w-14 place-items-center rounded-2xl bg-faso-ivory text-faso-forest"><Store /></div>}<div><h2 className="font-display text-lg font-extrabold">{shop.name}</h2><p className="mt-1 text-sm text-faso-muted">{shop.city}</p></div></div><p className="mt-4 line-clamp-2 text-sm leading-6 text-faso-muted">{shop.description}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-faso-forest">Visiter la boutique <ChevronRight className="h-4 w-4" /></span></Link>)}</div> : <EmptyState title="La vitrine se remplit"><p>Les boutiques approuvées apparaîtront ici dès qu’elles seront publiées.</p><Link to="/signup?role=merchant" className="mt-3 inline-flex font-bold text-faso-forest">Créer une boutique <ArrowRight className="ml-1 h-4 w-4" /></Link></EmptyState>}</div></section>;
}

export function ShopPage() {
  const { id } = useParams();
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (!supabase || !id) { setLoading(false); return; } let live = true; Promise.all([supabase.from('shops').select('*').eq('id', id).eq('status', 'active').maybeSingle(), supabase.from('products').select('*, shops(id,name,city,logo_url)').eq('shop_id', id).eq('status', 'active')]).then(([s, p]) => { if (live) { setShop(s.data as Shop | null); setProducts((p.data as Product[] | null) ?? []); } }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [id]);
  if (loading) return <section className="page-wrap py-16"><LoadingState /></section>;
  if (!shop) return <section className="page-wrap py-16"><EmptyState title="Boutique introuvable"><Link to="/shops" className="font-bold text-faso-forest">Voir les boutiques</Link></EmptyState></section>;
  return <section className="page-wrap py-12"><div className="card-surface overflow-hidden"><div className="h-48 bg-gradient-to-br from-faso-forest to-[#357966]">{shop.cover_url && <img className="h-full w-full object-cover" src={shop.cover_url} alt="" />}</div><div className="p-6 sm:p-9"><span className="badge-soft"><BadgeCheck className="mr-1.5 h-3.5 w-3.5" /> Boutique publiée</span><h1 className="mt-3 font-display text-3xl font-extrabold">{shop.name}</h1><p className="mt-2 text-sm text-faso-muted">{shop.city} · Burkina Faso</p><p className="mt-5 max-w-3xl leading-7 text-faso-muted">{shop.description}</p></div></div><h2 className="section-title mt-12">Les produits de la boutique</h2><div className="mt-6">{products.length ? <ProductResults products={products} loading={false} /> : <EmptyState title="Aucune annonce active pour le moment" />}</div></section>;
}

export function CategoryPage() {
  const { slug = '' } = useParams();
  const [category, setCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  useEffect(() => { if (!supabase) return; let live = true; void supabase.from('categories').select('*').eq('slug', slug).maybeSingle().then(async ({ data }) => { if (!live) return; if (!data) { setLoading(false); return; } setCategory(data as Category); const result = await supabase!.from('products').select('*, shops(id,name,city,logo_url)').eq('category_id', data.id).eq('status', 'active').limit(48); if (live) { setProducts((result.data as Product[] | null) ?? []); setLoading(false); } }, () => { if (live) setLoading(false); }); return () => { live = false; }; }, [slug]);
  return <section className="page-wrap py-12"><p className="eyebrow">Explorer les univers</p><h1 className="section-title mt-2">{category?.name ?? slug.replaceAll('-', ' ')}</h1>{category?.description && <p className="mt-3 text-faso-muted">{category.description}</p>}<div className="mt-8">{!isSupabaseConfigured && <SetupNotice />}{loading ? <LoadingState /> : <ProductResults products={products} loading={false} />}</div></section>;
}

function PlanCard({ plan, featured = false }: { plan: ReturnType<typeof plansFor>[number]; featured?: boolean }) {
  return <article className={`rounded-3xl border p-6 ${featured ? 'border-faso-forest bg-faso-forest text-white shadow-card' : 'border-faso-line bg-white'}`}><span className={`text-xs font-bold uppercase tracking-[.14em] ${featured ? 'text-faso-saffron' : 'text-faso-forest'}`}>{plan.name}</span><div className="mt-3 flex items-baseline gap-2"><strong className="font-display text-3xl font-extrabold">{plan.price_xof ? formatXof(plan.price_xof) : 'Gratuit'}</strong>{plan.price_xof > 0 && <span className={`text-xs ${featured ? 'text-white/65' : 'text-faso-muted'}`}>/ mois</span>}</div><ul className={`mt-6 grid gap-3 text-sm ${featured ? 'text-white/85' : 'text-faso-muted'}`}>{plan.features.map((feature) => <li key={feature} className="flex gap-2"><span className={featured ? 'text-faso-saffron' : 'text-faso-forest'}>✓</span>{feature}</li>)}</ul><Link className={`mt-7 w-full ${featured ? 'inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-bold text-faso-forest hover:bg-faso-ivory' : 'btn-secondary'}`} to={`/signup?role=${plan.audience}&plan=${plan.id}`}>{plan.price_xof ? 'Choisir cette offre' : 'Commencer gratuitement'} <ArrowRight className="ml-2 h-4 w-4" /></Link></article>;
}

export function PricingPage() {
  const [audience, setAudience] = useState<'merchant' | 'courier'>('merchant');
  const plans = plansFor(audience);
  return <section className="page-wrap py-12 sm:py-16"><div className="mx-auto max-w-3xl text-center"><p className="eyebrow">Des offres sans surprise</p><h1 className="section-title mt-2">Choisissez le rythme qui vous convient</h1><p className="mt-4 leading-7 text-faso-muted">Les clients utilisent FasoFlow gratuitement. Commerçants et livreurs peuvent commencer sans frais, puis choisir des outils supplémentaires selon leur activité.</p><div className="mt-7 inline-flex rounded-full border border-faso-line bg-white p-1"><button onClick={() => setAudience('merchant')} className={`rounded-full px-5 py-2.5 text-sm font-bold ${audience === 'merchant' ? 'bg-faso-forest text-white' : 'text-faso-muted'}`}>Commerçants</button><button onClick={() => setAudience('courier')} className={`rounded-full px-5 py-2.5 text-sm font-bold ${audience === 'courier' ? 'bg-faso-forest text-white' : 'text-faso-muted'}`}>Livreurs</button></div></div><div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">{plans.map((plan, index) => <PlanCard key={plan.id} plan={plan} featured={index === 1} />)}</div><p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-5 text-faso-muted">Prix en XOF/FCFA. Pas d’essai gratuit, pas de commission FasoFlow sur les ventes ou livraisons. Les paiements d’abonnement restent en attente jusqu’à confirmation vérifiée.</p></section>;
}

export function ContactPage() {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); if (!supabase) { toast.error('Le formulaire sera activé après la configuration Supabase.'); return; } setBusy(true); const { error } = await supabase.from('contact_messages').insert({ name: String(form.get('name')), email: String(form.get('email')), subject: String(form.get('subject')), message: String(form.get('message')) }); setBusy(false); if (error) toast.error('Votre message n’a pas pu être envoyé. Réessayez plus tard.'); else { toast.success('Message envoyé. Merci !'); event.currentTarget.reset(); } }
  return <section className="page-wrap py-14"><div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow">Nous sommes à votre écoute</p><h1 className="section-title mt-2">Parlons-en.</h1><p className="mt-4 leading-7 text-faso-muted">Une question sur FasoFlow ? Écrivez-nous. Nous ne publions pas de coordonnées de paiement ici ; les instructions de paiement seront affichées uniquement après configuration par l’administrateur.</p><div className="mt-7 rounded-3xl bg-faso-forest p-6 text-white"><CircleHelp className="h-6 w-6 text-faso-saffron" /><p className="mt-5 font-display text-xl font-extrabold">Vous êtes commerçant ?</p><p className="mt-2 text-sm text-white/75">Créez votre compte gratuitement et préparez votre boutique.</p><Link to="/signup?role=merchant" className="mt-5 inline-flex items-center gap-2 font-bold text-faso-saffron">Rejoindre FasoFlow <ArrowRight className="h-4 w-4" /></Link></div></div><form onSubmit={submit} className="card-surface p-6 sm:p-8"><label className="label">Votre nom<input className="field" name="name" required maxLength={120} /></label><label className="label mt-5">E-mail<input className="field" name="email" type="email" required maxLength={254} /></label><label className="label mt-5">Sujet<input className="field" name="subject" required maxLength={160} /></label><label className="label mt-5">Votre message<textarea className="field min-h-32 resize-y" name="message" required maxLength={4000} /></label><button disabled={busy} className="btn-primary mt-6">{busy ? 'Envoi…' : 'Envoyer le message'} <ArrowRight className="h-4 w-4" /></button>{!isSupabaseConfigured && <p className="mt-3 text-xs text-faso-muted">Ce formulaire ne transmet rien tant que Supabase n’est pas configuré.</p>}</form></div></section>;
}

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const privacy = kind === 'privacy';
  return <section className="page-wrap max-w-4xl py-14"><p className="eyebrow">FasoFlow · Burkina Faso</p><h1 className="section-title mt-2">{privacy ? 'Confidentialité' : 'Conditions d’utilisation'}</h1><p className="mt-3 text-sm text-faso-muted">Version de travail — à faire valider et compléter par l’exploitant avant ouverture publique.</p><div className="mt-8 space-y-6 rounded-3xl border border-faso-line bg-white p-6 leading-7 text-faso-muted sm:p-9"><p>{privacy ? 'FasoFlow traite les données nécessaires à la création du compte, à la gestion des boutiques, commandes, conversations, livraisons et paiements d’abonnement. Le projet utilise Supabase pour l’authentification, la base de données, le stockage des images et les mises à jour temps réel. Les données de paiement du prestataire sont confirmées par le serveur ; aucune donnée de carte ne doit être collectée dans un formulaire FasoFlow.' : 'FasoFlow permet aux clients, commerçants et livreurs de découvrir et gérer des activités de commerce local. Les utilisateurs doivent fournir des informations exactes et respecter les règles de leur compte. Les commandes et engagements entre utilisateurs sont présentés selon le statut effectivement enregistré dans l’application.'}</p><div><h2 className="font-display text-lg font-extrabold text-faso-ink">{privacy ? 'Données et sécurité' : 'Paiements et abonnements'}</h2><p className="mt-2">{privacy ? 'Les accès sont limités par rôle et par politiques de sécurité de la base de données. Les détails du responsable de traitement, les durées de conservation et les moyens d’exercice des droits doivent être précisés par l’exploitant avant publication.' : 'Les prix d’abonnement sont affichés en XOF. Le retour d’un prestataire de paiement ne suffit pas à confirmer un règlement ; l’activation dépend d’une vérification côté serveur. Les informations de paiement manuel doivent être renseignées par l’administrateur.'}</p></div><div><h2 className="font-display text-lg font-extrabold text-faso-ink">Contact et mise à jour</h2><p className="mt-2">Avant l’ouverture publique, indiquer la raison sociale, l’adresse et les coordonnées officielles de l’exploitant, les éventuels frais applicables, les règles de remboursement et la date d’entrée en vigueur. Consultez la page <Link to="/contact" className="font-bold text-faso-forest">Contact</Link> pour écrire à l’équipe.</p></div></div></section>;
}

export function PaymentReturnPage() {
  const [params] = useSearchParams();
  const { session } = useAuth();
  const currentUserId = session?.user.id;
  const [sessionId, setSessionId] = useState(() => params.get('session_id') ?? '');
  const [status, setStatus] = useState('pending');
  const [message, setMessage] = useState('Le statut doit être confirmé directement auprès de SasPay.');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!sessionId) { try { setSessionId(localStorage.getItem('fasoflow-last-payment') ?? ''); } catch { /* local storage may be unavailable */ } } }, [sessionId]);
  const verify = useCallback(async () => {
    if (!sessionId) { setMessage('Aucune session enregistrée sur cet appareil. Revenez à votre espace abonnement.'); return; }
    if (!session?.access_token) { setMessage('Connectez-vous au compte qui a initié ce paiement pour le vérifier.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/payments/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ sessionId }) });
      const body = await response.json() as { status?: string; message?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Vérification indisponible.');
      setStatus(body.status ?? 'pending'); setMessage(body.message ?? 'Vérification terminée.');
      if (body.status === 'paid') { try { localStorage.removeItem('fasoflow-last-payment'); const prefix = `fasoflow-payment-intent:${currentUserId}:`; for (let index = localStorage.length - 1; index >= 0; index--) { const key = localStorage.key(index); if (key?.startsWith(prefix)) localStorage.removeItem(key); } } catch { /* non-critical */ } }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'SasPay ne confirme pas encore cette tentative.'); }
    finally { setBusy(false); }
  }, [sessionId, session?.access_token, currentUserId]);
  useEffect(() => { if (session?.access_token && sessionId) void verify(); }, [session?.access_token, sessionId, verify]);
  return <section className="page-wrap py-20"><div className="card-surface mx-auto max-w-xl p-8 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-faso-ivory text-faso-forest"><ShieldCheck /></div><h1 className="mt-5 font-display text-2xl font-extrabold">{status === 'paid' ? 'Paiement confirmé' : 'Vérification du paiement'}</h1><p className="mt-3 text-sm leading-6 text-faso-muted">{message}</p>{sessionId && session?.access_token && status !== 'paid' && <button onClick={() => void verify()} disabled={busy} className="btn-primary mt-6">{busy ? 'Vérification…' : 'Vérifier auprès de SasPay'}</button>}{!session && <Link to="/login" className="btn-primary mt-6">Se connecter pour vérifier</Link>}<div><Link to="/pricing" className="btn-secondary mt-6">Retour aux offres</Link></div></div></section>;
}

export function NotFoundPage() {
  return <section className="page-wrap py-24 text-center"><p className="font-display text-7xl font-extrabold text-faso-forest">404</p><h1 className="mt-4 font-display text-3xl font-extrabold">Cette page n’existe pas.</h1><p className="mt-3 text-faso-muted">Revenez à la marketplace pour continuer vos découvertes.</p><Link to="/marketplace" className="btn-primary mt-7">Explorer la marketplace <ShoppingBag className="h-4 w-4" /></Link></section>;
}
