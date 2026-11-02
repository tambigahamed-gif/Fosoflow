import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';

const fieldString = (label: string, requiredMessage: string) => z.string({
  required_error: requiredMessage,
  invalid_type_error: `${label} doit être une chaîne de caractères.`,
});

export const contactInputSchema = z.object({
  name: fieldString('Le nom', 'Le nom est obligatoire.')
    .trim()
    .min(2, 'Le nom doit contenir au moins 2 caractères.')
    .max(120, 'Le nom ne peut pas dépasser 120 caractères.'),
  email: fieldString('L’adresse e-mail', 'L’adresse e-mail est obligatoire.')
    .trim()
    .email('Veuillez saisir une adresse e-mail valide.')
    .max(254, 'L’adresse e-mail ne peut pas dépasser 254 caractères.'),
  subject: fieldString('Le sujet', 'Le sujet est obligatoire.')
    .trim()
    .min(2, 'Le sujet doit contenir au moins 2 caractères.')
    .max(160, 'Le sujet ne peut pas dépasser 160 caractères.'),
  message: fieldString('Le message', 'Le message est obligatoire.')
    .trim()
    .min(5, 'Le message doit contenir au moins 5 caractères.')
    .max(4000, 'Le message ne peut pas dépasser 4 000 caractères.'),
  honeypot: fieldString('Le champ anti-spam', 'Le champ anti-spam est manquant.')
    .max(200, 'Le champ anti-spam est trop long.'),
}).strict({ message: 'Le formulaire contient un champ inattendu.' });

export type ContactInput = z.infer<typeof contactInputSchema>;
export const CONTACT_RATE_LIMIT = Object.freeze({ maxAttempts: 5, windowSeconds: 3600 });

/** Renvoie l'adresse IP fournie par le proxy Vercel, sans la journaliser ni la conserver. */
export function getClientIp(forwardedFor: string | string[] | undefined): string | null {
  const header = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (!header) return null;
  const candidate = header.split(',', 1)[0]?.trim();
  if (!candidate || isIP(candidate) === 0) return null;
  return candidate.toLowerCase();
}

/** Produit uniquement des empreintes HMAC, avec séparation de domaine par identifiant. */
export function deriveContactRateHashes(ip: string, email: string, hmacKey: string) {
  const digest = (kind: 'ip' | 'email', value: string) => createHmac('sha256', hmacKey)
    .update(`fasoflow-contact-rate:v1:${kind}:${value}`, 'utf8')
    .digest('hex');
  return {
    ipHash: digest('ip', ip.toLowerCase()),
    emailHash: digest('email', email.trim().toLowerCase()),
  };
}

export type RateLimitDecision = 'allowed' | 'limited' | 'unavailable';
export function interpretRateLimitResult(data: unknown, error: unknown): RateLimitDecision {
  if (error || typeof data !== 'boolean') return 'unavailable';
  return data ? 'allowed' : 'limited';
}
