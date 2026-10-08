import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useVehicles } from '../lib/VehicleContext';
import { computeMpgSeries } from '../lib/calc';
import {
  bucketLabel,
  change,
  computeMilesBuckets,
  computePeriodStats,
  computeSpendBuckets,
  earliestEntryDate,
  inPeriod,
  latestEntryDate,
  rangePeriods,
  type PeriodStats,
  type ReportRange,
} from '../lib/reports';
import { unitsFor } from '../lib/units';
import { CHART, money, rate, shortDate } from '../lib/reportFormat';
import {
  CostSplit,
  FillupLineChart,
  MilesChart,
  PriceRange,
  ReportCard,
  SpendChart,
  TankStrip,
  Trend,
} from '../components/ReportViz';
import type { Fillup, MaintenanceRecord } from '../types';
import './Reports.css';

const RANGES: { value: ReportRange; label: string; against: string }[] = [
  { value: '3m', label: '3M', against: 'previous 3 months' },
  { value: '6m', label: '6M', against: 'previous 6 months' },
  { value: '1y', label: '1Y', against: 'previous year' },
  { value: 'all', label: 'All', against: 'first half' },
];

/** Trends need a couple of data points on both sides, or one odd tank decides them. */
const MIN_TREND_SAMPLES = 2;

function StripEnd({ label, value, meta, align }: { label: string; value: string; meta: string; align?: 'end' }) {
  return (
    <div className="strip-end" style={align ? { alignItems: 'flex-end' } : undefined}>
      <span className="strip-end__label">{label}</span>
      <span className="strip-end__value">{value}</span>
      <span className="strip-end__meta">{meta}</span>
    </div>
  );
}

export default function Reports() {
  const { vehicles, selectedVehicleId } = useVehicles();
  const [range, setRange] = useState<ReportRange>('all');
  // One read tagged with its vehicle, so fillups and service records always
  // come from the same vehicle; see the matching note in Log.tsx. Previous
  // results are kept while switching, so this is only undefined on first load.
  const snapshot = useLiveQuery(async () => {
    if (!selectedVehicleId) {
      return { vehicleId: null, fillups: [] as Fillup[], records: [] as MaintenanceRecord[] };
    }
    return db.transaction('r', db.fillups, db.maintenance, async () => {
      const [fillups, records] = await Promise.all([
        db.fillups.where('vehicleId').equals(selectedVehicleId).toArray() as Promise<Fillup[]>,
        db.maintenance.where('vehicleId').equals(selectedVehicleId).toArray() as Promise<MaintenanceRecord[]>,
      ]);
      return { vehicleId: selectedVehicleId, fillups, records };
    });
  }, [selectedVehicleId]);

  // Render nothing until the first read, rather than empty stats that the
  // real data immediately replaces.
  if (!snapshot) return null;

  const { fillups, records } = snapshot;
  // Names and units follow the snapshot's vehicle, which can trail the
  // selection by a frame while the new vehicle's data is read.
  const selectedVehicle = vehicles.find((v) => v.id === snapshot.vehicleId) ?? null;
  const u = unitsFor(selectedVehicle);

  if (!fillups.length && !records.length) {
    return (
      <div className="reports">
        <h2>Reports</h2>
        <p className="reports__empty">
          {selectedVehicle ? 'Log a few fillups and your reports will show up here.' : 'Add a vehicle to see reports.'}
        </p>
      </div>
    );
  }

  const series = computeMpgSeries(fillups);
  const anchor = latestEntryDate(fillups, records);
  const first = earliestEntryDate(fillups, records);
  const periods = rangePeriods(range, first, anchor);
  const s = computePeriodStats(series, records, periods.current);
  const recent = range === 'all' ? computePeriodStats(series, records, periods.recent) : s;
  const prev = periods.previous ? computePeriodStats(series, records, periods.previous) : null;
  const against = RANGES.find((r) => r.value === range)!.against;
  const odometers = [...fillups, ...records];

  /** A trend between the recent and previous periods, when both have enough to compare. */
  function trend(pick: (p: PeriodStats) => number | null, enough: (p: PeriodStats) => boolean = () => true) {
    if (!prev || !enough(recent) || !enough(prev)) return null;
    return change(pick(recent), pick(prev));
  }

  const mpgTrend = trend((p) => p.avgMpg, (p) => p.tanks.length >= MIN_TREND_SAMPLES);
  const priceTrend = trend((p) => p.avgPrice, (p) => p.fillupCount >= MIN_TREND_SAMPLES);
  const costPerMileTrend = trend((p) => p.totalPerMile, (p) => p.fillupCount >= MIN_TREND_SAMPLES);
  const milesTrend = trend((p) => p.miles);
  const totalCostTrend = trend((p) => p.totalCost);

  // A fixed range reads from its nominal start; "All" from the first entry.
  const from = periods.current.after ?? first;
  const caption = from && anchor ? `${shortDate(from, true)} – ${shortDate(anchor, true)}` : '';

  const hasMpg = s.avgMpg !== null;
  const hasPrice = s.avgPrice !== null && s.lowPrice && s.highPrice && s.latestPrice;
  const mpgPoints = series
    .filter((f) => f.mpg !== null && !f.mpgOutlier && inPeriod(f.date, periods.current))
    .map((f) => ({ date: f.date, value: f.mpg as number }));
  const pricePoints = series
    .filter((f) => typeof f.pricePerGallon === 'number' && inPeriod(f.date, periods.current))
    .map((f) => ({ date: f.date, value: f.pricePerGallon as number }));

  return (
    <div className="reports">
      <header className="reports__header">
        <h2>Reports</h2>
        <div className="reports__ranges" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              role="tab"
              aria-selected={range === r.value}
              className={`reports__range ${range === r.value ? 'is-active' : ''}`}
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="reports__caption">
          {caption}
          {prev && (
            <span>
              {range === 'all' && periods.recent.after
                ? ` · Trends: since ${shortDate(periods.recent.after, true)} vs. before`
                : ` · Trends vs. ${against}`}
            </span>
          )}
        </p>
      </header>

      {/* Driving: distance leads, as everywhere else in the app. */}
      <ReportCard
        title="Driving"
        detailLabel={`${u.distTitle} over time`}
        detail={() => {
          const { bucket, rows } = computeMilesBuckets(odometers, periods.current);
          return (
            <div className="reports__chart">
              {bucket !== 'month' && <p className="reports__chart-note">By {bucket}</p>}
              <MilesChart rows={rows} label={bucketLabel} unit={u.dist} />
            </div>
          );
        }}
      >
        <div className="reports__kpis">
          <div className="kpi kpi--lead">
            <span className="kpi__value">
              {s.miles !== null ? s.miles.toLocaleString() : '–'}
              <small> {u.dist}</small>
            </span>
            <span className="kpi__label">
              Tracked <Trend value={milesTrend} good="neither" against={against} />
            </span>
          </div>
          <div className="kpi">
            <span className="kpi__value">{s.fillupCount}</span>
            <span className="kpi__label">Fillups</span>
          </div>
          <div className="kpi">
            <span className="kpi__value">{s.gallons.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
            <span className="kpi__label">{u.volTitle}</span>
          </div>
        </div>
        {s.avgDaysBetweenFillups !== null && (
          <p className="reports__aside">Fills up about every {Math.round(s.avgDaysBetweenFillups)} days</p>
        )}
      </ReportCard>

      {/* Fuel economy: the average, then where every tank landed. */}
      <ReportCard
        title="Fuel economy"
        detailLabel="Every tank"
        detail={
          mpgPoints.length >= 2
            ? () => (
                <div className="reports__chart">
                  <FillupLineChart
                    data={mpgPoints}
                    name={u.economy}
                    format={(v) => v.toFixed(1)}
                    axisFormat={(v) => String(Math.round(v * 10) / 10)}
                    average={s.avgMpg}
                  />
                </div>
              )
            : undefined
        }
      >
        {hasMpg ? (
          <>
            <div className="hero">
              <span className="hero__value">{s.avgMpg!.toFixed(1)}</span>
              <span className="hero__unit">avg {u.economy}</span>
              <Trend value={mpgTrend} good="up" against={against} />
            </div>
            {s.bestTank && s.worstTank && s.tanks.length >= 2 ? (
              <TankStrip
                tanks={s.tanks}
                avg={s.avgMpg!}
                unit={u.economy}
                ends={[
                  <StripEnd
                    key="worst"
                    label="Worst tank"
                    value={s.worstTank.mpg.toFixed(1)}
                    meta={shortDate(s.worstTank.date, true)}
                  />,
                  <StripEnd
                    key="best"
                    label="Best tank"
                    value={s.bestTank.mpg.toFixed(1)}
                    meta={shortDate(s.bestTank.date, true)}
                    align="end"
                  />,
                ]}
              />
            ) : null}
          </>
        ) : (
          <p className="reports__empty">Needs two full-tank fillups in this range to work out {u.economy}.</p>
        )}
        {s.excludedOutliers > 0 && (
          <p className="reports__outlier-note">
            {s.excludedOutliers} tank{s.excludedOutliers === 1 ? '' : 's'} left out as outliers, likely missed
            fillups. Check the flags in the Log.
          </p>
        )}
      </ReportCard>

      {/* Cost of ownership: everything spent, per distance, and how it splits. */}
      <ReportCard
        title="Cost of ownership"
        detailLabel="Spending over time"
        detail={() => {
          const { bucket, rows } = computeSpendBuckets(series, records, periods.current);
          return (
            <div className="reports__chart">
              {bucket !== 'month' && <p className="reports__chart-note">By {bucket}</p>}
              <SpendChart rows={rows} label={bucketLabel} />
            </div>
          );
        }}
      >
        <div className="hero hero--split">
          <div className="hero__main">
            <span className="hero__value">{money(s.totalCost)}</span>
            <span className="hero__unit">
              total <Trend value={totalCostTrend} good="down" against={against} />
            </span>
          </div>
          <div className="hero__side">
            <span className="hero__side-value">{s.totalPerMile !== null ? rate(s.totalPerMile) : '–'}</span>
            <span className="hero__unit">
              per {u.perDist} <Trend value={costPerMileTrend} good="down" against={against} />
            </span>
          </div>
        </div>
        <CostSplit fuel={s.fuelCost} service={s.serviceCost} />
        <table className="cost-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Category</span>
              </th>
              <th scope="col">Total</th>
              <th scope="col">Per {u.perDist}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                <i className="key key--dot" style={{ background: CHART.fuel }} />
                Fuel
              </th>
              <td>{money(s.fuelCost)}</td>
              <td>{s.fuelPerMile !== null ? rate(s.fuelPerMile) : '–'}</td>
            </tr>
            <tr>
              <th scope="row">
                <i className="key key--dot" style={{ background: CHART.service }} />
                Service
                {s.serviceCount > 0 && <span className="cost-table__count">{s.serviceCount}</span>}
              </th>
              <td>{money(s.serviceCost)}</td>
              <td>{s.servicePerMile !== null ? rate(s.servicePerMile) : '–'}</td>
            </tr>
          </tbody>
        </table>
      </ReportCard>

      {/* Fuel price: the average paid, and where it sits between the extremes. */}
      <ReportCard
        title="Fuel price"
        detailLabel="Price history"
        detail={
          pricePoints.length >= 2
            ? () => (
                <div className="reports__chart">
                  <FillupLineChart
                    data={pricePoints}
                    name={`$ / ${u.vol}`}
                    format={rate}
                    axisFormat={(v) => `$${v.toFixed(2)}`}
                    average={s.avgPrice}
                  />
                </div>
              )
            : undefined
        }
      >
        {hasPrice ? (
          <>
            <div className="hero">
              <span className="hero__value">{rate(s.avgPrice!)}</span>
              <span className="hero__unit">avg / {u.vol}</span>
              <Trend value={priceTrend} good="down" against={against} />
            </div>
            {s.highPrice!.price > s.lowPrice!.price && (
              <PriceRange
                low={s.lowPrice!.price}
                high={s.highPrice!.price}
                avg={s.avgPrice!}
                latest={s.latestPrice!.price}
                ends={[
                  <StripEnd
                    key="low"
                    label="Low"
                    value={rate(s.lowPrice!.price)}
                    meta={shortDate(s.lowPrice!.date, true)}
                  />,
                  <StripEnd
                    key="high"
                    label="High"
                    value={rate(s.highPrice!.price)}
                    meta={shortDate(s.highPrice!.date, true)}
                    align="end"
                  />,
                ]}
              />
            )}
          </>
        ) : (
          <p className="reports__empty">No priced fillups in this range.</p>
        )}
      </ReportCard>
    </div>
  );
}
