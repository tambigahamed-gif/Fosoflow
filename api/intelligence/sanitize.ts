export function sanitizeBusinessText(value: unknown, maxLength = 1200): string {
  if (typeof value !== 'string') return '';
  const withoutControls = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : character;
  }).join('');
  return withoutControls
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[coordonnée masquée]')
    .replace(/(?<!\w)(?:\+|00)?\d(?:[\d\s().-]{6,}\d)(?!\w)/g, '[coordonnée masquée]')
    .replace(/\b(?:adresse|address|domicile|résidence|rue|avenue|secteur|quartier)\s*[:#-]?\s*[^,.;\n]{1,120}/gi, '[adresse masquée]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
