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

export function isMissingServicesMigration(message: string): boolean {
  return /service_(categories|provider_profiles|listings|requests|reviews)|column .*service_request|schema cache/i.test(message)
    && /relation|table|schema cache|does not exist|could not find|column/i.test(message);
}

export function isMissingProductModesMigration(message: string): boolean {
  return /(condition|sale_mode|minimum_order_quantity|lead_time_days)/i.test(message)
    && /column|schema cache|does not exist|could not find/i.test(message);
}
