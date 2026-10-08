import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import CheckEngineIcon from './CheckEngineIcon';
import {
  describeDueIn,
  describeInterval,
  isReminderDue,
  latestOdometer,
  scheduleStatus,
} from '../lib/maintenance';
import { unitsFor } from '../lib/units';
import type { Fillup, MaintenanceRecord, ServiceSchedule, Vehicle } from '../types';
import './ServiceReminders.css';

function shortDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Splits "2,340 mi left" into the figure and its status word, so the figure can
 * read boldly and the word quietly. "due now" / "due today" stay whole.
 */
function splitDuePart(part: string): { figure: string; status: string | null } {
  const match = part.match(/^(.*) (left|overdue)$/);
  return match ? { figure: match[1], status: match[2] } : { figure: part, status: null };
}

/** One vehicle's service reminders and where each stands. */
export default function ServiceReminders({ vehicle }: { vehicle: Vehicle }) {
  const vehicleId = vehicle.id;
  const { dist } = unitsFor(vehicle);
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
    if (!confirm(`Stop repeating "${s.serviceName}"? Past records stay.`)) return;
    await db.schedules.delete(s.id);
  }

  return (
    <div className="service-reminders">
      <h4>Service Reminders</h4>
      {schedules.length === 0 && (
        <p className="service-reminders__empty">
          None. Set Repeat on a service.
        </p>
      )}
      <ul className="service-reminders__list">
        {[...schedules]
          .sort((a, b) => a.serviceName.localeCompare(b.serviceName))
          .map((s) => {
            const status = scheduleStatus(s, records, currentOdometer);
            const due = status !== null && isReminderDue(status);
            return (
              <li key={s.id} className={`service-reminders__item ${due ? 'is-due' : ''}`}>
                <div className="service-reminders__info">
                  <strong>{s.serviceName}</strong>
                  {status && describeDueIn(status, dist).length > 0 && (
                    <span className={`service-reminders__due ${due ? 'is-due' : ''}`}>
                      {due && <CheckEngineIcon className="service-reminders__icon" />}
                      {describeDueIn(status, dist).map((part) => {
                        const { figure, status: word } = splitDuePart(part);
                        return (
                          <span key={part} className="service-reminders__due-part">
                            <span className="service-reminders__figure">{figure}</span>
                            {word && <span className="service-reminders__word"> {word}</span>}
                          </span>
                        );
                      })}
                    </span>
                  )}
                  <span className="service-reminders__meta">{describeInterval(s, dist)}</span>
                  <span className="service-reminders__meta">
                    {status
                      ? `Last done ${shortDate(status.last.date)} at ${status.last.odometer.toLocaleString()} ${dist}`
                      : 'Not done yet'}
                  </span>
                </div>
                <div className="service-reminders__actions">
                  <Link to={`/service/new?schedule=${s.id}`} className="service-reminders__log">
                    Log it
                  </Link>
                  <button type="button" className="btn-danger service-reminders__stop" onClick={() => stopRepeating(s)}>
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
