import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Le guide SasPay exige la validation d'un timestamp et d'une signature HMAC calculée sur le corps brut,
 * mais la documentation accessible ne précise pas la liste complète des trois headers ni le nom du secret,
 * l'algorithme, ni la chaîne exacte à signer. Cette route ne traite aucun événement tant que SasPay n'a
 * pas confirmé ces paramètres. La vérification pull via GET checkout-session status reste disponible.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Retry-After', '300');
  return res.status(503).json({ error: 'Réception webhook désactivée jusqu’à confirmation du contrat exact de signature SasPay. Aucun paiement n’a été modifié.' });
}
