import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import CheckEngineIcon from './CheckEngineIcon';
import {
  describeInterval,
  describeReminder,
  isReminderDue,
  latestOdometer,
  scheduleStatus,
} from '../lib/maintenance';
import type { Fillup, MaintenanceRecord, ServiceSchedule } from '../types';
import './VehicleServices.css';

/** One vehicle's repeating services and where each stands. */
export default function VehicleServices({ vehicleId }: { vehicleId: string }) {
  const data = useLiveQuery(async () => {
    const [schedules, records, fillups] = await Promise.all([
      db.schedules.where('vehicleId').equals(vehicleId).toArray() as Promise<ServiceSchedule[]>,
      db.maintenance.where('vehicleId').equals(vehicleId).toArray() as Promise<MaintenanceRecord[]>,
      db.fillups.where('vehicleId').equals(vehicleId).toArray() as Promise<Fillup[]>,
    ]);
    return { schedules, records, fillups };
  }, [vehicleId]);

  if (!data) return null;
  const { schedules, records, fillups } = data;
  const currentOdometer = latestOdometer(fillups, records);

  async function stopRepeating(s: ServiceSchedule) {
    if (!confirm(`Stop repeating "${s.serviceName}"? Past records are kept; reminders will stop.`)) return;
    await db.schedules.delete(s.id);
  }

  return (
    <div className="vehicle-services">
      <h4>Repeating services</h4>
      {schedules.length === 0 && (
        <p className="vehicle-services__empty">
          None yet. Choose Repeat when you add a service and it will be tracked here.
        </p>
      )}
      <ul className="vehicle-services__list">
        {[...schedules]
          .sort((a, b) => a.serviceName.localeCompare(b.serviceName))
          .map((s) => {
            const status = scheduleStatus(s, records, currentOdometer);
            const due = status !== null && isReminderDue(status);
            return (
              <li key={s.id} className={`vehicle-services__item ${due ? 'is-due' : ''}`}>
                <div className="vehicle-services__info">
                  <strong>{s.serviceName}</strong>
                  <span className="vehicle-services__meta">{describeInterval(s)}</span>
                  {status ? (
                    <>
                      <span className="vehicle-services__meta">
                        Last done {status.last.date} at {status.last.odometer.toLocaleString()} mi
                      </span>
                      <span className="vehicle-services__meta">
                        Next:{' '}
                        {[
                          status.dueOdometer !== undefined ? `${status.dueOdometer.toLocaleString()} mi` : null,
                          status.dueDate ?? null,
                        ]
                          .filter(Boolean)
                          .join(' or ')}
                      </span>
                      {due && (
                        <span className="vehicle-services__due">
                          <CheckEngineIcon className="vehicle-services__icon" />
                          {describeReminder(status)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="vehicle-services__meta">Not done yet</span>
                  )}
                </div>
                <div className="vehicle-services__actions">
                  <Link to={`/service/new?schedule=${s.id}`} className="vehicle-services__log">
                    Log it
                  </Link>
                  <button className="btn-danger" onClick={() => stopRepeating(s)}>
                    Stop
                  </button>
                </div>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
