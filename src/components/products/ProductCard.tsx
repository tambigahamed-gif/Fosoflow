import { Link } from 'react-router-dom';
import { MapPin, Package } from 'lucide-react';
import type { Product } from '../../types';
import { formatXof } from '../../lib/utils';

export function ProductCard({ product, demo = false }: { product: Product; demo?: boolean }) {
  const image = product.image_url
    ? <img src={product.image_url} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
    : <div className="grid h-full place-items-center text-faso-muted"><Package className="h-9 w-9" /></div>;
  return <article className="group overflow-hidden rounded-3xl border border-faso-line bg-white transition duration-200 hover:-translate-y-1 hover:shadow-card">
    {demo ? <div className="relative block aspect-[4/3] overflow-hidden bg-faso-pale">{image}<span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-faso-muted">Exemple · non à vendre</span></div> : <Link to={`/products/${product.id}`} className="relative block aspect-[4/3] overflow-hidden bg-faso-pale" aria-label={`Voir ${product.name}`}>{image}{product.stock_quantity <= 0 && <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-faso-terracotta">Rupture de stock</span>}</Link>}
    <div className="p-4">
      <div className="mb-2 flex items-start justify-between gap-3"><h3 className="line-clamp-2 min-h-10 font-display text-sm font-bold leading-5 text-faso-ink">{demo ? product.name : <Link to={`/products/${product.id}`} className="hover:text-faso-forest">{product.name}</Link>}</h3><span className="shrink-0 rounded-lg bg-faso-ivory px-2 py-1 text-xs font-extrabold text-faso-forest">{formatXof(product.price_xof)}</span></div>
      {demo || !product.shops?.id ? <span className="flex items-center gap-1.5 text-xs text-faso-muted"><MapPin className="h-3.5 w-3.5" />{product.shops?.name ?? 'Boutique locale'}{product.shops?.city ? ` · ${product.shops.city}` : ''}</span> : <Link to={`/shops/${product.shops.id}`} className="flex items-center gap-1.5 text-xs text-faso-muted hover:text-faso-forest"><MapPin className="h-3.5 w-3.5" />{product.shops.name}{product.shops.city ? ` · ${product.shops.city}` : ''}</Link>}
    </div>
  </article>;
}
