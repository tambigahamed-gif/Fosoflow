import { formatXof } from '../../lib/utils';
import type { ServiceRequest } from '../../types';

export const serviceRequestStatusLabels: Record<ServiceRequest['status'], string> = {
  requested: 'Demande envoyée',
  quoted: 'Devis reçu',
  accepted: 'Date et lieu convenus',
  completed: 'Prestation terminée',
  cancelled: 'Demande annulée',
  declined: 'Non disponible',
};

export function servicePriceLabel(min: number | null, max: number | null, unit: string | null): string {
  if (min == null && max == null) return 'Prix sur devis';
  if (min != null && max != null && min !== max) return `${formatXof(min)} – ${formatXof(max)}${unit ? ` · ${unit}` : ''}`;
  return `${formatXof(min ?? max ?? 0)}${unit ? ` · ${unit}` : ''}`;
}

export function parseServiceArea(value: string): string[] {
  return [...new Set(value.split(',').map((area) => area.trim()).filter(Boolean))].slice(0, 20);
}

export function serviceImageLimitExceeded(existingCount: number, incomingCount: number, limit = 8): boolean {
  return existingCount < 0 || incomingCount < 0 || existingCount + incomingCount > limit;
}

export type EditableServiceListing = Pick<
  import('../../types').ServiceListing,
  'category_id' | 'title' | 'description' | 'city' | 'service_area' |
  'price_min_xof' | 'price_max_xof' | 'price_unit' | 'image_urls'
>;

export function serviceListingContentChanged(current: EditableServiceListing, next: EditableServiceListing): boolean {
  return current.category_id !== next.category_id
    || current.title !== next.title
    || current.description !== next.description
    || current.city !== next.city
    || current.price_min_xof !== next.price_min_xof
    || current.price_max_xof !== next.price_max_xof
    || current.price_unit !== next.price_unit
    || current.service_area.length !== next.service_area.length
    || current.service_area.some((area, index) => area !== next.service_area[index])
    || current.image_urls.length !== next.image_urls.length
    || current.image_urls.some((url, index) => url !== next.image_urls[index]);
}

export function isMissingServicesMigration(message: string): boolean {
  return /service_(categories|provider_profiles|listings|requests|reviews)|column .*service_request|schema cache/i.test(message)
    && /relation|table|schema cache|does not exist|could not find|column/i.test(message);
}

export function isMissingProductModesMigration(message: string): boolean {
  return /(condition|sale_mode|minimum_order_quantity|lead_time_days)/i.test(message)
    && /column|schema cache|does not exist|could not find/i.test(message);
}
