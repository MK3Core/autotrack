import type { Fillup, FillupWithMpg } from '../types';

/**
 * Given any two of {pricePerGallon, totalCost, gallons}, compute the third.
 * `edited` names the two fields the user actually typed into; the third key
 * in the triangle is derived. Returns a new partial object with the derived
 * field filled in (or unchanged if fewer than two values are present).
 */
export function computeThirdValue(values: {
  pricePerGallon?: number;
  totalCost?: number;
  gallons?: number;
}): { pricePerGallon?: number; totalCost?: number; gallons?: number } {
  const { pricePerGallon, totalCost, gallons } = values;
  const have = {
    pricePerGallon: isFinite(pricePerGallon as number) && pricePerGallon !== undefined,
    totalCost: isFinite(totalCost as number) && totalCost !== undefined,
    gallons: isFinite(gallons as number) && gallons !== undefined,
  };

  if (have.pricePerGallon && have.gallons && !have.totalCost) {
    return { ...values, totalCost: round2(pricePerGallon! * gallons!) };
  }
  if (have.pricePerGallon && have.totalCost && !have.gallons) {
    return { ...values, gallons: round3(totalCost! / pricePerGallon!) };
  }
  if (have.totalCost && have.gallons && !have.pricePerGallon) {
    return { ...values, pricePerGallon: round3(totalCost! / gallons!) };
  }
  return values;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Computes fuel efficiency (mpg) for a chronologically-sorted (by odometer)
 * list of fillups for a single vehicle.
 *
 * Method: full-tank-to-full-tank. Gallons from any partial fills are
 * accumulated until the next full-tank fillup, at which point
 * mpg = (odometer delta since last full tank) / (accumulated gallons).
 * That figure is also back-filled onto the partial fills that led up to it,
 * since they're all part of the same tank cycle (this matches how Drivvo
 * itself reports mileage for a mix of partial and full fillups).
 *
 * A fillup flagged `missedFillup` means a real-world fillup between it and
 * the previous logged one was never recorded, so the odometer delta is
 * meaningless. That fillup gets mpg = null, and the chain resets: the next
 * mpg figure can only be computed once a new full-tank baseline is set.
 */
export function computeMpgSeries(fillups: Fillup[]): FillupWithMpg[] {
  const sorted = [...fillups].sort((a, b) => a.odometer - b.odometer);
  const result: FillupWithMpg[] = sorted.map((f) => ({ ...f, mpg: null }));

  let lastFullTankOdometer: number | null = null;
  let accumulatedGallons = 0;
  let pendingPartialIndexes: number[] = [];

  sorted.forEach((f, i) => {
    if (f.missedFillup) {
      lastFullTankOdometer = f.fullTank ? f.odometer : null;
      accumulatedGallons = 0;
      pendingPartialIndexes = [];
      return;
    }

    if (typeof f.gallons === 'number') {
      accumulatedGallons += f.gallons;
    }

    if (!f.fullTank) {
      // Partial fill: gallons roll forward, mpg back-filled once the tank is topped off.
      pendingPartialIndexes.push(i);
      return;
    }

    if (lastFullTankOdometer !== null && accumulatedGallons > 0) {
      const milesSince = f.odometer - lastFullTankOdometer;
      if (milesSince > 0) {
        const mpg = round2(milesSince / accumulatedGallons);
        result[i].mpg = mpg;
        for (const idx of pendingPartialIndexes) result[idx].mpg = mpg;
      }
    }

    lastFullTankOdometer = f.odometer;
    accumulatedGallons = 0;
    pendingPartialIndexes = [];
  });

  return result;
}
