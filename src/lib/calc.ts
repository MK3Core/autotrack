import type { Fillup, FillupWithMpg, MpgTier } from '../types';

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

function round1(n: number) {
  return Math.round(n * 10) / 10;
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
 *
 * Each computed mpg is also checked against the vehicle's own historical
 * spread (see `flagOutliers`) and marked `mpgOutlier` when it's way outside
 * the norm. This is usually the signature of a fillup that was missed but
 * never flagged as such, since the "miles since last tank" then gets
 * credited to too few gallons and mpg spikes unrealistically high.
 */
export function computeMpgSeries(fillups: Fillup[]): FillupWithMpg[] {
  const sorted = [...fillups].sort((a, b) => a.odometer - b.odometer);
  const result: FillupWithMpg[] = sorted.map((f) => ({ ...f, mpg: null, mpgOutlier: false, mpgTier: null }));

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

  return assignMpgTiers(flagOutliers(result));
}

const MIN_SAMPLES_FOR_OUTLIER_CHECK = 5;

/** Linear-interpolation percentile (the common "Excel/R-7" method). */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedValues[lower];
  const weight = idx - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * Flags mpg values that fall outside Tukey's fences (Q1 - 1.5*IQR, Q3 + 1.5*IQR),
 * a standard, self-calibrating outlier test: it widens automatically for a
 * vehicle with naturally variable mpg and tightens for a very consistent one,
 * rather than using one fixed threshold for every vehicle.
 */
function flagOutliers(series: FillupWithMpg[]): FillupWithMpg[] {
  const values = series
    .map((f) => f.mpg)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);

  if (values.length < MIN_SAMPLES_FOR_OUTLIER_CHECK) return series;

  const q1 = percentile(values, 25);
  const q3 = percentile(values, 75);
  const iqr = q3 - q1;
  // If the tank-to-tank mileage is essentially constant, fall back to a
  // percentage-of-median band so a single small blip doesn't get a zero-width fence.
  const upperFence = iqr > 0 ? q3 + 1.5 * iqr : q3 * 1.5;
  const lowerFence = iqr > 0 ? q1 - 1.5 * iqr : q1 * 0.5;

  return series.map((f) =>
    f.mpg !== null && (f.mpg > upperFence || f.mpg < lowerFence)
      ? { ...f, mpgOutlier: true }
      : f,
  );
}

const MIN_SAMPLES_FOR_TIERS = 5;
/** A fillup more than this many standard deviations from the vehicle's own
 *  average mpg reads as best/low. */
const TIER_Z_SCORE = 1;

/**
 * Ranks each fillup's mpg against this vehicle's own clean (non-outlier)
 * history using a z-score: 1+ standard deviation below average -> low, 1+
 * above -> best, everything else -> average. Standard deviation (rather than
 * a fixed % of the average) is what actually normalizes for how volatile a
 * vehicle's mpg naturally is: a car that's driven aggressively one week and
 * gently the next has a wide spread on its own terms, so it needs a bigger
 * raw mpg swing to count as unusual than a very consistent commuter car
 * does, and a flat percentage can't tell those two cases apart. Outliers and
 * fillups with no mpg are left untiered (null).
 */
function assignMpgTiers(series: FillupWithMpg[]): FillupWithMpg[] {
  const cleanValues = series.filter((f) => f.mpg !== null && !f.mpgOutlier).map((f) => f.mpg as number);

  if (cleanValues.length < MIN_SAMPLES_FOR_TIERS) return series;

  const mean = cleanValues.reduce((a, b) => a + b, 0) / cleanValues.length;
  const variance = cleanValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (cleanValues.length - 1);
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return series;

  const lowCutoff = mean - TIER_Z_SCORE * stddev;
  const bestCutoff = mean + TIER_Z_SCORE * stddev;

  return series.map((f) => {
    if (f.mpg === null || f.mpgOutlier) return f;
    const mpgTier: MpgTier = f.mpg >= bestCutoff ? 'best' : f.mpg <= lowCutoff ? 'low' : 'average';
    return { ...f, mpgTier };
  });
}

export interface LifetimeMpgStats {
  average: number | null;
  /** Mean of each fillup's mpg truncated to a whole number first, rather
   *  than the mean of the precise decimal values (see `average`). */
  meanWholeMpg: number | null;
  sampleCount: number;
  excludedOutliers: number;
}

/**
 * Lifetime average mpg for a vehicle, from its full fillup history.
 * Fillups flagged as mpg outliers (see `flagOutliers`) are excluded, since a
 * handful of un-flagged missed fillups can otherwise drag a simple average
 * up drastically (one 300mpg blip is enough to swing it by several mpg).
 */
export function computeLifetimeMpgStats(fillups: Fillup[]): LifetimeMpgStats {
  const series = computeMpgSeries(fillups).filter((f) => f.mpg !== null);
  const clean = series.filter((f) => !f.mpgOutlier).map((f) => f.mpg as number);

  if (!clean.length) {
    return { average: null, meanWholeMpg: null, sampleCount: 0, excludedOutliers: series.length };
  }

  const average = clean.reduce((a, b) => a + b, 0) / clean.length;
  const wholeValues = clean.map((v) => Math.trunc(v));
  const meanWholeMpg = wholeValues.reduce((a, b) => a + b, 0) / wholeValues.length;

  return {
    average: round2(average),
    meanWholeMpg: round1(meanWholeMpg),
    sampleCount: clean.length,
    excludedOutliers: series.length - clean.length,
  };
}

export interface LifetimeVehicleStats {
  fillupCount: number;
  avgMpg: number | null;
  meanMpg: number | null;
  bestMpg: number | null;
  worstMpg: number | null;
  totalCost: number | null;
  totalGallons: number | null;
  totalMiles: number | null;
  costPerMile: number | null;
  avgPricePerGallon: number | null;
  avgDaysBetweenFillups: number | null;
  excludedOutliers: number;
}

/**
 * Average calendar days between consecutive fillups. Skips the gap ending at
 * any fillup flagged `missedFillup` or `mpgOutlier`, since those intervals
 * likely span more than one real-world fillup and would otherwise inflate
 * the average (the same reasoning as excluding them from the mpg average).
 */
function computeAvgDaysBetweenFillups(fillups: Fillup[]): number | null {
  const series = computeMpgSeries(fillups).sort(
    (a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer,
  );

  const gapsDays: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const curr = series[i];
    if (curr.missedFillup || curr.mpgOutlier) continue;
    const days = (new Date(curr.date).getTime() - new Date(series[i - 1].date).getTime()) / 86_400_000;
    if (days > 0) gapsDays.push(days);
  }

  if (!gapsDays.length) return null;
  return round1(gapsDays.reduce((a, b) => a + b, 0) / gapsDays.length);
}

/**
 * A broader set of lifetime stats for a single vehicle: cost, gallons, miles
 * driven, and the mpg extremes, alongside the average/mean from
 * `computeLifetimeMpgStats`. Best/worst mpg exclude the same outliers that
 * average/mean do, since an outlier is usually a data artifact (a missed
 * fillup), not a real great or bad tank of gas.
 */
export function computeLifetimeVehicleStats(fillups: Fillup[]): LifetimeVehicleStats {
  const mpgStats = computeLifetimeMpgStats(fillups);
  const cleanMpgValues = computeMpgSeries(fillups)
    .filter((f) => f.mpg !== null && !f.mpgOutlier)
    .map((f) => f.mpg as number);

  const totalCost = fillups.reduce((sum, f) => sum + (f.totalCost ?? 0), 0);
  const totalGallons = fillups.reduce((sum, f) => sum + (f.gallons ?? 0), 0);

  const odometers = fillups.map((f) => f.odometer);
  const totalMiles = odometers.length >= 2 ? Math.max(...odometers) - Math.min(...odometers) : null;

  return {
    fillupCount: fillups.length,
    avgMpg: mpgStats.average,
    meanMpg: mpgStats.meanWholeMpg,
    bestMpg: cleanMpgValues.length ? round2(Math.max(...cleanMpgValues)) : null,
    worstMpg: cleanMpgValues.length ? round2(Math.min(...cleanMpgValues)) : null,
    totalCost: fillups.length ? round2(totalCost) : null,
    totalGallons: fillups.length ? round2(totalGallons) : null,
    totalMiles,
    costPerMile: totalMiles && totalMiles > 0 ? round3(totalCost / totalMiles) : null,
    avgPricePerGallon: totalGallons > 0 ? round3(totalCost / totalGallons) : null,
    avgDaysBetweenFillups: computeAvgDaysBetweenFillups(fillups),
    excludedOutliers: mpgStats.excludedOutliers,
  };
}
