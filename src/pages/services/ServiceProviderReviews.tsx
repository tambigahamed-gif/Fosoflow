import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { EmptyState } from '../../components/ui/Callout';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';

type PublicReview = { id: string; rating: number; comment: string; created_at: string };

export function ServiceProviderReviews({ providerId }: { providerId: string }) {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let live = true;
    void supabase.from('service_reviews').select('id,rating,comment,created_at').eq('provider_id', providerId).eq('status', 'published').order('created_at', { ascending: false }).limit(12)
      .then(({ data, error: queryError }) => {
        if (!live) return;
        setReviews((data as PublicReview[] | null) ?? []);
        setError(queryError?.message ?? '');
        setLoading(false);
      }, (reason: unknown) => {
        if (live) {
          setError(reason instanceof Error ? reason.message : 'Les avis ne sont pas disponibles pour le moment.');
          setLoading(false);
        }
      });
    return () => { live = false; };
  }, [providerId]);

  if (!isSupabaseConfigured) return null;
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  return <section className="mt-10" aria-labelledby="provider-reviews-title">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Retours clients</p><h2 id="provider-reviews-title" className="section-title mt-1">Avis sur les prestations</h2></div>{reviews.length > 0 && <p className="inline-flex items-center gap-2 rounded-full bg-faso-ivory px-3 py-2 text-sm font-bold text-faso-forest"><Star className="h-4 w-4 fill-current" />{average.toFixed(1)} / 5 · {reviews.length} avis publiés</p>}</div>
    {loading ? <div className="mt-5 h-24 animate-pulse rounded-2xl bg-white" /> : error ? <p role="status" className="mt-4 text-sm text-faso-muted">Les avis sont momentanément indisponibles.</p> : reviews.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{reviews.map((review) => <article key={review.id} className="rounded-2xl border border-faso-line bg-white p-4"><div className="flex items-center justify-between gap-3"><span className="text-faso-saffron" role="img" aria-label={`${review.rating} étoiles sur 5`}>{'★'.repeat(review.rating)}<span className="text-faso-line">{'★'.repeat(5 - review.rating)}</span></span><time className="text-xs text-faso-muted" dateTime={review.created_at}>{formatDate(review.created_at)}</time></div>{review.comment && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-faso-muted">{review.comment}</p>}</article>)}</div> : <div className="mt-5"><EmptyState title="Aucun avis publié pour le moment"><p>Les avis sont déposés après une demande de devis terminée et affichés après modération.</p></EmptyState></div>}
  </section>;
}
