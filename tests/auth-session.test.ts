import { describe, expect, it } from 'vitest';
import { isCurrentAuthRequest, safeInternalReturnPath } from '../src/app/session-guard';

describe('auth session request guard', () => {
  it('accepts the profile result for the current user and revision', () => {
    expect(isCurrentAuthRequest({ revision: 3, userId: 'user-a' }, { revision: 3, userId: 'user-a' })).toBe(true);
  });

  it('rejects an earlier profile response after the session changes', () => {
    expect(isCurrentAuthRequest({ revision: 2, userId: 'user-a' }, { revision: 3, userId: 'user-a' })).toBe(false);
    expect(isCurrentAuthRequest({ revision: 2, userId: 'user-a' }, { revision: 2, userId: 'user-b' })).toBe(false);
    expect(isCurrentAuthRequest({ revision: 2, userId: 'user-a' }, { revision: 3, userId: null })).toBe(false);
  });

  it('allows only safe same-site return paths after authentication', () => {
    expect(safeInternalReturnPath('/boutique/atelier-ouaga')).toBe('/boutique/atelier-ouaga');
    expect(safeInternalReturnPath('/merchant/products')).toBe('/merchant/products');
    expect(safeInternalReturnPath('/provider/profile')).toBe('/provider/profile');
    expect(safeInternalReturnPath('/client/messages?conversation=abc')).toBe('/client/messages?conversation=abc');
    expect(safeInternalReturnPath('https://example.com')).toBeNull();
    expect(safeInternalReturnPath('//example.com')).toBeNull();
    expect(safeInternalReturnPath('/\\\\example.com')).toBeNull();
    expect(safeInternalReturnPath('/ok\nmalicious')).toBeNull();
  });
});
