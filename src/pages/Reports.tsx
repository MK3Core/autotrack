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
import { computeLifetimeVehicleStats, computeMpgSeries } from '../lib/calc';
import type { Fillup } from '../types';
import './Reports.css';

function formatDateTick(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

function formatDateLabel(label: unknown) {
  return new Date(Number(label)).toLocaleDateString();
}

export default function Reports() {
  const { selectedVehicleId, selectedVehicle } = useVehicles();
  const fillups = useLiveQuery<Fillup[], Fillup[]>(
    () =>
      selectedVehicleId
        ? db.fillups.where('vehicleId').equals(selectedVehicleId).toArray()
        : Promise.resolve([]),
    [selectedVehicleId],
    [],
  );

  const withMpg = computeMpgSeries(fillups).sort(
    (a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer,
  );

  const mpgData = withMpg
    .filter((f) => f.mpg !== null)
    .map((f) => ({ date: new Date(f.date).getTime(), mpg: f.mpg as number }));

  const priceData = withMpg
    .filter((f) => f.pricePerGallon !== undefined)
    .map((f) => ({ date: new Date(f.date).getTime(), price: f.pricePerGallon as number }));

  const odometerData = withMpg.map((f) => ({ date: new Date(f.date).getTime(), odometer: f.odometer }));

  const stats = computeLifetimeVehicleStats(fillups);

  return (
    <div>
      <h2>Reports</h2>

      <div className="card reports__stats-card">
        <h3>Lifetime Vehicle Stats{selectedVehicle ? ` · ${selectedVehicle.name}` : ''}</h3>
        <div className="reports__stats-grid">
          <div className="stat">
            <span className="stat__value">{stats.avgMpg ?? 'N/A'}</span>
            <span className="stat__label">Avg MPG</span>
          </div>
          <div className="stat">
            <span className="stat__value">{stats.meanMpg ?? 'N/A'}</span>
            <span
              className="stat__label"
              title="Each fillup's mpg is truncated to a whole number before averaging"
            >
              Mean MPG
            </span>
          </div>
          <div className="stat">
            <span className="stat__value">{stats.bestMpg ?? 'N/A'}</span>
            <span className="stat__label">Best Tank</span>
          </div>
          <div className="stat">
            <span className="stat__value">{stats.worstMpg ?? 'N/A'}</span>
            <span className="stat__label">Worst Tank</span>
          </div>
          <div className="stat">
            <span className="stat__value">{stats.totalCost !== null ? `$${stats.totalCost.toFixed(2)}` : 'N/A'}</span>
            <span className="stat__label">Total Fuel Cost</span>
          </div>
          <div className="stat">
            <span className="stat__value">
              {stats.totalGallons !== null ? stats.totalGallons.toFixed(1) : 'N/A'}
            </span>
            <span className="stat__label">Total Gallons</span>
          </div>
          <div className="stat">
            <span className="stat__value">
              {stats.totalMiles !== null ? stats.totalMiles.toLocaleString() : 'N/A'}
            </span>
            <span className="stat__label">Miles Tracked</span>
          </div>
          <div className="stat">
            <span className="stat__value">
              {stats.costPerMile !== null ? `$${stats.costPerMile.toFixed(3)}` : 'N/A'}
            </span>
            <span className="stat__label">Cost / Mile</span>
          </div>
          <div className="stat">
            <span className="stat__value">
              {stats.avgPricePerGallon !== null ? `$${stats.avgPricePerGallon.toFixed(3)}` : 'N/A'}
            </span>
            <span className="stat__label">Avg Price / Gallon</span>
          </div>
          <div className="stat">
            <span className="stat__value">{stats.fillupCount}</span>
            <span className="stat__label">Fillups Logged</span>
          </div>
          <div className="stat">
            <span className="stat__value">
              {stats.avgDaysBetweenFillups !== null ? stats.avgDaysBetweenFillups : 'N/A'}
            </span>
            <span className="stat__label">Avg Days Between Fillups</span>
          </div>
        </div>
        {stats.excludedOutliers > 0 && (
          <p className="reports__outlier-note">
            {stats.excludedOutliers} fillup{stats.excludedOutliers === 1 ? '' : 's'} excluded from the mpg
            figures above as outliers (see the "check mileage" flags in the Log). These are likely missed
            fillups that were never marked.
          </p>
        )}
      </div>

      <div className="card reports__chart-card">
        <h3>Fuel Efficiency Over Time (mpg){selectedVehicle ? ` · ${selectedVehicle.name}` : ''}</h3>
        {mpgData.length < 2 ? (
          <p className="reports__empty">Not enough complete fillup data yet to chart mileage.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={mpgData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
              <XAxis
                dataKey="date"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 11, fill: '#9aa1b0' }}
                tickFormatter={formatDateTick}
              />
              <YAxis tick={{ fontSize: 11, fill: '#9aa1b0' }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: '#171a21', border: '1px solid #2a2f3a' }}
                labelFormatter={formatDateLabel}
              />
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
              <XAxis
                dataKey="date"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 11, fill: '#9aa1b0' }}
                tickFormatter={formatDateTick}
              />
              <YAxis tick={{ fontSize: 11, fill: '#9aa1b0' }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: '#171a21', border: '1px solid #2a2f3a' }}
                labelFormatter={formatDateLabel}
              />
              <Line type="monotone" dataKey="price" stroke="#4caf7d" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card reports__chart-card">
        <h3>Odometer Over Time{selectedVehicle ? ` · ${selectedVehicle.name}` : ''}</h3>
        {odometerData.length < 2 ? (
          <p className="reports__empty">Not enough fillup data yet to chart mileage.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={odometerData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
              <XAxis
                dataKey="date"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 11, fill: '#9aa1b0' }}
                tickFormatter={formatDateTick}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9aa1b0' }}
                domain={['auto', 'auto']}
                tickFormatter={(v: number) => v.toLocaleString()}
              />
              <Tooltip
                contentStyle={{ background: '#171a21', border: '1px solid #2a2f3a' }}
                labelFormatter={formatDateLabel}
                formatter={(v) => Number(v).toLocaleString()}
              />
              <Line type="monotone" dataKey="odometer" stroke="#9085e9" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
