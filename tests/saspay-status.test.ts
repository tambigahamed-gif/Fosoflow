import { describe, expect, it } from 'vitest';
import { classifySasPayStatus } from '../api/payments/status-parser';

const session = 'c9a17e2c-4b1a-4f0e-9c3d-2a1b3c4d5e6f';

describe('classifySasPayStatus', () => {
  it('confirme uniquement un succès rattaché à la session demandée', () => {
    expect(classifySasPayStatus({ id: session, status: 'PAID', transaction_status: 'SUCCESS' }, session)).toBe('paid');
  });

  it('refuse un autre identifiant ou un identifiant manquant', () => {
    expect(classifySasPayStatus({ id: 'd9a17e2c-4b1a-4f0e-9c3d-2a1b3c4d5e6f', status: 'PAID', transaction_status: 'SUCCESS' }, session)).toBe('session_mismatch');
    expect(classifySasPayStatus({ status: 'PAID', transaction_status: 'SUCCESS' }, session)).toBe('session_mismatch');
  });

  it('garde en attente tout statut qui ne confirme pas le paiement', () => {
    expect(classifySasPayStatus({ id: session, status: 'PENDING', transaction_status: 'PENDING' }, session)).toBe('pending');
  });

  it('refuse un corps de réponse non objet', () => {
    expect(classifySasPayStatus(null, session)).toBe('invalid');
    expect(classifySasPayStatus('PAID', session)).toBe('invalid');
  });
});
