import type { Plan } from '../../types';

export const PLANS: Plan[] = [
  { id: 'merchant-starter', audience: 'merchant', code: 'starter', name: 'Starter', price_xof: 0, billing_interval: 'month', product_limit: 20, features: ['Boutique', '20 produits', 'Gestion des commandes', 'Messagerie'] },
  { id: 'merchant-premium', audience: 'merchant', code: 'premium', name: 'Premium', price_xof: 5000, billing_interval: 'month', product_limit: 200, features: ['200 produits', 'Statistiques avancées', 'Promotions', 'Personnalisation de boutique'] },
  { id: 'merchant-business', audience: 'merchant', code: 'business', name: 'Business', price_xof: 15000, billing_interval: 'month', product_limit: 1000, features: ['1 000 produits', 'Outils d’équipe (à venir)', 'Rapports avancés', 'Gestion avancée du stock'] },
  { id: 'courier-starter', audience: 'courier', code: 'starter', name: 'Starter', price_xof: 0, billing_interval: 'month', product_limit: null, features: ['Profil livreur', 'Demandes de livraison', 'Messagerie', 'Historique de base'] },
  { id: 'courier-premium', audience: 'courier', code: 'premium', name: 'Premium', price_xof: 2000, billing_interval: 'month', product_limit: null, features: ['Statistiques de revenus', 'Préférences de livraison', 'Profil enrichi'] },
  { id: 'courier-pro', audience: 'courier', code: 'pro', name: 'Pro', price_xof: 5000, billing_interval: 'month', product_limit: null, features: ['Statistiques avancées', 'Outils de disponibilité', 'Options de visibilité supplémentaires'] },
];

export function plansFor(audience: 'merchant' | 'courier') {
  return PLANS.filter((plan) => plan.audience === audience);
}

export function planById(id: string) {
  return PLANS.find((plan) => plan.id === id);
}
