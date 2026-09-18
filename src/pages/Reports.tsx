import { useLiveQuery } from 'dexie-react-hooks';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db } from '../db';
import { useVehicles } from '../lib/VehicleContext';
import { computeLifetimeMpgStats, computeMpgSeries } from '../lib/calc';
import type { Fillup } from '../types';
import './Reports.css';

export default function Reports() {
  const { vehicles, selectedVehicleId, selectVehicle, selectedVehicle } = useVehicles();
  const fillups = useLiveQuery<Fillup[], Fillup[]>(
    () =>
      selectedVehicleId
        ? db.fillups.where('vehicleId').equals(selectedVehicleId).toArray()
        : Promise.resolve([]),
    [selectedVehicleId],
    [],
  );
  const allFillups = useLiveQuery<Fillup[], Fillup[]>(() => db.fillups.toArray(), [], []);

  const withMpg = computeMpgSeries(fillups).sort(
    (a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer,
  );

  const mpgData = withMpg
    .filter((f) => f.mpg !== null)
    .map((f) => ({ date: f.date, mpg: f.mpg as number }));

  const priceData = withMpg
    .filter((f) => f.pricePerGallon !== undefined)
    .map((f) => ({ date: f.date, price: f.pricePerGallon as number }));

  const lifetimeStats = computeLifetimeMpgStats(fillups);

  const comparison = vehicles
    .map((v) => ({
      vehicle: v,
      stats: computeLifetimeMpgStats(allFillups.filter((f) => f.vehicleId === v.id)),
    }))
    .filter((c) => c.stats.sampleCount > 0)
    .sort((a, b) => (b.stats.average ?? 0) - (a.stats.average ?? 0));

  return (
    <div>
      <h2>Reports</h2>
      <label className="reports__vehicle-select">
        Vehicle
        <select value={selectedVehicleId ?? ''} onChange={(e) => selectVehicle(e.target.value)}>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>

      <div className="card reports__lifetime-card">
        <div className="stat">
          <span className="stat__value">
            {lifetimeStats.average !== null ? lifetimeStats.average : 'N/A'}
          </span>
          <span className="stat__label">Lifetime Avg MPG{selectedVehicle ? ` · ${selectedVehicle.name}` : ''}</span>
        </div>
        <div className="stat">
          <span className="stat__value">{lifetimeStats.median !== null ? lifetimeStats.median : 'N/A'}</span>
          <span className="stat__label">Lifetime Median MPG</span>
        </div>
        <div className="stat">
          <span className="stat__value">{lifetimeStats.sampleCount}</span>
          <span className="stat__label">Fillups Counted</span>
        </div>
      </div>
      {lifetimeStats.excludedOutliers > 0 && (
        <p className="reports__outlier-note">
          {lifetimeStats.excludedOutliers} fillup{lifetimeStats.excludedOutliers === 1 ? '' : 's'} excluded
          from these figures as mpg outliers (see the "check mileage" flags in the Log). These are likely
          missed fillups that were never marked.
        </p>
      )}

      {comparison.length > 1 && (
        <div className="card reports__compare-card">
          <h3>Lifetime MPG by Vehicle</h3>
          <ul className="reports__compare-list">
            {comparison.map(({ vehicle, stats }) => (
              <li
                key={vehicle.id}
                className={vehicle.id === selectedVehicleId ? 'is-selected' : ''}
                onClick={() => selectVehicle(vehicle.id)}
              >
                <span>{vehicle.name}</span>
                <span className="reports__compare-value">{stats.average} mpg</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card reports__chart-card">
        <h3>Fuel Efficiency Over Time (mpg){selectedVehicle ? ` · ${selectedVehicle.name}` : ''}</h3>
        {mpgData.length < 2 ? (
          <p className="reports__empty">Not enough complete fillup data yet to chart mileage.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={mpgData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9aa1b0' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9aa1b0' }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: '#171a21', border: '1px solid #2a2f3a' }} />
              <Line type="monotone" dataKey="mpg" stroke="#4f8cff" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card reports__chart-card">
        <h3>Fuel Price Over Time ($/gal){selectedVehicle ? ` · ${selectedVehicle.name}` : ''}</h3>
        {priceData.length < 2 ? (
          <p className="reports__empty">Not enough price data yet to chart.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={priceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9aa1b0' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9aa1b0' }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: '#171a21', border: '1px solid #2a2f3a' }} />
              <Line type="monotone" dataKey="price" stroke="#4caf7d" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
