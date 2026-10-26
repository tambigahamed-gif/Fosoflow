import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, roleHome } from '../../app/auth';
import { supabase } from '../../lib/supabase';
import type { AppRole } from '../../types';

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset' | 'confirm';
const selectableRoles: AppRole[] = ['client', 'merchant', 'courier'];

export function AuthPage({ mode }: { mode: AuthMode }) {
  const [search, setSearch] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState('');
  const [resetComplete, setResetComplete] = useState(false);
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const requestedRole = search.get('role') as AppRole | null;
  const [role, setRole] = useState<AppRole>(requestedRole && selectableRoles.includes(requestedRole) ? requestedRole : 'client');
  const [error, setError] = useState('');

  useEffect(() => {
    if (user && profile && (mode === 'login' || mode === 'confirm')) navigate(roleHome(profile.role), { replace: true });
  }, [user, profile, mode, navigate]);
  useEffect(() => {
    if (mode === 'confirm' && !loading && !user) setNotice('Vérifiez votre boîte e-mail et ouvrez le lien de confirmation reçu.');
  }, [mode, loading, user]);
  useEffect(() => {
    if (mode === 'reset' && !loading && !user) setError('Ce lien de récupération est invalide ou expiré. Demandez un nouveau lien.');
  }, [mode, loading, user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!supabase) { setError('Ajoutez les variables Supabase dans `.env.local` pour activer l’authentification.'); return; }
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    const password = String(form.get('password') ?? '');
    setBusy(true);
    try {
      if (mode === 'login') {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        const { data: profileRow, error: profileError } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
        if (profileError || !profileRow) throw new Error('Profil introuvable. Confirmez votre e-mail ou contactez l’administrateur.');
        navigate(roleHome(profileRow.role as AppRole), { replace: true });
      } else if (mode === 'signup') {
        const fullName = String(form.get('full_name') ?? '').trim();
        const phone = String(form.get('phone') ?? '').trim();
        if (!selectableRoles.includes(role)) throw new Error('Choisissez un rôle disponible.');
        if (password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/account/confirm`,
            data: { role, full_name: fullName, phone: phone || null },
          },
        });
        if (authError) throw authError;
        if (data.session) navigate(roleHome(role), { replace: true });
        else setNotice('Votre compte est créé. Consultez votre e-mail pour confirmer l’adresse avant la première connexion.');
      } else if (mode === 'forgot') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (authError) throw authError;
        setNotice('Si cette adresse correspond à un compte, un message sécurisé de réinitialisation va être envoyé.');
      } else if (mode === 'reset') {
        if (!user) throw new Error('Ouvrez le lien de récupération depuis votre e-mail avant de choisir un nouveau mot de passe.');
        if (password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
        if (password !== String(form.get('password_confirm') ?? '')) throw new Error('Les deux mots de passe ne correspondent pas.');
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        await supabase.auth.signOut();
        setResetComplete(true);
        setNotice('Votre mot de passe a été mis à jour. Vous pouvez vous connecter avec votre nouveau mot de passe.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    if (!supabase) { setError('Supabase n’est pas configuré.'); return; }
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/account/confirm` } });
    if (authError) toast.error(authError.message);
  }

  if (mode === 'confirm') return <section className="page-wrap grid min-h-[60vh] place-items-center py-12"><div className="card-surface w-full max-w-lg p-8 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-faso-ivory text-faso-forest"><Mail /></div><h1 className="mt-5 font-display text-2xl font-extrabold">Confirmation du compte</h1><p className="mt-3 text-sm leading-6 text-faso-muted">{notice || (user ? 'Votre session a été reconnue.' : 'Ouvrez le lien de confirmation envoyé à votre adresse e-mail.')}</p><Link className="btn-primary mt-6" to="/login">Continuer <ArrowRight className="h-4 w-4" /></Link></div></section>;

  if (mode === 'reset' && loading) return <section className="page-wrap grid min-h-[60vh] place-items-center py-12"><div role="status" className="card-surface p-6 text-sm text-faso-muted">Vérification du lien sécurisé…</div></section>;
  if (mode === 'reset' && resetComplete) return <section className="page-wrap grid min-h-[60vh] place-items-center py-12"><div className="card-surface w-full max-w-lg p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-faso-forest" /><h1 className="mt-5 font-display text-2xl font-extrabold">Mot de passe mis à jour</h1><p className="mt-3 text-sm leading-6 text-faso-muted">{notice}</p><Link className="btn-primary mt-6" to="/login">Se connecter</Link></div></section>;
  if (mode === 'reset' && !user) return <section className="page-wrap grid min-h-[60vh] place-items-center py-12"><div className="card-surface w-full max-w-lg p-8 text-center"><Mail className="mx-auto h-10 w-10 text-faso-forest" /><h1 className="mt-5 font-display text-2xl font-extrabold">Lien de récupération nécessaire</h1><p className="mt-3 text-sm leading-6 text-faso-muted">{error || 'Ouvrez le lien de récupération reçu par e-mail.'}</p><Link className="btn-primary mt-6" to="/forgot-password">Demander un nouveau lien</Link></div></section>;

  const title = mode === 'login' ? 'Content de vous revoir.' : mode === 'signup' ? 'Votre place est ici.' : mode === 'reset' ? 'Choisir un nouveau mot de passe' : 'Réinitialiser le mot de passe';
  const subtitle = mode === 'login' ? 'Connectez-vous à votre espace FasoFlow.' : mode === 'signup' ? 'Créez votre compte et commencez simplement.' : mode === 'reset' ? 'Choisissez un mot de passe long et unique pour protéger votre compte.' : 'Nous vous enverrons un lien sécurisé si un compte correspond à cette adresse.';
  return <section className="page-wrap grid min-h-[68vh] items-center gap-10 py-12 lg:grid-cols-[.95fr_1.05fr]">
    <div className="hidden rounded-[2rem] bg-faso-forest p-10 text-white lg:block"><span className="badge-soft !bg-white/10 !text-faso-saffron">FasoFlow · Burkina Faso</span><h2 className="mt-8 max-w-md font-display text-4xl font-extrabold leading-tight">Le commerce local commence par une bonne rencontre.</h2><p className="mt-5 max-w-md leading-7 text-white/70">Achetez auprès des boutiques locales, gérez votre activité ou rejoignez le réseau de livraison.</p><div className="mt-10 grid grid-cols-3 gap-3 text-center text-xs font-bold"><div className="rounded-2xl bg-white/10 p-4"><StoreMark />Commerçants</div><div className="rounded-2xl bg-white/10 p-4"><ShieldCheck className="mx-auto mb-2 h-5 w-5 text-faso-saffron" />Clients</div><div className="rounded-2xl bg-white/10 p-4"><TruckMark />Livreurs</div></div></div>
    <div className="mx-auto w-full max-w-lg"><Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-faso-forest"><ArrowLeft className="h-4 w-4" /> Retour à FasoFlow</Link><p className="eyebrow">{mode === 'login' ? 'Votre espace' : mode === 'signup' ? 'Créer un compte' : mode === 'reset' ? 'Lien sécurisé' : 'Aide à la connexion'}</p><h1 className="mt-2 font-display text-3xl font-extrabold">{title}</h1><p className="mt-2 text-sm text-faso-muted">{subtitle}</p>
      {mode === 'signup' && <div className="mt-6 grid grid-cols-3 gap-2">{([{ id: 'client', label: 'Client' }, { id: 'merchant', label: 'Commerçant' }, { id: 'courier', label: 'Livreur' }] as const).map((option) => <button key={option.id} type="button" onClick={() => { setRole(option.id); setSearch((prev) => { prev.set('role', option.id); return prev; }); }} className={`rounded-2xl border px-2 py-3 text-xs font-bold transition sm:text-sm ${role === option.id ? 'border-faso-forest bg-faso-forest text-white' : 'border-faso-line bg-white text-faso-muted'}`}>{option.label}</button>)}</div>}
      <form className="mt-6 rounded-3xl border border-faso-line bg-white p-6 shadow-soft" onSubmit={submit}>
        {mode === 'signup' && <><label className="label">Nom complet<input className="field" name="full_name" autoComplete="name" required maxLength={120} /></label><label className="label mt-4">Téléphone (facultatif)<input className="field" name="phone" type="tel" autoComplete="tel" maxLength={32} placeholder="+226 …" /></label></>}
        {mode !== 'reset' && <label className="label mt-4">Adresse e-mail<input className="field" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="vous@exemple.com" /></label>}
        {mode !== 'forgot' && <label className="label mt-4">{mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}<div className="relative"><input className="field pr-12" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' || mode === 'reset' ? 8 : 1} /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-faso-muted" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></label>}
        {mode === 'reset' && <label className="label mt-4">Confirmer le nouveau mot de passe<input className="field" name="password_confirm" type="password" autoComplete="new-password" required minLength={8} /></label>}
        {error && <div role="alert" className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-800">{error}</div>}{notice && <div role="status" className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}
        <button className="btn-primary mt-6 w-full" disabled={busy}>{busy ? 'Un instant…' : mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : mode === 'reset' ? 'Mettre à jour le mot de passe' : 'Envoyer le lien'} <ArrowRight className="h-4 w-4" /></button>
        {mode === 'signup' && <p className="mt-4 text-xs leading-5 text-faso-muted">Votre rôle sera limité à votre choix d’inscription. Le rôle administrateur ne peut pas être choisi ici.</p>}
      </form>
      {mode === 'login' && import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === 'true' && <button onClick={googleLogin} className="btn-secondary mt-3 w-full">Continuer avec Google</button>}
      <div className="mt-5 flex flex-col gap-2 text-sm text-faso-muted">{mode === 'login' ? <><Link to="/forgot-password" className="font-bold text-faso-forest">Mot de passe oublié ?</Link><p>Pas encore de compte ? <Link to="/signup" className="font-bold text-faso-forest">Inscrivez-vous</Link></p></> : mode === 'signup' ? <p>Vous avez déjà un compte ? <Link to="/login" className="font-bold text-faso-forest">Connexion</Link></p> : <p><Link to="/login" className="font-bold text-faso-forest">Retour à la connexion</Link></p>}</div>
    </div>
  </section>;
}

function StoreMark() { return <svg className="mx-auto mb-2 h-5 w-5 text-faso-saffron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h18M5 10V6l2-3h10l2 3v4M5 10v11h14V10M9 21v-7h6v7" /></svg>; }
function TruckMark() { return <svg className="mx-auto mb-2 h-5 w-5 text-faso-saffron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5h11v12H3zM14 9h4l3 3v5h-7z" /><circle cx="7.5" cy="19" r="1.5" /><circle cx="18" cy="19" r="1.5" /></svg>; }
