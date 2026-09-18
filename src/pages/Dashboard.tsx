import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useVehicles } from '../lib/VehicleContext';
import { computeLifetimeMpgStats, computeMpgSeries } from '../lib/calc';
import type { Fillup } from '../types';
import './Dashboard.css';

export default function Dashboard() {
  const { vehicles, selectedVehicleId, selectedVehicle } = useVehicles();

  const fillups = useLiveQuery<Fillup[], Fillup[]>(
    () =>
      selectedVehicleId
        ? db.fillups.where('vehicleId').equals(selectedVehicleId).toArray()
        : Promise.resolve([]),
    [selectedVehicleId],
    [],
  );

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

  const withMpg = computeMpgSeries(fillups).sort((a, b) => b.odometer - a.odometer);
  const latest = withMpg[0];
  const lifetimeStats = computeLifetimeMpgStats(fillups);
  const lastPrice = withMpg.find((f) => f.pricePerGallon !== undefined)?.pricePerGallon;

  return (
    <div>
      <h2>{selectedVehicle?.name ?? 'Dashboard'}</h2>

      <div className="dashboard__stats card">
        <div className="stat">
          <span className="stat__value">{latest?.mpg ?? 'N/A'}</span>
          <span className="stat__label">Latest MPG</span>
        </div>
        <div className="stat">
          <span className="stat__value">{lifetimeStats.average ?? 'N/A'}</span>
          <span className="stat__label">Lifetime Avg MPG</span>
        </div>
        <div className="stat">
          <span className="stat__value">{lastPrice !== undefined ? `$${lastPrice.toFixed(2)}` : 'N/A'}</span>
          <span className="stat__label">Last Price/gal</span>
        </div>
        <div className="stat">
          <span className="stat__value">{latest ? latest.odometer.toLocaleString() : 'N/A'}</span>
          <span className="stat__label">Odometer</span>
        </div>
      </div>

      <Link to="/add" className="btn-primary dashboard__add-btn" style={{ textDecoration: 'none' }}>
        + Log a Fillup
      </Link>

      <h3 className="dashboard__recent-title">Recent Fillups</h3>
      {withMpg.length === 0 && <p>No fillups logged yet for this vehicle.</p>}
      <ul className="dashboard__recent-list">
        {withMpg.slice(0, 5).map((f) => (
          <li key={f.id}>
            <Link to={`/fillup/${f.id}`} className="dashboard__recent-item card">
              <div>
                <strong>{f.date}</strong> · {f.odometer.toLocaleString()} mi
                {f.missedFillup && <span className="badge badge--warn"> missed gap</span>}
                {!f.fullTank && <span className="badge"> partial</span>}
                {f.mpgOutlier && !f.missedFillup && (
                  <span
                    className="badge badge--warn"
                    title="This mpg is way outside this vehicle's usual range. Check for a missed fillup."
                  >
                    {' '}
                    check mileage
                  </span>
                )}
              </div>
              <div className="dashboard__recent-meta">
                {f.gallons !== undefined && <span>{f.gallons.toFixed(2)} gal</span>}
                {f.totalCost !== undefined && <span>${f.totalCost.toFixed(2)}</span>}
                {f.mpg !== null && <span>{f.mpg} mpg</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
