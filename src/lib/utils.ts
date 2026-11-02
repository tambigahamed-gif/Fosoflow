import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatMarketAmount } from './market';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatXof(value: number | string | null | undefined) {
  return formatMarketAmount(value);
}

export function formatDate(value: string | Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric', ...options,
  }).format(new Date(value));
}

export const statusLabels: Record<string, string> = {
  pending: 'En attente', accepted: 'Acceptée', in_progress: 'En cours',
  delivered: 'Livrée', cancelled: 'Annulée', paid: 'Payé', active: 'Actif',
  expired: 'Expiré', rejected: 'Refusé', processing: 'En traitement',
  shipped: 'Expédiée', confirmed: 'Confirmée', preparing: 'En préparation',
  ready_for_delivery: 'Prête pour livraison', in_delivery: 'En livraison',
  pending_review: 'À valider', suspended: 'Suspendue', unpublished: 'Non publiée',
};
