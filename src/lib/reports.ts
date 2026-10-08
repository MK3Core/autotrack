import { addMonths } from './maintenance';
import type { FillupWithMpg, MaintenanceRecord } from '../types';

/**
 * Stats behind the Reports page, for any slice of a vehicle's history.
 *
 * A period is a date range ending on the vehicle's newest entry rather than
 * today, so a car that hasn't been driven in months (or was sold) still
 * shows its last 3 months of real data instead of an empty page.
 */

export type ReportRange = '3m' | '6m' | '1y' | 'all';

export const RANGE_MONTHS: Record<Exclude<ReportRange, 'all'>, number> = { '3m': 3, '6m': 6, '1y': 12 };

/** Dates are ISO yyyy-mm-dd. `after` is exclusive, `through` inclusive; null is open-ended. */
export interface Period {
  after: string | null;
  through: string | null;
}

export interface TankMark {
  mpg: number;
  date: string;
  odometer: number;
}

export interface PriceMark {
  price: number;
  date: string;
}

export interface PeriodStats {
  fillupCount: number;
  serviceCount: number;
  gallons: number;
  fuelCost: number;
  serviceCost: number;
  totalCost: number;
  /** Distance covered by the period's entries (see `periodMiles`). */
  miles: number | null;
  /** Mean of each clean (non-outlier) tank's mpg, the same figure Log and Garage show. */
  avgMpg: number | null;
  bestTank: TankMark | null;
  worstTank: TankMark | null;
  /** Every clean tank in date order, for the distribution strip. */
  tanks: TankMark[];
  excludedOutliers: number;
  /** Fuel cost / volume over fillups that recorded both, i.e. weighted by volume. */
  avgPrice: number | null;
  highPrice: PriceMark | null;
  lowPrice: PriceMark | null;
  latestPrice: PriceMark | null;
  fuelPerMile: number | null;
  servicePerMile: number | null;
  totalPerMile: number | null;
  avgDaysBetweenFillups: number | null;
}

export function inPeriod(date: string, period: Period): boolean {
  return (period.after === null || date > period.after) && (period.through === null || date <= period.through);
}

/** The newest date across fillups and service visits, or null with no entries. */
export function latestEntryDate(fillups: { date: string }[], records: { date: string }[]): string | null {
  let latest: string | null = null;
  for (const e of [...fillups, ...records]) if (latest === null || e.date > latest) latest = e.date;
  return latest;
}

export function earliestEntryDate(fillups: { date: string }[], records: { date: string }[]): string | null {
  let earliest: string | null = null;
  for (const e of [...fillups, ...records]) if (earliest === null || e.date < earliest) earliest = e.date;
  return earliest;
}

/** The day before a date. */
function prevDay(date: string): string {
  return new Date(Date.parse(date) - 86_400_000).toISOString().slice(0, 10);
}

/** The first day of the calendar quarter a date falls in. */
function quarterStart(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
}

/** The calendar quarter starting on `start`, as a period. */
function quarterPeriod(start: string): Period {
  return { after: prevDay(start), through: prevDay(addMonths(start, 3)) };
}

/** "Q3 '26" for the quarter a date falls in. */
export function quarterLabel(date: string): string {
  return bucketLabel(bucketKey(date, 'quarter'));
}

/** Months of history a fixed range needs before it can show trends. */
export function trendHistoryMonths(range: Exclude<ReportRange, 'all'>): number {
  return 2 * RANGE_MONTHS[range];
}

/**
 * The period a range covers and the two sides of its trend comparison. A
 * fixed range compares with the equal-length stretch just before it. "All"
 * has nothing before it, so it compares the last complete calendar quarter
 * with the one before (a rolling quarter would just repeat the 3M trends).
 *
 * `previous` is null until the history fully covers it, i.e. there's a
 * reading on or before its start to measure distance from. Without one, that
 * side loses the miles before its first entry but keeps that fillup's cost,
 * and a half-empty window makes totals look like they jumped.
 */
export function rangePeriods(range: ReportRange, first: string | null, anchor: string | null): {
  current: Period;
  /** The later side of the trend comparison (the same as `current` for fixed ranges). */
  recent: Period;
  previous: Period | null;
} {
  const all: Period = { after: null, through: null };
  if (!first || !anchor) return { current: all, recent: all, previous: null };
  if (range === 'all') {
    // The quarter the newest entry is in counts once its last day is reached.
    const thisQuarter = quarterStart(anchor);
    const recentStart = quarterPeriod(thisQuarter).through === anchor ? thisQuarter : addMonths(thisQuarter, -3);
    const previous = quarterPeriod(addMonths(recentStart, -3));
    if (first > previous.after!) return { current: all, recent: all, previous: null };
    return { current: all, recent: quarterPeriod(recentStart), previous };
  }
  const covered = addMonths(first, trendHistoryMonths(range)) <= anchor;
  const months = RANGE_MONTHS[range];
  const start = addMonths(anchor, -months);
  const recent: Period = { after: start, through: anchor };
  return { current: recent, recent, previous: covered ? { after: addMonths(anchor, -2 * months), through: start } : null };
}

/**
 * Distance driven within a period: the highest odometer in it minus the
 * highest reading from before it, so the miles leading up to the first entry
 * count too. With nothing earlier to measure from (the vehicle's first
 * entries), the lowest reading in the period is the starting point instead.
 * Uses fillups and service visits alike, matching the Garage's cost per mile.
 */
export function periodMiles(odometers: { date: string; odometer: number }[], period: Period): number | null {
  let maxIn: number | null = null;
  let minIn: number | null = null;
  let maxBefore: number | null = null;
  for (const e of odometers) {
    if (inPeriod(e.date, period)) {
      maxIn = maxIn === null ? e.odometer : Math.max(maxIn, e.odometer);
      minIn = minIn === null ? e.odometer : Math.min(minIn, e.odometer);
    } else if (period.after !== null && e.date <= period.after) {
      maxBefore = maxBefore === null ? e.odometer : Math.max(maxBefore, e.odometer);
    }
  }
  if (maxIn === null || minIn === null) return null;
  const miles = maxIn - (maxBefore ?? minIn);
  return miles > 0 ? miles : null;
}

type OdometerReading = { date: string; odometer: number };

/** A day number for an ISO date, for straight-line math between dates. */
function dayNumber(date: string): number {
  return Date.parse(date) / 86_400_000;
}

function nextDay(date: string): string {
  return new Date(Date.parse(date) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Readings in date order, one per date: the highest that day (the end-of-day
 * odometer). A running max keeps a mistyped reading that goes backwards from
 * ever producing negative distance.
 */
export function odometerTimeline(odometers: OdometerReading[]): { day: number; date: string; odometer: number }[] {
  const byDate = new Map<string, number>();
  for (const e of odometers) byDate.set(e.date, Math.max(byDate.get(e.date) ?? -Infinity, e.odometer));
  let reached = -Infinity;
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, odometer]) => {
      reached = Math.max(reached, odometer);
      return { day: dayNumber(date), date, odometer: reached };
    });
}

/**
 * The odometer at the end of `date`: the reading if one was logged that day,
 * otherwise a straight line between the readings either side of it. Null
 * before the first reading or after the last, where there's nothing to go on.
 */
export function odometerAt(timeline: ReturnType<typeof odometerTimeline>, date: string): number | null {
  if (!timeline.length) return null;
  const day = dayNumber(date);
  if (day < timeline[0].day || day > timeline[timeline.length - 1].day) return null;
  for (let i = 0; i < timeline.length; i++) {
    const p = timeline[i];
    if (p.day === day) return p.odometer;
    if (p.day > day) {
      const prev = timeline[i - 1];
      return prev.odometer + ((p.odometer - prev.odometer) * (day - prev.day)) / (p.day - prev.day);
    }
  }
  return null;
}

/**
 * Fuel spending as a running total against the odometer. A fillup pays for
 * the fuel burned since the one before it, so its cost is spread across the
 * miles of that stretch: the total climbs in a straight line from one
 * fillup's reading to the next. The first fillup refills driving from before
 * tracking began, so its cost lands all at once on its own reading.
 */
export function fuelSpendTimeline(
  fillups: { odometer: number; totalCost?: number }[],
): { odometer: number; spent: number }[] {
  const byOdometer = new Map<number, number>();
  for (const f of fillups) byOdometer.set(f.odometer, (byOdometer.get(f.odometer) ?? 0) + (f.totalCost ?? 0));
  let spent = 0;
  return [...byOdometer.entries()]
    .sort(([a], [b]) => a - b)
    .map(([odometer, cost]) => {
      spent += cost;
      return { odometer, spent };
    });
}

/** Fuel spent by the time the odometer reads `odometer` (see `fuelSpendTimeline`). */
export function fuelSpentAt(timeline: ReturnType<typeof fuelSpendTimeline>, odometer: number): number {
  if (!timeline.length || odometer < timeline[0].odometer) return 0;
  for (let i = 0; i < timeline.length; i++) {
    const p = timeline[i];
    if (p.odometer === odometer) return p.spent;
    if (p.odometer > odometer) {
      const prev = timeline[i - 1];
      return prev.spent + ((p.spent - prev.spent) * (odometer - prev.odometer)) / (p.odometer - prev.odometer);
    }
  }
  return timeline[timeline.length - 1].spent;
}

/**
 * Where a period's measurement starts: the odometer estimated on its start
 * date, or null for an open start (no start date, or a history that only
 * begins after it, which comes to the same thing) where it runs from the
 * very first entry.
 */
function startOdometer(timeline: ReturnType<typeof odometerTimeline>, period: Period): number | null {
  if (period.after === null || !timeline.length || period.after < timeline[0].date) return null;
  return odometerAt(timeline, period.after);
}

export interface PeriodEstimate {
  miles: number | null;
  fuelCost: number;
  serviceCost: number;
  totalCost: number;
  totalPerMile: number | null;
}

/**
 * Distance and spending for a period measured from its exact start and end
 * dates, rather than from whichever fillups happen to fall inside it. A drive
 * between two fillups that straddles the start is split by days, and so is
 * the fuel that fillup paid for, so equal periods of steady driving come out
 * equal. Service visits stay on the day they were paid. Trends and charts use
 * this; the headline figures stay on logged entries so they match the Log.
 * With an open start this matches the logged totals exactly.
 */
export function estimatePeriod(
  fillups: { date: string; odometer: number; totalCost?: number }[],
  records: MaintenanceRecord[],
  period: Period,
): PeriodEstimate {
  const readings = [...fillups, ...records];
  const timeline = odometerTimeline(readings);
  const fuel = fuelSpendTimeline(fillups);
  const serviceCost = sum(records.filter((r) => inPeriod(r.date, period)).map((r) => r.totalCost ?? 0));
  if (!timeline.length) {
    return { miles: null, fuelCost: 0, serviceCost, totalCost: serviceCost, totalPerMile: null };
  }
  const start = startOdometer(timeline, period);
  const end = odometerAt(timeline, period.through ?? timeline[timeline.length - 1].date) ?? timeline[timeline.length - 1].odometer;
  const from = start ?? Math.min(...readings.map((e) => e.odometer));
  const miles = end > from ? end - from : null;
  const fuelCost = fuelSpentAt(fuel, end) - (start === null ? 0 : fuelSpentAt(fuel, start));
  const totalCost = fuelCost + serviceCost;
  return { miles, fuelCost, serviceCost, totalCost, totalPerMile: miles ? totalCost / miles : null };
}

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

function round(n: number, places: number) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function daysApart(from: string, to: string) {
  return (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
}

/**
 * `series` is the vehicle's whole mpg series (from `computeMpgSeries`), so a
 * tank that started before the period still gets its real mpg; it's then
 * narrowed to the fillups dated inside the period.
 */
export function computePeriodStats(
  series: FillupWithMpg[],
  records: MaintenanceRecord[],
  period: Period,
): PeriodStats {
  const byDate = [...series].sort((a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer);
  const fillups = byDate.filter((f) => inPeriod(f.date, period));
  const visits = records.filter((r) => inPeriod(r.date, period));

  const fuelCost = sum(fillups.map((f) => f.totalCost ?? 0));
  const serviceCost = sum(visits.map((r) => r.totalCost ?? 0));
  const gallons = sum(fillups.map((f) => f.gallons ?? 0));
  const miles = periodMiles([...byDate, ...records], period);

  const withMpg = fillups.filter((f) => f.mpg !== null);
  const tanks = withMpg
    .filter((f) => !f.mpgOutlier)
    .map((f) => ({ mpg: f.mpg as number, date: f.date, odometer: f.odometer }));
  let bestTank: TankMark | null = null;
  let worstTank: TankMark | null = null;
  for (const t of tanks) {
    if (!bestTank || t.mpg > bestTank.mpg) bestTank = t;
    if (!worstTank || t.mpg < worstTank.mpg) worstTank = t;
  }

  const priced = fillups.filter((f) => typeof f.totalCost === 'number' && typeof f.gallons === 'number' && f.gallons > 0);
  const pricedGallons = sum(priced.map((f) => f.gallons as number));
  const prices = fillups
    .filter((f) => typeof f.pricePerGallon === 'number' && f.pricePerGallon > 0)
    .map((f) => ({ price: f.pricePerGallon as number, date: f.date }));
  let highPrice: PriceMark | null = null;
  let lowPrice: PriceMark | null = null;
  for (const p of prices) {
    if (!highPrice || p.price > highPrice.price) highPrice = p;
    if (!lowPrice || p.price < lowPrice.price) lowPrice = p;
  }

  // Gaps ending at a missed or outlier fillup likely span more than one
  // real fillup, so they're left out (as in calc.ts).
  const gaps: number[] = [];
  for (let i = 1; i < byDate.length; i++) {
    const curr = byDate[i];
    if (!inPeriod(curr.date, period) || curr.missedFillup || curr.mpgOutlier) continue;
    const days = daysApart(byDate[i - 1].date, curr.date);
    if (days > 0) gaps.push(days);
  }

  const perMile = (cost: number) => (miles ? round(cost / miles, 3) : null);

  return {
    fillupCount: fillups.length,
    serviceCount: visits.length,
    gallons: round(gallons, 2),
    fuelCost: round(fuelCost, 2),
    serviceCost: round(serviceCost, 2),
    totalCost: round(fuelCost + serviceCost, 2),
    miles,
    avgMpg: tanks.length ? round(sum(tanks.map((t) => t.mpg)) / tanks.length, 2) : null,
    bestTank,
    worstTank,
    tanks,
    excludedOutliers: withMpg.length - tanks.length,
    avgPrice: pricedGallons > 0 ? round(sum(priced.map((f) => f.totalCost as number)) / pricedGallons, 3) : null,
    highPrice,
    lowPrice,
    latestPrice: prices.length ? prices[prices.length - 1] : null,
    fuelPerMile: perMile(fuelCost),
    servicePerMile: perMile(serviceCost),
    totalPerMile: perMile(fuelCost + serviceCost),
    avgDaysBetweenFillups: gaps.length ? round(sum(gaps) / gaps.length, 1) : null,
  };
}

/** Fractional change from `previous` to `current`, or null when either side is missing. */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export type Bucket = 'month' | 'quarter' | 'year';

/** Monthly bars up to two years, then quarters, then years, so a phone never gets a wall of slivers. */
export function bucketFor(fromDate: string, toDate: string): Bucket {
  const [fy, fm] = fromDate.split('-').map(Number);
  const [ty, tm] = toDate.split('-').map(Number);
  const months = (ty - fy) * 12 + (tm - fm) + 1;
  if (months <= 24) return 'month';
  if (months <= 72) return 'quarter';
  return 'year';
}

/** Sortable key for the bucket a date falls in: "2026-07", "2026-Q3" or "2026". */
function bucketKey(date: string, bucket: Bucket): string {
  const [y, m] = date.split('-');
  if (bucket === 'year') return y;
  if (bucket === 'quarter') return `${y}-Q${Math.floor((Number(m) - 1) / 3) + 1}`;
  return `${y}-${m}`;
}

/** Every bucket key from `fromDate` through `toDate`, including empty ones. */
function bucketKeys(fromDate: string, toDate: string, bucket: Bucket): string[] {
  const keys: string[] = [];
  const step = bucket === 'month' ? 1 : bucket === 'quarter' ? 3 : 12;
  let d = `${fromDate.slice(0, 7)}-01`;
  const last = bucketKey(toDate, bucket);
  for (;;) {
    const key = bucketKey(d, bucket);
    if (keys[keys.length - 1] !== key) keys.push(key);
    if (key >= last) break;
    d = addMonths(d, step);
  }
  return keys;
}

/** "Jul '26", "Q3 '26" or "2026". */
export function bucketLabel(key: string): string {
  const [y, rest] = key.split('-');
  if (!rest) return y;
  const yy = `'${y.slice(2)}`;
  if (rest.startsWith('Q')) return `${rest} ${yy}`;
  const month = new Date(Number(y), Number(rest) - 1, 1).toLocaleDateString(undefined, { month: 'short' });
  return `${month} ${yy}`;
}

export interface SpendBucket {
  key: string;
  fuel: number;
  service: number;
}

export interface MilesBucket {
  key: string;
  miles: number;
}

/** The last day of a bucket key ("2026-07" -> "2026-07-31"). */
function bucketEnd(key: string): string {
  const [y, rest] = key.split('-');
  if (!rest) return `${y}-12-31`;
  const startMonth = rest.startsWith('Q') ? (Number(rest.slice(1)) - 1) * 3 + 1 : Number(rest);
  const months = rest.startsWith('Q') ? 3 : 1;
  const next = addMonths(`${y}-${String(startMonth).padStart(2, '0')}-01`, months);
  return new Date(Date.parse(next) - 86_400_000).toISOString().slice(0, 10);
}

/**
 * The buckets a period's chart spans and the date each one ends on (the
 * last bucket ends with the period). `start` is the start date when there's
 * a reading on or before it, else null and the chart runs from the first
 * entry; either way driving after that point lands in the bucket its day
 * falls in.
 */
function chartBuckets(
  readings: OdometerReading[],
  period: Period,
): { bucket: Bucket; keys: string[]; ends: string[]; timeline: ReturnType<typeof odometerTimeline>; start: number | null } | null {
  const inside = readings.filter((e) => inPeriod(e.date, period));
  const first = earliestEntryDate(inside, []);
  const last = latestEntryDate(inside, []);
  if (!first || !last) return null;
  const timeline = odometerTimeline(readings);
  const start = startOdometer(timeline, period);
  const end = period.through && odometerAt(timeline, period.through) !== null ? period.through : last;
  const keysFrom = start !== null ? nextDay(period.after!) : first;
  const bucket = bucketFor(keysFrom, end);
  const keys = bucketKeys(keysFrom, end, bucket);
  const ends = keys.map((key) => {
    const bucketLast = bucketEnd(key);
    return bucketLast < end ? bucketLast : end;
  });
  return { bucket, keys, ends, timeline, start };
}

/**
 * Distance per bucket, from the odometer estimated at each bucket's edges
 * (see `estimatePeriod`), so steady driving gives steady bars and the bars
 * add up to the period's estimated distance.
 */
export function computeMilesBuckets(
  readings: OdometerReading[],
  period: Period,
): { bucket: Bucket; rows: MilesBucket[] } {
  const chart = chartBuckets(readings, period);
  if (!chart) return { bucket: 'month', rows: [] };
  // Edges are rounded rather than each bar, so the bars add up exactly.
  let reached = Math.round(chart.start ?? Math.min(...readings.map((e) => e.odometer)));
  const rows = chart.keys.map((key, i) => {
    const odometer = Math.round(odometerAt(chart.timeline, chart.ends[i])!);
    const miles = Math.max(0, odometer - reached);
    reached = Math.max(reached, odometer);
    return { key, miles };
  });
  return { bucket: chart.bucket, rows };
}

/**
 * Fuel and service spending per bucket. Fuel follows the miles it paid for
 * (see `estimatePeriod`), so steady driving gives steady fuel bars; service
 * stays in the bucket of the day it was paid.
 */
export function computeSpendBuckets(
  series: FillupWithMpg[],
  records: MaintenanceRecord[],
  period: Period,
): { bucket: Bucket; rows: SpendBucket[] } {
  const chart = chartBuckets([...series, ...records], period);
  if (!chart) return { bucket: 'month', rows: [] };
  const fuel = fuelSpendTimeline(series);
  // Running totals are rounded to the cent rather than each bar, so the bars add up exactly.
  const cents = (n: number) => Math.round(n * 100);
  let reached = chart.start === null ? 0 : cents(fuelSpentAt(fuel, chart.start));
  const rows = new Map(
    chart.keys.map((key, i) => {
      const spent = cents(fuelSpentAt(fuel, odometerAt(chart.timeline, chart.ends[i])!));
      const row = { key, fuel: Math.max(0, spent - reached) / 100, service: 0 };
      reached = Math.max(reached, spent);
      return [key, row];
    }),
  );
  for (const r of records) {
    if (!inPeriod(r.date, period)) continue;
    const row = rows.get(bucketKey(r.date, chart.bucket));
    if (row) row.service = round(row.service + (r.totalCost ?? 0), 2);
  }
  return { bucket: chart.bucket, rows: [...rows.values()] };
}
