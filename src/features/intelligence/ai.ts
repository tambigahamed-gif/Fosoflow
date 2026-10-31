export type SalesInsightInput = {
  deliveredRevenue: number;
  orderCount: number;
  topItems: Array<{ name: string; quantity: number }>;
};

export function suggestProductDescription(
  name: string,
  category = 'produit local',
  tone: 'commercial' | 'premium' = 'commercial',
) {
  const safeName = name.trim() || 'Produit local';
  const normalizedCategory = category.trim() || 'produit local';
  const description = tone === 'premium'
    ? `Produit premium ${safeName.toLowerCase()} pensé pour valoriser votre boutique et offrir une expérience de qualité à vos clients dans la catégorie ${normalizedCategory}.`
    : `Produit ${safeName.toLowerCase()} conçu pour attirer davantage de clients, renforcer la visibilité de votre boutique et accompagner une vente plus fluide dans la catégorie ${normalizedCategory}.`;

  return `${description} Il se prête bien à une présentation claire, des photos professionnelles et une mise en avant commerciale cohérente.`;
}

export function suggestPrice(basePrice: number, stock: number, demandTrend: number) {
  const safeBase = Number.isFinite(basePrice) ? Math.max(0, basePrice) : 0;
  const stockFactor = stock > 20 ? 0.96 : stock > 8 ? 1.02 : 1.08;
  const demandFactor = demandTrend > 0 ? 1 + demandTrend * 0.06 : 1;
  const suggested = safeBase * stockFactor * demandFactor;
  return Math.max(500, Math.round(suggested / 100) * 100);
}

export function buildMerchantAiSummary(input: SalesInsightInput) {
  const revenue = Math.max(0, input.deliveredRevenue);
  const orderCount = Math.max(0, input.orderCount);
  const topItems = input.topItems.length
    ? input.topItems.slice(0, 3)
    : [{ name: 'Aucune tendance détectée', quantity: 0 }];

  const bestSeller = topItems[0]?.name ?? 'Aucun produit dominant';
  const avgTicket = orderCount > 0 ? Math.round(revenue / orderCount) : 0;

  const bullets = [
    `${bestSeller} est actuellement votre meilleur atout de vente et mérite une mise en avant dans votre boutique.`,
    `Le ticket moyen estimé est de ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(avgTicket)} pour le moment.`,
    orderCount > 0
      ? `Le volume de commandes enregistrées laisse un potentiel de croissance de ${Math.max(8, Math.min(30, Math.round((revenue / 1000) * 0.8)))} % si vous renforcez les offres les plus demandées.`
      : 'Ajoutez au moins deux produits visibles pour générer les premières tendances de vente.',
  ];

  return {
    headline: revenue > 0
      ? 'FasoFlow Intelligence recommande de renforcer les produits qui génèrent le plus de ventes.'
      : 'La boutique n’a pas encore assez de données pour proposer un conseil de vente précis.',
    bullets,
  };
}
