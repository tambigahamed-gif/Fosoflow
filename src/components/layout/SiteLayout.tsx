import { useState, type FormEvent } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { ArrowRight, Menu, Search, ShoppingBag, Store, Truck, X } from 'lucide-react';
import { useAuth, roleHome } from '../../app/auth';
import { Logo } from '../ui/Logo';

export function SiteLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    navigate(`/marketplace${params.size ? `?${params.toString()}` : ''}`);
    setMenuOpen(false);
  }

  const close = () => setMenuOpen(false);
  return <div className="min-h-screen bg-faso-ivory">
    <div className="bg-faso-forest px-4 py-2 text-center text-xs font-semibold tracking-wide text-white">Le marché local, tout près de vous <span className="mx-1 text-faso-saffron">•</span> Burkina Faso</div>
    <header className="sticky top-0 z-40 border-b border-faso-line/80 bg-faso-ivory/95 backdrop-blur-md">
      <div className="page-wrap flex h-[76px] items-center justify-between gap-5">
        <Link to="/" aria-label="FasoFlow — accueil" onClick={close}><Logo /></Link>
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Navigation principale">
          <Link className="nav-link" to="/marketplace">Marketplace</Link>
          <Link className="nav-link" to="/shops">Boutiques</Link>
          <Link className="nav-link" to="/pricing">Tarifs</Link>
        </nav>
        <form className="hidden max-w-[330px] flex-1 items-center gap-2 rounded-full border border-faso-line bg-white px-4 py-2.5 xl:flex" onSubmit={submitSearch} role="search">
          <Search className="h-4 w-4 text-faso-muted" aria-hidden="true" />
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faso-muted/70" placeholder="Que recherchez-vous ?" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher des produits" />
          <button className="text-xs font-bold text-faso-forest" type="submit">Chercher</button>
        </form>
        <div className="hidden items-center gap-3 md:flex">
          {user && profile ? <Link className="btn-primary !min-h-10 !px-4 !py-2" to={roleHome(profile.role)}>Mon espace <ArrowRight className="h-4 w-4" /></Link> : <><Link className="text-sm font-bold text-faso-ink hover:text-faso-forest" to="/login">Connexion</Link><Link className="btn-primary !min-h-10 !px-4 !py-2" to="/signup">Créer un compte</Link></>}
        </div>
        <button className="grid h-10 w-10 place-items-center rounded-full border border-faso-line bg-white md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menuOpen}>{menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>
      {menuOpen && <div className="border-t border-faso-line bg-faso-ivory px-4 pb-5 pt-3 md:hidden">
        <form className="mb-4 flex items-center gap-2 rounded-2xl border border-faso-line bg-white px-3 py-3" onSubmit={submitSearch}><Search className="h-4 w-4 text-faso-muted" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="text-xs font-bold text-faso-forest">OK</button></form>
        <div className="grid gap-1">{[['Marketplace', '/marketplace'], ['Boutiques', '/shops'], ['Tarifs', '/pricing']].map(([label, path]) => <Link key={path} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-white" to={path} onClick={close}>{label}</Link>)}</div>
        {user && profile ? <Link className="btn-primary mt-3 w-full" to={roleHome(profile.role)} onClick={close}>Mon espace <ArrowRight className="h-4 w-4" /></Link> : <div className="mt-3 grid grid-cols-2 gap-2"><Link className="btn-secondary" to="/login" onClick={close}>Connexion</Link><Link className="btn-primary" to="/signup" onClick={close}>Inscription</Link></div>}
      </div>}
    </header>
    <main><Outlet /></main>
    <footer className="mt-20 border-t border-faso-line bg-white">
      <div className="page-wrap grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div><Link to="/"><Logo /></Link><p className="mt-4 max-w-xs text-sm leading-relaxed text-faso-muted">Des boutiques locales, des achats simples et des livraisons pensées pour le Burkina Faso.</p><p className="mt-5 text-xs font-semibold text-faso-muted">Prix affichés en FCFA (XOF)</p></div>
        <div><p className="mb-3 text-sm font-bold">Découvrir</p><div className="grid gap-2 text-sm text-faso-muted"><Link to="/marketplace">Produits</Link><Link to="/shops">Boutiques</Link><Link to="/pricing">Tarifs</Link></div></div>
        <div><p className="mb-3 text-sm font-bold">Rejoindre FasoFlow</p><div className="grid gap-2 text-sm text-faso-muted"><Link to="/signup?role=merchant" className="flex items-center gap-2"><Store className="h-4 w-4" /> Vendre en ligne</Link><Link to="/signup?role=courier" className="flex items-center gap-2"><Truck className="h-4 w-4" /> Livrer des commandes</Link><Link to="/signup?role=client" className="flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> Créer un compte client</Link></div></div>
        <div><p className="mb-3 text-sm font-bold">Informations</p><div className="grid gap-2 text-sm text-faso-muted"><Link to="/contact">Contact</Link><Link to="/terms">Conditions d’utilisation</Link><Link to="/privacy">Confidentialité</Link></div></div>
      </div>
      <div className="border-t border-faso-line"><div className="page-wrap flex flex-col gap-2 py-4 text-xs text-faso-muted sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} FasoFlow. Le commerce local en mouvement.</span><span>Burkina Faso · XOF</span></div></div>
    </footer>
  </div>;
}
