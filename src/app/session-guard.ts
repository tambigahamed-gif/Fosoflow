export interface AuthRequestIdentity {
  revision: number;
  userId: string;
}

export function isCurrentAuthRequest(
  request: AuthRequestIdentity,
  current: { revision: number; userId: string | null },
): boolean {
  return request.revision === current.revision && request.userId === current.userId;
}

export function safeInternalReturnPath(value: string | null | undefined): string | null {
  if (!value || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || [...value].some((character) => (character.codePointAt(0) ?? 0) <= 0x20)) return null;
  try {
    return new URL(value, 'https://fasoflow.invalid').origin === 'https://fasoflow.invalid' ? value : null;
  } catch {
    return null;
  }
}
