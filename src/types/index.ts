export interface Vehicle {
  id: string;
  name: string;
  make?: string;
  model?: string;
  year?: number;
  licensePlate?: string;
  fuelCapacityGal?: number;
  active: boolean;
  notes?: string;
  createdAt: string;
}

export interface Fillup {
  id: string;
  vehicleId: string;
  date: string; // ISO yyyy-mm-dd
  time?: string; // HH:mm
  odometer: number;
  gasType: string;
  pricePerGallon?: number;
  totalCost?: number;
  gallons?: number;
  fullTank: boolean;
  /** true = a fillup happened before this one that was never logged, so the
   *  odometer delta back to the previous logged fillup cannot be trusted */
  missedFillup: boolean;
  /** true = the user confirmed this entry's mpg outlier flag is a real,
   *  accurate reading (not a missed fillup), so stop prompting about it */
  outlierAcknowledged?: boolean;
  gasStation?: string;
  notes?: string;
  createdAt: string;
}

export interface MaintenanceRaw {
  id: string;
  vehicleId?: string;
  vehicleName?: string;
  date?: string;
  odometer?: number;
  totalCost?: number;
  type?: string;
  location?: string;
  notes?: string;
  raw: Record<string, unknown>;
  createdAt: string;
}

export const GAS_TYPE_PRESETS = [
  'Regular (87)',
  'Mid-Grade (89)',
  'Premium (91)',
  'Premium (93)',
  'Diesel',
  'E85',
] as const;

/** One of these three fillup fields, computed from the other two. */
export type FillupCalcField = 'pricePerGallon' | 'totalCost' | 'gallons';

/** Where a fillup's mpg falls relative to this vehicle's own history. */
export type MpgTier = 'low' | 'average' | 'best';

export interface FillupWithMpg extends Fillup {
  mpg: number | null;
  /** true when `mpg` is a statistical outlier vs. this vehicle's other fillups
   *  (a common symptom of an un-flagged missed fillup) */
  mpgOutlier: boolean;
  /** null when mpg is null, the fillup is an outlier, or there isn't enough
   *  history yet to rank this vehicle's fillups */
  mpgTier: MpgTier | null;
}
