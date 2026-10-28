import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Box, ChevronLeft, CreditCard, Heart, LayoutDashboard, LogOut, Menu, MessageCircle, Package, Settings, Shield, ShoppingBag, ShoppingBasket, Store, Truck, Users, Wallet, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../app/auth';
import type { AppRole } from '../../types';
import { toast } from 'sonner';

const navByRole: Record<AppRole, { label: string; path: string; icon: typeof LayoutDashboard }[]> = {
  client: [
    { label: 'Vue d’ensemble', path: 'dashboard', icon: LayoutDashboard }, { label: 'Mon panier', path: 'cart', icon: ShoppingBasket }, { label: 'Mes commandes', path: 'orders', icon: ShoppingBag }, { label: 'Mes favoris', path: 'favorites', icon: Heart }, { label: 'Mes avis', path: 'reviews', icon: Shield }, { label: 'Messages', path: 'messages', icon: MessageCircle }, { label: 'Livraisons', path: 'deliveries', icon: Truck }, { label: 'Notifications', path: 'notifications', icon: Bell }, { label: 'Mon profil', path: 'settings', icon: Settings },
  ],
  merchant: [
    { label: 'Vue d’ensemble', path: 'dashboard', icon: LayoutDashboard }, { label: 'Ma boutique', path: 'shop', icon: Store }, { label: 'Produits', path: 'products', icon: Box }, { label: 'Commandes', path: 'orders', icon: ShoppingBag }, { label: 'Messages', path: 'messages', icon: MessageCircle }, { label: 'Avis clients', path: 'reviews', icon: Heart }, { label: 'Statistiques', path: 'analytics', icon: Wallet }, { label: 'Abonnement', path: 'subscription', icon: CreditCard }, { label: 'Paramètres', path: 'settings', icon: Settings },
  ],
  courier: [
    { label: 'Vue d’ensemble', path: 'dashboard', icon: LayoutDashboard }, { label: 'Courses', path: 'deliveries', icon: Truck }, { label: 'Historique', path: 'history', icon: Package }, { label: 'Messages', path: 'messages', icon: MessageCircle }, { label: 'Revenus', path: 'earnings', icon: Wallet }, { label: 'Abonnement', path: 'subscription', icon: CreditCard }, { label: 'Paramètres', path: 'settings', icon: Settings },
  ],
  admin: [
    { label: 'Vue d’ensemble', path: 'dashboard', icon: LayoutDashboard }, { label: 'Utilisateurs', path: 'users', icon: Users }, { label: 'Boutiques', path: 'shops', icon: Store }, { label: 'Produits', path: 'products', icon: Box }, { label: 'Commandes', path: 'orders', icon: ShoppingBag }, { label: 'Livraisons', path: 'deliveries', icon: Truck }, { label: 'Paiements', path: 'payments', icon: CreditCard }, { label: 'Abonnements', path: 'subscriptions', icon: Wallet }, { label: 'Signalements', path: 'reports', icon: Shield }, { label: 'Paramètres', path: 'settings', icon: Settings },
  ],
};
const titles: Record<AppRole, string> = { client: 'Espace client', merchant: 'Espace commerçant', courier: 'Espace livreur', admin: 'Administration FasoFlow' };

export function DashboardLayout({ role, children }: { role: AppRole; children?: React.ReactNode }) {
  const { profile, user } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  async function signOut() { await supabase?.auth.signOut(); toast.success('Vous êtes déconnecté.'); navigate('/'); }
  const nav = navByRole[role];
  const current = location.pathname.split('/')[2] || 'dashboard';
  return <div className="page-wrap pb-16 pt-8">
    <div className="mb-6 flex items-center justify-between gap-4"><div><Link to="/" className="inline-flex items-center gap-1 text-xs font-bold text-faso-muted hover:text-faso-forest"><ChevronLeft className="h-4 w-4" /> Retour à la marketplace</Link><h1 className="mt-3 font-display text-2xl font-extrabold">{titles[role]}</h1></div><button className="grid h-10 w-10 place-items-center rounded-xl border border-faso-line bg-white lg:hidden" onClick={() => setOpen(!open)} aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button></div>
    <div className="grid gap-6 lg:grid-cols-[245px_minmax(0,1fr)]">
      <aside className={`${open ? 'block' : 'hidden'} card-surface h-fit p-3 lg:sticky lg:top-28 lg:block`}>
        <div className="mb-3 rounded-2xl bg-faso-ivory p-4"><p className="text-xs font-bold uppercase tracking-wide text-faso-muted">Connecté en tant que</p><p className="mt-1 truncate font-display font-extrabold">{profile?.full_name || user?.email || 'Membre FasoFlow'}</p><p className="mt-1 text-xs capitalize text-faso-forest">{role}</p></div>
        <nav className="grid gap-1">{nav.map(({ label, path, icon: Icon }) => { const active = current === path || (path === 'dashboard' && (current === 'dashboard' || current === '')); return <Link key={path} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? 'bg-faso-forest text-white' : 'text-faso-muted hover:bg-faso-ivory hover:text-faso-ink'}`} to={`/${role}/${path}`}><Icon className="h-4 w-4" />{label}</Link>; })}</nav>
        <button onClick={() => void signOut()} className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-faso-muted hover:bg-red-50 hover:text-red-700"><LogOut className="h-4 w-4" /> Déconnexion</button>
      </aside>
      <section className="min-w-0">{children ?? <Outlet />}</section>
    </div>
  </div>;
}
