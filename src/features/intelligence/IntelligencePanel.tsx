import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Bell, CalendarDays, Lightbulb, LoaderCircle, PackageSearch, Sparkles, TrendingUp } from 'lucide-react';
import { useAuth } from '../../app/auth';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

const TASKS = [
  { id: 'product_description', label: 'Description produit', description: 'Rédiger une description claire, à partir des informations existantes.', icon: Sparkles, needsProduct: true },
  { id: 'listing_improvement', label: 'Améliorer une annonce', description: 'Renforcer la lisibilité sans inventer de caractéristiques.', icon: PackageSearch, needsProduct: true },
  { id: 'price_suggestion', label: 'Suggestion de prix', description: 'Obtenir une piste de prix prudente, fondée sur vos seules données.', icon: TrendingUp, needsProduct: true },
  { id: 'sales_stock_analysis', label: 'Ventes et stocks', description: 'Analyser les ventes et les quantités de stock récentes.', icon: BarChart3, needsProduct: false },
  { id: 'recommendation', label: 'Recommandation', description: 'Recevoir des pistes opérationnelles à partir de votre boutique.', icon: Lightbulb, needsProduct: false },
  { id: 'alert', label: 'Alertes', description: 'Repérer les stocks faibles et les évolutions à vérifier.', icon: Bell, needsProduct: false },
  { id: 'daily_summary', label: 'Résumé du jour', description: 'Synthétiser commandes, ventes et stocks sur la dernière journée.', icon: CalendarDays, needsProduct: false },
  { id: 'weekly_summary', label: 'Résumé de la semaine', description: 'Synthétiser commandes, ventes et stocks sur les sept derniers jours.', icon: CalendarDays, needsProduct: false },
] as const;

type TaskId = (typeof TASKS)[number]['id'];
interface ProductOption { id: string; name: string }

export function IntelligencePanel() {
  const { user, session, profile } = useAuth();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(Boolean(supabase));
  const [task, setTask] = useState<TaskId>('product_description');
  const [productId, setProductId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const selectedTask = useMemo(() => TASKS.find((item) => item.id === task) ?? TASKS[0], [task]);

  useEffect(() => {
    if (!supabase || !user || profile?.role !== 'merchant') { setLoadingProducts(false); return; }
    let active = true;
    void (async () => {
      const shopResult = await supabase!.from('shops').select('id').eq('owner_id', user.id).maybeSingle();
      if (!active) return;
      if (shopResult.error || !shopResult.data) { setLoadingProducts(false); return; }
      const productResult = await supabase!.from('products').select('id,name').eq('shop_id', shopResult.data.id).order('created_at', { ascending: false }).limit(100);
      if (!active) return;
      setProducts((productResult.data as ProductOption[] | null) ?? []);
      setLoadingProducts(false);
    })().catch(() => { if (active) setLoadingProducts(false); });
    return () => { active = false; };
  }, [user, profile?.role]);

  async function runAnalysis() {
    if (!session?.access_token) { setError('Votre session a expiré. Reconnectez-vous pour continuer.'); return; }
    if (selectedTask.needsProduct && !productId) { setError('Choisissez d’abord un produit de votre boutique.'); return; }
    setBusy(true); setError(''); setResult('');
    try {
      const payload = selectedTask.needsProduct || (task === 'sales_stock_analysis' && productId)
        ? { task, productId }
        : { task };
      const response = await fetch('/api/intelligence', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null) as { result?: unknown; error?: unknown } | null;
      if (!response.ok) {
        const message = typeof data?.error === 'string' ? data.error : 'Le service Intelligence est indisponible. Aucun résultat simulé ne sera affiché.';
        setError(message);
        return;
      }
      if (typeof data?.result !== 'string' || !data.result.trim()) {
        setError('Aucune réponse exploitable n’a été reçue. Aucun résultat simulé ne sera affiché.');
        return;
      }
      setResult(data.result);
    } catch {
      setError('Impossible de joindre le service Intelligence. Vérifiez sa configuration côté serveur puis réessayez. Aucun résultat simulé ne sera affiché.');
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) return <p className="mt-5 rounded-2xl border border-faso-line bg-white p-5 text-sm text-faso-muted">Configurez d’abord l’accès à votre boutique. FasoFlow Intelligence ne présente aucun résultat simulé.</p>;
  if (profile && profile.role !== 'merchant') return <p className="mt-5 rounded-2xl border border-faso-line bg-white p-5 text-sm text-faso-muted">Cette fonction est réservée aux comptes marchands.</p>;

  return <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
    <section className="rounded-3xl border border-faso-line bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-faso-ivory text-faso-forest"><Sparkles className="h-5 w-5" /></span><div><h3 className="font-display text-lg font-extrabold">Que souhaitez-vous analyser ?</h3><p className="mt-1 text-sm text-faso-muted">Les calculs et appels au fournisseur sont réalisés côté serveur.</p></div></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {TASKS.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => { setTask(item.id); setError(''); setResult(''); }} className={`rounded-2xl border p-3 text-left transition ${task === item.id ? 'border-faso-forest bg-faso-ivory' : 'border-faso-line hover:border-faso-forest/40'}`} aria-pressed={task === item.id}><span className="flex items-center gap-2 font-bold"><Icon className="h-4 w-4 text-faso-forest" />{item.label}</span><span className="mt-1 block text-xs leading-5 text-faso-muted">{item.description}</span></button>; })}
      </div>
      {(selectedTask.needsProduct || task === 'sales_stock_analysis') && <label className="label mt-5 block">{selectedTask.needsProduct ? 'Produit de votre boutique' : 'Limiter à un produit (facultatif)'}<select className="field" value={productId} onChange={(event) => { setProductId(event.target.value); setError(''); setResult(''); }} disabled={loadingProducts}><option value="">{loadingProducts ? 'Chargement…' : selectedTask.needsProduct ? 'Choisir un produit' : 'Toute la boutique'}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>{!loadingProducts && products.length === 0 && <span className="mt-1 block text-xs font-normal text-faso-muted">Aucun produit disponible dans votre boutique.</span>}</label>}
      <button type="button" onClick={() => void runAnalysis()} disabled={busy || loadingProducts || (selectedTask.needsProduct && products.length === 0)} className="btn-primary mt-5 w-full sm:w-auto">{busy ? <><LoaderCircle className="h-4 w-4 animate-spin" />Analyse en cours…</> : <><Sparkles className="h-4 w-4" />Lancer l’analyse</>}</button>
      <p className="mt-4 text-xs leading-5 text-faso-muted">Sans fournisseur IA configuré côté serveur, la requête affichera un message de configuration. Aucun texte ni résultat fictif n’est utilisé.</p>
    </section>
    <section className="min-h-64 rounded-3xl border border-faso-line bg-white p-5 sm:p-6" aria-live="polite">
      <p className="eyebrow">Votre résultat</p>
      {busy && <div className="mt-6 flex items-center gap-3 text-sm text-faso-muted"><LoaderCircle className="h-5 w-5 animate-spin text-faso-forest" />Analyse des données de votre boutique…</div>}
      {!busy && !result && !error && <p className="mt-4 text-sm leading-6 text-faso-muted">Choisissez une tâche pour commencer. Les réponses seront fondées sur les données disponibles et préciseront les limites éventuelles.</p>}
      {error && <div role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{error}</div>}
      {result && <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{result}</div>}
    </section>
  </div>;
}
