import { useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
  type TooltipContentProps,
} from 'recharts';
import { CHART, money, rate, shortDate } from '../lib/reportFormat';
import './ReportViz.css';

const AXIS_TICK = { fontSize: 11, fill: CHART.axis };

function monthTick(t: number) {
  return new Date(t).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

// ---- Trend chip -------------------------------------------------------------

/**
 * Signed change against the comparison period, colored by whether that
 * direction is good news (more MPG is, a higher price isn't). The arrow
 * carries the direction too, so color is never the only signal. Changes under
 * half a percent read as steady. With nothing to compare yet it holds its
 * place as a dim dash, so it's clear a trend will show up there.
 */
export function Trend({
  value,
  good,
  against,
}: {
  value: number | null;
  good: 'up' | 'down' | 'neither';
  /** e.g. "previous 6 months", for the accessible label. */
  against: string;
}) {
  if (value === null || !isFinite(value)) {
    return (
      <span className="trend trend--none" aria-label="Not enough history for a trend yet">
        –
      </span>
    );
  }
  const pct = value * 100;
  const abs = Math.abs(pct);
  if (abs < 0.5) {
    return (
      <span className="trend trend--steady" aria-label={`Steady vs. ${against}`}>
        <span aria-hidden="true">→</span> steady
      </span>
    );
  }
  const up = pct > 0;
  const tone = good === 'neither' ? 'neutral' : (good === 'up') === up ? 'good' : 'bad';
  const shown = abs < 10 ? abs.toFixed(1) : Math.round(abs).toString();
  return (
    <span className={`trend trend--${tone}`} aria-label={`${up ? 'Up' : 'Down'} ${shown}% vs. ${against}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {shown}%
    </span>
  );
}

// ---- Expandable card --------------------------------------------------------

/**
 * A report card: the key figures always show, the chart sits behind a tap.
 * The chart only mounts on first open (charts are the expensive part), then
 * stays mounted so closing can animate.
 */
export function ReportCard({
  title,
  children,
  detailLabel,
  detail,
}: {
  title: string;
  children: ReactNode;
  detailLabel: string;
  detail?: () => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  return (
    <section className="card report-card">
      <h3 className="report-card__title">{title}</h3>
      {children}
      {detail && (
        <>
          <div className={`report-card__detail ${open ? 'is-open' : ''}`} inert={!open}>
            <div className="report-card__detail-inner">{mounted && detail()}</div>
          </div>
          <button
            type="button"
            className="report-card__toggle"
            aria-expanded={open}
            onClick={() => {
              setMounted(true);
              setOpen((o) => !o);
            }}
          >
            {open ? 'Hide' : detailLabel}
            <span className={`report-card__chevron ${open ? 'is-open' : ''}`} aria-hidden="true">
              ▾
            </span>
          </button>
        </>
      )}
    </section>
  );
}

// ---- Distribution strip -----------------------------------------------------

/**
 * Every clean tank as a dot on one line from worst to best, so the spread and
 * where most tanks land read at a glance. The newest tank is the only one in
 * the accent color; the white tick is the average.
 */
export function TankStrip({
  tanks,
  avg,
  unit,
  ends,
}: {
  tanks: { mpg: number; date: string }[];
  avg: number;
  unit: string;
  /** Labels under the two ends of the track (worst, best). */
  ends: [ReactNode, ReactNode];
}) {
  if (tanks.length < 2) return null;
  const values = tanks.map((t) => t.mpg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pos = (v: number) => `${((v - min) / span) * 100}%`;
  const latest = tanks[tanks.length - 1];
  return (
    <div className="strip" role="img" aria-label={`${tanks.length} tanks from ${min} to ${max} ${unit}, average ${avg}`}>
      <div className="strip__track">
        {tanks.slice(0, -1).map((t, i) => (
          <span key={i} className="strip__dot" style={{ left: pos(t.mpg) }} />
        ))}
        <span className="strip__avg" style={{ left: pos(avg) }} />
        <span className="strip__dot strip__dot--latest" style={{ left: pos(latest.mpg) }} />
      </div>
      <div className="strip__ends">
        {ends[0]}
        {ends[1]}
      </div>
      <div className="strip__legend">
        <span>
          <i className="key key--dot key--accent" />
          Latest {latest.mpg.toFixed(1)}
        </span>
        <span>
          <i className="key key--tick" />
          Average
        </span>
      </div>
    </div>
  );
}

// ---- Low / high range bar ---------------------------------------------------

/** Where the average and the latest price sit between the period's low and high. */
export function PriceRange({
  low,
  high,
  avg,
  latest,
  ends,
}: {
  low: number;
  high: number;
  avg: number;
  latest: number;
  ends: [ReactNode, ReactNode];
}) {
  const span = high - low || 1;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - low) / span) * 100))}%`;
  return (
    <div className="strip strip--range">
      <div className="strip__track strip__track--range">
        <span className="strip__avg" style={{ left: pos(avg) }} />
        <span className="strip__dot strip__dot--latest" style={{ left: pos(latest) }} />
      </div>
      <div className="strip__ends">
        {ends[0]}
        {ends[1]}
      </div>
      <div className="strip__legend">
        <span>
          <i className="key key--dot key--accent" />
          Latest {rate(latest)}
        </span>
        <span>
          <i className="key key--tick" />
          Average
        </span>
      </div>
    </div>
  );
}

// ---- Fuel vs service split --------------------------------------------------

/** One bar split into fuel and service, as a share of everything spent. */
export function CostSplit({ fuel, service }: { fuel: number; service: number }) {
  const total = fuel + service;
  if (total <= 0) return null;
  const fuelPct = (fuel / total) * 100;
  return (
    <div
      className="split"
      role="img"
      aria-label={`Fuel ${Math.round(fuelPct)}%, service ${Math.round(100 - fuelPct)}% of spending`}
    >
      {fuel > 0 && <span className="split__seg" style={{ flexGrow: fuel, background: CHART.fuel }} />}
      {service > 0 && <span className="split__seg" style={{ flexGrow: service, background: CHART.service }} />}
    </div>
  );
}

// ---- Charts -----------------------------------------------------------------

interface TipRow {
  name: string;
  value: string;
  color?: string;
}

function TipBox({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="chart-tip">
      <div className="chart-tip__title">{title}</div>
      {rows.map((r) => (
        <div key={r.name} className="chart-tip__row">
          <span>
            {r.color && <i className="key key--dot" style={{ background: r.color }} />}
            {r.name}
          </span>
          <strong>{r.value}</strong>
        </div>
      ))}
    </div>
  );
}

const GRID = <CartesianGrid vertical={false} stroke={CHART.grid} />;

const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: -8 };

/** A time-scaled line for one value per fillup (MPG, price). */
export function FillupLineChart({
  data,
  name,
  format,
  axisFormat,
  average,
}: {
  data: { date: string; value: number }[];
  name: string;
  format: (v: number) => string;
  axisFormat: (v: number) => string;
  average?: number | null;
}) {
  const points = data.map((d) => ({ t: new Date(d.date).getTime(), date: d.date, value: d.value }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={points} margin={CHART_MARGIN}>
        {GRID}
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tick={AXIS_TICK}
          tickFormatter={monthTick}
          stroke={CHART.grid}
          minTickGap={24}
        />
        <YAxis tick={AXIS_TICK} domain={['auto', 'auto']} stroke="none" width={44} tickFormatter={axisFormat} />
        {average != null && <ReferenceLine y={average} stroke={CHART.axis} strokeOpacity={0.6} />}
        <Tooltip
          cursor={{ stroke: CHART.axis, strokeOpacity: 0.4 }}
          content={({ active, payload }: TooltipContentProps) => {
            const p = active && payload?.[0]?.payload;
            if (!p) return null;
            return <TipBox title={shortDate(p.date, true)} rows={[{ name, value: format(p.value) }]} />;
          }}
        />
        <Line
          type="linear"
          dataKey="value"
          stroke={CHART.fuel}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          activeDot={{ r: 4, stroke: CHART.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** The top segment of a stack, lifted 2px so a sliver of surface separates it from the one below. */
function GappedTop(props: BarShapeProps) {
  const { height = 0, y = 0 } = props;
  if (height <= 2) return null;
  return <Rectangle {...props} y={y} height={height - 2} radius={[4, 4, 0, 0]} />;
}

/** Fuel and service spending per month (or quarter/year), stacked. */
export function SpendChart({
  rows,
  label,
}: {
  rows: { key: string; fuel: number; service: number }[];
  label: (key: string) => string;
}) {
  return (
    <>
      <div className="chart-legend">
        <span>
          <i className="key key--dot" style={{ background: CHART.fuel }} />
          Fuel
        </span>
        <span>
          <i className="key key--dot" style={{ background: CHART.service }} />
          Service
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows} margin={CHART_MARGIN}>
          {GRID}
          <XAxis dataKey="key" tick={AXIS_TICK} tickFormatter={label} stroke={CHART.grid} minTickGap={12} />
          <YAxis
            tick={AXIS_TICK}
            stroke="none"
            width={44}
            tickFormatter={(v: number) => (v >= 1000 ? `$${Math.round(v / 100) / 10}k` : `$${v}`)}
          />
          <Tooltip
            cursor={{ fill: CHART.grid, fillOpacity: 0.6 }}
            content={({ active, payload }: TooltipContentProps) => {
              const p = active && payload?.[0]?.payload;
              if (!p) return null;
              return (
                <TipBox
                  title={label(p.key)}
                  rows={[
                    { name: 'Fuel', value: money(p.fuel), color: CHART.fuel },
                    { name: 'Service', value: money(p.service), color: CHART.service },
                    { name: 'Total', value: money(p.fuel + p.service) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="fuel" stackId="spend" fill={CHART.fuel} maxBarSize={24} isAnimationActive={false} />
          <Bar
            dataKey="service"
            stackId="spend"
            fill={CHART.service}
            maxBarSize={24}
            shape={GappedTop}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

/** Distance driven per month (or quarter/year). */
export function MilesChart({
  rows,
  label,
  unit,
}: {
  rows: { key: string; miles: number }[];
  label: (key: string) => string;
  unit: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={rows} margin={CHART_MARGIN}>
        {GRID}
        <XAxis dataKey="key" tick={AXIS_TICK} tickFormatter={label} stroke={CHART.grid} minTickGap={12} />
        <YAxis
          tick={AXIS_TICK}
          stroke="none"
          width={44}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
        />
        <Tooltip
          cursor={{ fill: CHART.grid, fillOpacity: 0.6 }}
          content={({ active, payload }: TooltipContentProps) => {
            const p = active && payload?.[0]?.payload;
            if (!p) return null;
            return <TipBox title={label(p.key)} rows={[{ name: 'Driven', value: `${p.miles.toLocaleString()} ${unit}` }]} />;
          }}
        />
        <Bar dataKey="miles" fill={CHART.fuel} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
