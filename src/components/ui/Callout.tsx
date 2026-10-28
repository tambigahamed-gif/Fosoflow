import { CircleAlert, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

export function SetupNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex gap-3 rounded-2xl border border-faso-saffron/40 bg-[#FFF8E8] p-4 text-sm text-faso-ink ${compact ? 'items-center' : 'items-start'}`}>
      <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#9B6B00]" aria-hidden="true" />
      <div>
        <p className="font-bold">Connexion Supabase à configurer</p>
        {!compact && <p className="mt-1 leading-relaxed text-faso-muted">Cette fonction utilise les données réelles de FasoFlow. Ajoutez les variables publiques Supabase documentées dans `.env.local` pour l’activer. Aucune donnée d’exemple ne sera présentée comme une annonce réelle.</p>}
      </div>
    </div>
  );
}

export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-faso-muted"><LoaderCircle className="h-5 w-5 animate-spin text-faso-forest" />{label}</div>;
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-faso-line bg-white/70 px-6 py-12 text-center">
    <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-faso-ivory text-faso-forest">{icon ?? <ShieldCheck className="h-5 w-5" />}</div>
    <h3 className="font-display text-lg font-bold">{title}</h3>
    {children && <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-faso-muted">{children}</div>}
  </div>;
}
