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
}

export const DISTANCE_UNITS: { value: DistanceUnit; label: string }[] = [
  { value: 'mi', label: 'Miles' },
  { value: 'km', label: 'Kilometers' },
];

export const FUEL_UNITS: { value: FuelUnit; label: string }[] = [
  { value: 'gal', label: 'Gallons' },
  { value: 'L', label: 'Liters' },
];

export function unitsFor(vehicle: Pick<Vehicle, 'distanceUnit' | 'fuelUnit'> | null | undefined): Units {
  const distance = vehicle?.distanceUnit ?? 'mi';
  const fuel = vehicle?.fuelUnit ?? 'gal';
  const km = distance === 'km';
  const liters = fuel === 'L';
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
