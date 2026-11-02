import { describe, expect, it } from 'vitest';
import {
  contactInputSchema,
  deriveContactRateHashes,
  getClientIp,
  interpretRateLimitResult,
} from '../api/contact-security';

const validContact = {
  name: 'Awa Traoré',
  email: 'awa@example.com',
  subject: 'Question',
  message: 'Bonjour, je souhaite en savoir plus.',
  honeypot: '',
};

describe('validation stricte du formulaire contact', () => {
  it('accepte les champs attendus et normalise les espaces', () => {
    const result = contactInputSchema.parse({ ...validContact, name: '  Awa Traoré  ' });
    expect(result.name).toBe('Awa Traoré');
    expect(result.honeypot).toBe('');
  });

  it('rejette les propriétés inattendues, les e-mails invalides et les textes trop longs', () => {
    expect(contactInputSchema.safeParse({ ...validContact, admin: true }).success).toBe(false);
    expect(contactInputSchema.safeParse({ ...validContact, email: 'pas-un-email' }).success).toBe(false);
    expect(contactInputSchema.safeParse({ ...validContact, message: 'x'.repeat(4001) }).success).toBe(false);
  });

  it('rejette les champs manquants et les types incorrects', () => {
    expect(contactInputSchema.safeParse({ ...validContact, honeypot: undefined }).success).toBe(false);
    expect(contactInputSchema.safeParse({ ...validContact, name: 42 }).success).toBe(false);
  });
});

describe('pseudonymisation et rate-limit', () => {
  it('produit des HMAC SHA-256 stables, distincts par type, sans stocker les valeurs brutes', () => {
    const first = deriveContactRateHashes('203.0.113.7', 'AWA@EXAMPLE.COM', 'server-only-key');
    const normalized = deriveContactRateHashes('203.0.113.7', ' awa@example.com ', 'server-only-key');
    expect(first).toEqual(normalized);
    expect(first.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.emailHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.ipHash).not.toBe(first.emailHash);
    expect(JSON.stringify(first)).not.toContain('203.0.113.7');
    expect(JSON.stringify(first)).not.toContain('awa@example.com');
    expect(deriveContactRateHashes('203.0.113.7', 'awa@example.com', 'other-key').emailHash)
      .not.toBe(first.emailHash);
  });

  it('extrait la première IP proxy valide et refuse les valeurs absentes ou invalides', () => {
    expect(getClientIp('203.0.113.7, 10.0.0.1')).toBe('203.0.113.7');
    expect(getClientIp('2001:DB8::1')).toBe('2001:db8::1');
    expect(getClientIp(undefined)).toBeNull();
    expect(getClientIp('not-an-ip')).toBeNull();
  });

  it('interprète toute erreur ou réponse RPC inattendue comme indisponible', () => {
    expect(interpretRateLimitResult(true, null)).toBe('allowed');
    expect(interpretRateLimitResult(false, null)).toBe('limited');
    expect(interpretRateLimitResult(null, { message: 'db error' })).toBe('unavailable');
    expect(interpretRateLimitResult('true', null)).toBe('unavailable');
  });
});
