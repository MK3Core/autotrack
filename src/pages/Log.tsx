import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useVehicles } from '../lib/VehicleContext';
import { computeLifetimeMpgStats, computeMpgSeries } from '../lib/calc';
import { useInfiniteScroll } from '../lib/useInfiniteScroll';
import type { Fillup, FillupWithMpg } from '../types';
import './Log.css';

const PAGE_SIZE = 20;

function monthLabel(dateStr: string) {
  const [y, m] = dateStr.split('-');
  if (!y || !m) return dateStr;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

type TimelineRow =
  | { type: 'month'; key: string; label: string }
  | { type: 'fillup'; key: string; fillup: FillupWithMpg }
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
  const { vehicles, selectedVehicleId, selectedVehicle } = useVehicles();
  const fillups = useLiveQuery<Fillup[], Fillup[]>(
    () =>
      selectedVehicleId
        ? db.fillups.where('vehicleId').equals(selectedVehicleId).toArray()
        : Promise.resolve([]),
    [selectedVehicleId],
    [],
  );

  const timeline = computeMpgSeries(fillups).sort(
    (a, b) => b.date.localeCompare(a.date) || b.odometer - a.odometer,
  );
  const lifetimeStats = computeLifetimeMpgStats(fillups);

  const { visibleItems, sentinelRef, hasMore, loadMore } = useInfiniteScroll(
    timeline,
    PAGE_SIZE,
    selectedVehicleId,
  );

  const rows: TimelineRow[] = [];
  let lastMonth = '';
  for (const f of visibleItems) {
    const month = monthLabel(f.date);
    if (month !== lastMonth) {
      rows.push({ type: 'month', key: `month-${f.id}`, label: month });
      lastMonth = month;
    }
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
      {timeline.length === 0 && <p>No fillups logged yet.</p>}

      <div className="timeline">
        <div className="timeline__row">
          <div className="timeline__dot timeline__dot--add" />
          <Link to="/add" className="timeline__card timeline__card--add card">
            <div className="timeline__card-top">
              <strong>Add Fillup</strong>
              <span className="timeline__add-icon">+</span>
            </div>
            <div className="timeline__card-meta">
              <span>Log a new fillup for {selectedVehicle?.name ?? 'this vehicle'}</span>
            </div>
          </Link>
        </div>

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
                    <span className="ghost-card__label">
                      Fillup missing here. Mileage calc resets before this entry.
                    </span>
                  ) : (
                    <>
                      <span className="ghost-card__label">
                        {f.mpg} mpg here is way off this vehicle's typical{' '}
                        {lifetimeStats.meanWholeMpg ?? 'N/A'} mpg. Was a fillup missed before this one?
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

          const f = row.fillup;
          return (
            <div key={row.key} className="timeline__row">
              <div className="timeline__dot" />
              <Link to={`/fillup/${f.id}`} className="timeline__card card">
                <div className="timeline__card-top">
                  <strong>{f.odometer.toLocaleString()} mi</strong>
                  <span className="timeline__card-date">{f.date}</span>
                </div>
                <div className="timeline__card-meta">
                  <span>{f.gasType}</span>
                  {f.pricePerGallon !== undefined && <span>${f.pricePerGallon.toFixed(3)}/gal</span>}
                  {f.gallons !== undefined && <span>{f.gallons.toFixed(2)} gal</span>}
                  {f.totalCost !== undefined && <span>${f.totalCost.toFixed(2)}</span>}
                  {f.mpg !== null && (
                    <span className={`timeline__mpg timeline__mpg--${f.mpgTier ?? 'average'}`}>
                      {f.mpg} mpg
                    </span>
                  )}
                  {!f.fullTank && <span className="badge">partial</span>}
                </div>
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
