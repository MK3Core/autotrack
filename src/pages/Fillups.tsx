import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useVehicles } from '../lib/VehicleContext';
import { computeMpgSeries } from '../lib/calc';
import type { Fillup } from '../types';
import './Fillups.css';

export default function Fillups() {
  const { selectedVehicleId, selectedVehicle } = useVehicles();
  const fillups = useLiveQuery<Fillup[], Fillup[]>(
    () =>
      selectedVehicleId
        ? db.fillups.where('vehicleId').equals(selectedVehicleId).toArray()
        : Promise.resolve([]),
    [selectedVehicleId],
    [],
  );

  const withMpg = computeMpgSeries(fillups).sort((a, b) => b.odometer - a.odometer);

  return (
    <div>
      <h2>Fillup Log{selectedVehicle ? ` — ${selectedVehicle.name}` : ''}</h2>
      {withMpg.length === 0 && <p>No fillups logged yet.</p>}
      <div className="fillups-table-wrap">
        <table className="fillups-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Odometer</th>
              <th>Gas</th>
              <th>Price/gal</th>
              <th>Gallons</th>
              <th>Total</th>
              <th>MPG</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {withMpg.map((f) => (
              <tr key={f.id}>
                <td>{f.date}</td>
                <td>{f.odometer.toLocaleString()}</td>
                <td>
                  {f.gasType}
                  {!f.fullTank && <span className="badge">partial</span>}
                  {f.missedFillup && <span className="badge badge--warn">gap</span>}
                </td>
                <td>{f.pricePerGallon !== undefined ? `$${f.pricePerGallon.toFixed(3)}` : '—'}</td>
                <td>{f.gallons !== undefined ? f.gallons.toFixed(2) : '—'}</td>
                <td>{f.totalCost !== undefined ? `$${f.totalCost.toFixed(2)}` : '—'}</td>
                <td>{f.mpg ?? '—'}</td>
                <td>
                  <Link to={`/fillup/${f.id}`}>Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
