export interface MarketConfig {
  readonly id: string;
  readonly countryCode: string;
  readonly countryName: string;
  readonly currencyCode: string;
  readonly currencyLabel: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly language: string;
}

/** Registre de configuration uniquement : aucun autre pays n’est activé dans cette version. */
export const MARKET_REGISTRY = {
  BF: {
    id: 'BF',
    countryCode: 'BF',
    countryName: 'Burkina Faso',
    currencyCode: 'XOF',
    currencyLabel: 'FCFA',
    locale: 'fr-FR',
    timeZone: 'Africa/Ouagadougou',
    language: 'fr',
  },
} as const satisfies Record<string, MarketConfig>;

export type MarketId = keyof typeof MARKET_REGISTRY;
export const DEFAULT_MARKET_ID: MarketId = 'BF';
export const DEFAULT_MARKET = MARKET_REGISTRY[DEFAULT_MARKET_ID];

export interface MarketDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

export function getMarketDateParts(value: Date, market: MarketConfig = DEFAULT_MARKET): MarketDateParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: market.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour') };
}

export function marketDateKey(value: Date, market: MarketConfig = DEFAULT_MARKET) {
  const parts = getMarketDateParts(value, market);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** Décale une date de calendrier (et non une durée de 24 h) dans le marché actif. */
export function shiftMarketDateKey(dateKey: string, days = 0, months = 0) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error('Date de marché invalide');
  const [, year, month, day] = match;
  const shifted = new Date(Date.UTC(Number(year), Number(month) - 1 + months, Number(day) + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

/** Convertit une heure civile du marché en instant UTC (le marché BF n'applique pas l'heure d'été). */
export function marketLocalTimeToUtc(dateKey: string, hour = 0, market: MarketConfig = DEFAULT_MARKET): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match || !Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('Heure de marché invalide');
  const [, year, month, day] = match;
  const target = Date.UTC(Number(year), Number(month) - 1, Number(day), hour);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getMarketDateParts(new Date(candidate), market);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour);
    candidate += target - represented;
  }
  return new Date(candidate);
}

export function formatMarketAmount(value: number | string | null | undefined, market: MarketConfig = DEFAULT_MARKET) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat(market.locale, {
    style: 'currency',
    currency: market.currencyCode,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}
