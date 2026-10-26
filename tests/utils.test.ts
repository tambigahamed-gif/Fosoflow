import { describe, expect, it } from 'vitest';
import { formatDate, formatXof, statusLabels } from '../src/lib/utils';

describe('formatXof', () => {
  it('formats integer amounts in XOF with no fractional digits', () => {
    expect(formatXof(5000)).toMatch(/5[\u00a0\u202f ]?000/);
    expect(formatXof(5000)).toMatch(/F[\u00a0\u202f ]?CFA/);
  });
  it('uses zero when a value is missing or invalid', () => {
    expect(formatXof(undefined)).toContain('0');
    expect(formatXof('not a number')).toContain('0');
  });
});

describe('labels métier', () => {
  it('uses the delivery statuses required by FasoFlow', () => {
    expect(statusLabels.pending).toBe('En attente');
    expect(statusLabels.accepted).toBe('Acceptée');
    expect(statusLabels.in_progress).toBe('En cours');
    expect(statusLabels.delivered).toBe('Livrée');
    expect(statusLabels.cancelled).toBe('Annulée');
  });
  it('formats a stable date in French', () => {
    expect(formatDate('2025-01-01T12:00:00Z')).toMatch(/2025/);
  });
});
