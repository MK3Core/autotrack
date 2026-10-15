import type { DistanceUnit, FuelUnit, Vehicle } from '../types';

/**
 * Unit labels for one vehicle. Numbers are stored and calculated raw, so only
 * the labels change: a kilometre vehicle's odometer is simply read in km, and
 * its "economy" is distance per fuel unit in whatever units it uses.
 * Vehicles saved before units existed default to miles and gallons.
 */
export interface Units {
  distance: DistanceUnit;
  fuel: FuelUnit;
  /** "mi" / "km" */
  dist: string;
  /** "miles" / "kilometers" */
  distLong: string;
  /** "Miles" / "Kilometers" */
  distTitle: string;
  /** "mile" / "km", for "Cost / Mile" style labels */
  perDist: string;
  /** "gal" / "L" */
  vol: string;
  /** "Gallons" / "Liters" */
  volTitle: string;
  /** "MPG", "km/gal", "mi/L" or "km/L" */
  economy: string;
  /** ISO 4217 code, e.g. "USD" */
  currency: string;
  /** "$", "€", "£", ... */
  cur: string;
}

export const DISTANCE_UNITS: { value: DistanceUnit; label: string }[] = [
  { value: 'mi', label: 'Miles' },
  { value: 'km', label: 'Kilometers' },
];

export const FUEL_UNITS: { value: FuelUnit; label: string }[] = [
  { value: 'gal', label: 'Gallons' },
  { value: 'L', label: 'Liters' },
];

/** Common picks for the vehicle form; an imported code outside this list still works. */
export const CURRENCIES = ['USD', 'CAD', 'MXN', 'EUR', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'AUD', 'NZD', 'JPY', 'CNY', 'KRW', 'INR', 'BRL', 'ZAR'];

/** The currency's short symbol in the user's locale: "$", "€", "¥". */
export function currencySymbol(currency: string): string {
  return (
    new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? currency
  );
}

/** Reads an ISO 4217 code ("usd", "EUR") or a few unambiguous symbols. */
export function parseCurrency(raw: unknown): string | undefined {
  const s = String(raw ?? '').trim();
  const bySymbol: Record<string, string> = { '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW' };
  if (bySymbol[s]) return bySymbol[s];
  if (!/^[a-z]{3}$/i.test(s)) return undefined;
  const code = s.toUpperCase();
  return Intl.supportedValuesOf('currency').includes(code) ? code : undefined;
}

export function unitsFor(
  vehicle: Pick<Vehicle, 'distanceUnit' | 'fuelUnit' | 'currency'> | null | undefined,
): Units {
  const distance = vehicle?.distanceUnit ?? 'mi';
  const fuel = vehicle?.fuelUnit ?? 'gal';
  const km = distance === 'km';
  const liters = fuel === 'L';
  const currency = vehicle?.currency ?? 'USD';
  return {
    distance,
    fuel,
    dist: km ? 'km' : 'mi',
    distLong: km ? 'kilometers' : 'miles',
    distTitle: km ? 'Kilometers' : 'Miles',
    perDist: km ? 'km' : 'mile',
    vol: liters ? 'L' : 'gal',
    volTitle: liters ? 'Liters' : 'Gallons',
    economy: km ? (liters ? 'km/L' : 'km/gal') : liters ? 'mi/L' : 'MPG',
    currency,
    cur: currencySymbol(currency),
  };
}

/** Reads a distance unit from free text ("mi", "Miles", "km", "kilometres"). */
export function parseDistanceUnit(raw: unknown): DistanceUnit | undefined {
  const s = String(raw ?? '').trim().toLowerCase();
  if (/^(mi|mile|miles)$/.test(s)) return 'mi';
  if (/^(km|kms|kilometer|kilometers|kilometre|kilometres)$/.test(s)) return 'km';
  return undefined;
}

/** Reads a fuel unit from free text ("gal", "gallons", "L", "litres"). */
export function parseFuelUnit(raw: unknown): FuelUnit | undefined {
  const s = String(raw ?? '').trim().toLowerCase();
  if (/^(gal|gals|gallon|gallons)$/.test(s)) return 'gal';
  if (/^(l|liter|liters|litre|litres)$/.test(s)) return 'L';
  return undefined;
}
