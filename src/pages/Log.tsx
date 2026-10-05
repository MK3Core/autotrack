import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import CheckEngineIcon from '../components/CheckEngineIcon';
import { useVehicles } from '../lib/VehicleContext';
import { computeLifetimeMpgStats, computeMpgSeries } from '../lib/calc';
import { useInfiniteScroll } from '../lib/useInfiniteScroll';
import { computeReminders, describeReminder, latestOdometer } from '../lib/maintenance';
import type { Fillup, FillupWithMpg, MaintenanceRecord, ServiceSchedule } from '../types';
import './Log.css';

const PAGE_SIZE = 20;
/** Must cover the longest closing animation in Log.css (plus its stagger). */
const ENTRY_CLOSE_MS = 480;

/** "Oct 3": the month header above already gives the month and year. */
function dayLabel(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function monthLabel(dateStr: string) {
  const [y, m] = dateStr.split('-');
  if (!y || !m) return dateStr;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

type TimelineEntry =
  | { kind: 'fillup'; date: string; odometer: number; fillup: FillupWithMpg }
  | { kind: 'service'; date: string; odometer: number; record: MaintenanceRecord };

type TimelineRow =
  | { type: 'month'; key: string; label: string }
  | { type: 'fillup'; key: string; fillup: FillupWithMpg }
  | { type: 'service'; key: string; record: MaintenanceRecord }
  | { type: 'ghost'; key: string; fillup: FillupWithMpg; mode: 'confirmed' | 'suggested' };

async function confirmMissed(fillupId: string) {
  const f = await db.fillups.get(fillupId);
  if (!f) return;
  await db.fillups.put({ ...f, missedFillup: true });
}

async function dismissOutlier(fillupId: string) {
  const f = await db.fillups.get(fillupId);
  if (!f) return;
  await db.fillups.put({ ...f, outlierAcknowledged: true });
}

export default function Log() {
  const { vehicles, selectedVehicleId } = useVehicles();
  // 'closing' keeps the options mounted while they roll back up.
  const [entryState, setEntryState] = useState<'closed' | 'open' | 'closing'>('closed');
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const choosingEntry = entryState === 'open';

  function openEntry() {
    clearTimeout(closeTimer.current);
    setEntryState('open');
  }

  function closeEntry() {
    if (entryState !== 'open') return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setEntryState('closed');
      return;
    }
    setEntryState('closing');
    closeTimer.current = setTimeout(() => setEntryState('closed'), ENTRY_CLOSE_MS);
  }

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // Tapping anywhere except the New Entry card or its options rolls them back up.
  useEffect(() => {
    if (entryState !== 'open') return;
    function onPointerDown(e: PointerEvent) {
      if (e.target instanceof Element && e.target.closest('[data-entry-keep]')) return;
      closeEntry();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryState]);
  const fillups = useLiveQuery<Fillup[], Fillup[]>(
    () =>
      selectedVehicleId
        ? db.fillups.where('vehicleId').equals(selectedVehicleId).toArray()
        : Promise.resolve([]),
    [selectedVehicleId],
    [],
  );

  const records = useLiveQuery<MaintenanceRecord[], MaintenanceRecord[]>(
    () =>
      selectedVehicleId
        ? db.maintenance.where('vehicleId').equals(selectedVehicleId).toArray()
        : Promise.resolve([]),
    [selectedVehicleId],
    [],
  );
  const schedules = useLiveQuery<ServiceSchedule[], ServiceSchedule[]>(
    () =>
      selectedVehicleId
        ? db.schedules.where('vehicleId').equals(selectedVehicleId).toArray()
        : Promise.resolve([]),
    [selectedVehicleId],
    [],
  );
  const reminders = computeReminders(schedules, records, latestOdometer(fillups, records));

  const timeline: TimelineEntry[] = [
    ...computeMpgSeries(fillups).map((fillup): TimelineEntry => ({
      kind: 'fillup',
      date: fillup.date,
      odometer: fillup.odometer,
      fillup,
    })),
    ...records.map((record): TimelineEntry => ({
      kind: 'service',
      date: record.date,
      odometer: record.odometer,
      record,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.odometer - a.odometer);
  const lifetimeStats = computeLifetimeMpgStats(fillups);

  const { visibleItems, sentinelRef, hasMore, loadMore } = useInfiniteScroll(
    timeline,
    PAGE_SIZE,
    selectedVehicleId,
  );

  const rows: TimelineRow[] = [];
  let lastMonth = '';
  for (const entry of visibleItems) {
    const id = entry.kind === 'fillup' ? entry.fillup.id : entry.record.id;
    const month = monthLabel(entry.date);
    if (month !== lastMonth) {
      rows.push({ type: 'month', key: `month-${id}`, label: month });
      lastMonth = month;
    }
    if (entry.kind === 'service') {
      rows.push({ type: 'service', key: id, record: entry.record });
      continue;
    }
    const f = entry.fillup;
    rows.push({ type: 'fillup', key: f.id, fillup: f });
    if (f.missedFillup) {
      rows.push({ type: 'ghost', key: `${f.id}-ghost`, fillup: f, mode: 'confirmed' });
    } else if (f.mpgOutlier && !f.outlierAcknowledged) {
      rows.push({ type: 'ghost', key: `${f.id}-ghost`, fillup: f, mode: 'suggested' });
    }
  }

  if (!vehicles.length) {
    return (
      <div className="card">
        <h2>Welcome to AutoTrack</h2>
        <p>Add your first vehicle to start logging fillups.</p>
        <Link to="/vehicles" className="btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>
          Add a Vehicle
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2>Log</h2>
      {timeline.length === 0 && <p>No fillups or services logged yet.</p>}

      <div className="timeline">
        <div className="timeline__row">
          <div className="timeline__dot timeline__dot--add" />
          <button
            type="button"
            className="timeline__card timeline__card--add card entry-toggle"
            data-entry-keep
            onClick={() => (choosingEntry ? closeEntry() : openEntry())}
            aria-expanded={choosingEntry}
          >
            <div className="timeline__card-top">
              <strong>New Entry</strong>
              <span className="timeline__add-icon">{choosingEntry ? '\u00d7' : '+'}</span>
            </div>
          </button>
        </div>

        {entryState !== 'closed' && (
          <div className={`entry-fan ${entryState === 'closing' ? 'is-closing' : ''}`}>
            <div className="entry-fan__inner">
              <div className="timeline__row entry-fan__row entry-fan__row--first">
                <div className="timeline__dot" />
                <Link to="/add" className="timeline__card card" data-entry-keep>
                  <div className="timeline__card-top">
                    <strong>
                      <span className="timeline__kind" aria-hidden="true">
                        ⛽
                      </span>
                      Add Fillup
                    </strong>
                    <span className="timeline__add-icon">+</span>
                  </div>
                  <div className="timeline__card-meta">
                    <span>Log fuel, cost and mileage</span>
                  </div>
                </Link>
              </div>
              <div className="timeline__row entry-fan__row entry-fan__row--second">
                <div className="timeline__dot timeline__dot--service" />
                <Link to="/service/new" className="timeline__card timeline__card--service card" data-entry-keep>
                  <div className="timeline__card-top">
                    <strong>
                      <span className="timeline__kind" aria-hidden="true">
                        🔧
                      </span>
                      Add Service
                    </strong>
                    <span className="timeline__add-icon timeline__add-icon--service">+</span>
                  </div>
                  <div className="timeline__card-meta">
                    <span>Log maintenance, repairs or repeating services</span>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        )}

        {reminders.map((r) => (
          <div key={r.schedule.id} className="timeline__row">
            <div className="timeline__dot timeline__dot--reminder" />
            <Link
              to={`/service/new?schedule=${r.schedule.id}`}
              className="timeline__card timeline__card--reminder card"
            >
              <div className="timeline__card-top">
                <strong className="timeline__reminder-title">
                  <CheckEngineIcon className="timeline__reminder-icon" />
                  {r.schedule.serviceName}
                </strong>
                <span className="timeline__reminder-badge">Service due</span>
              </div>
              <div className="timeline__card-meta">
                <span>{describeReminder(r)}</span>
              </div>
            </Link>
          </div>
        ))}

        {rows.map((row) => {
          if (row.type === 'month') {
            return (
              <div key={row.key} className="timeline__month">
                {row.label}
              </div>
            );
          }

          if (row.type === 'ghost') {
            const f = row.fillup;
            return (
              <div key={row.key} className="timeline__row timeline__row--ghost">
                <div className="timeline__dot timeline__dot--ghost" />
                <div className={`ghost-card ${row.mode === 'confirmed' ? 'ghost-card--static' : ''}`}>
                  {row.mode === 'confirmed' ? (
                    <>
                      <strong className="ghost-card__title">Missed fillup</strong>
                      <span className="ghost-card__label">MPG restarts after this gap</span>
                    </>
                  ) : (
                    <>
                      <strong className="ghost-card__title">Missed a fillup?</strong>
                      <span className="ghost-card__label">
                        {f.mpg} mpg vs. the usual {lifetimeStats.meanWholeMpg ?? 'N/A'} mpg
                      </span>
                      <div className="ghost-card__actions">
                        <button className="btn-primary" onClick={() => confirmMissed(f.id)}>
                          Yes, missed
                        </button>
                        <button onClick={() => dismissOutlier(f.id)}>No, accurate</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          }

          if (row.type === 'service') {
            const r = row.record;
            return (
              <div key={row.key} className="timeline__row">
                <div className="timeline__dot timeline__dot--service" />
                <Link
                  to={`/service/${r.id}`}
                  className="timeline__card timeline__card--service timeline__entry card"
                >
                  <span className="timeline__entry-odometer">{r.odometer.toLocaleString()} mi</span>
                  <span className="timeline__entry-headline timeline__service-names">
                    <span className="timeline__service-first">{r.services[0]?.name ?? 'Service'}</span>
                    {r.services.length > 1 && (
                      <span className="timeline__service-more">+{r.services.length - 1}</span>
                    )}
                  </span>
                  <span className="timeline__entry-sub">{dayLabel(r.date)}</span>
                  <span className="timeline__entry-sub timeline__entry-price">
                    {r.totalCost !== undefined ? `$${r.totalCost.toFixed(2)}` : ''}
                  </span>
                </Link>
              </div>
            );
          }

          const f = row.fillup;
          return (
            <div key={row.key} className="timeline__row">
              <div className="timeline__dot" />
              <Link
                to={`/fillup/${f.id}`}
                className="timeline__card timeline__entry card"
              >
                <span className="timeline__entry-odometer">{f.odometer.toLocaleString()} mi</span>
                {f.mpg !== null ? (
                  <span className={`timeline__entry-headline timeline__mpg--${f.mpgTier ?? 'average'}`}>
                    {f.mpg} <span className="timeline__entry-unit">mpg</span>
                  </span>
                ) : (
                  <span className="timeline__entry-headline timeline__entry-headline--muted">
                    {f.fullTank ? '' : 'Partial'}
                  </span>
                )}
                <span className="timeline__entry-sub">{dayLabel(f.date)}</span>
                <span className="timeline__entry-sub timeline__entry-price">
                  {f.totalCost !== undefined ? `$${f.totalCost.toFixed(2)}` : ''}
                </span>
              </Link>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div ref={sentinelRef} className="timeline__sentinel">
          <button onClick={loadMore}>Load more</button>
        </div>
      )}
      {!hasMore && timeline.length > PAGE_SIZE && (
        <p className="timeline__end">Beginning of history</p>
      )}
    </div>
  );
}
