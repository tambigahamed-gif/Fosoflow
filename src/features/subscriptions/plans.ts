import type { Plan } from '../../types';

export const PLANS: Plan[] = [
  { id: 'merchant-starter', audience: 'merchant', code: 'starter', name: 'Starter', price_xof: 0, billing_interval: 'none', product_limit: 20, features: ['Boutique', '20 produits', 'Gestion des commandes', 'Messagerie'] },
  { id: 'merchant-premium', audience: 'merchant', code: 'premium', name: 'Premium', price_xof: 5000, billing_interval: 'month', product_limit: 200, features: ['200 produits', 'Statistiques avancées', 'Promotions de produits (à venir)', 'Personnalisation de boutique (à venir)'] },
  { id: 'merchant-business', audience: 'merchant', code: 'business', name: 'Business', price_xof: 15000, billing_interval: 'month', product_limit: 1000, features: ['1 000 produits', 'Rapports avancés (à venir)', 'Gestion avancée du stock (à venir)', 'Outils d’équipe (à venir)'] },
  { id: 'courier-starter', audience: 'courier', code: 'starter', name: 'Starter', price_xof: 0, billing_interval: 'none', product_limit: null, features: ['Profil livreur', 'Demandes de livraison', 'Messagerie', 'Historique de base'] },
  { id: 'courier-premium', audience: 'courier', code: 'premium', name: 'Premium', price_xof: 2000, billing_interval: 'month', product_limit: null, features: ['Statistiques de revenus enregistrés', 'Préférences de zone', 'Profil enrichi (à venir)'] },
  { id: 'courier-pro', audience: 'courier', code: 'pro', name: 'Pro', price_xof: 5000, billing_interval: 'month', product_limit: null, features: ['Statistiques avancées (à venir)', 'Outils de disponibilité', 'Options de visibilité supplémentaires (à venir)'] },
];

export function plansFor(audience: 'merchant' | 'courier') {
  return PLANS.filter((plan) => plan.audience === audience);
}

export function planById(id: string) {
  return PLANS.find((plan) => plan.id === id);
}
