import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import BackButton from '../components/BackButton';
import { useVehicles } from '../lib/VehicleContext';
import {
  latestOdometer,
  saveMaintenanceRecord,
  serviceKey,
  todayString,
  type ScheduleChoice,
} from '../lib/maintenance';
import type { Fillup, MaintenanceRecord, ServiceSchedule } from '../types';
import './ServiceForm.css';

const NEW_TYPE = '__new__';

interface Line {
  key: string;
  /** A known service name, or NEW_TYPE when `newName` holds a not-yet-recorded one. */
  type: string;
  newName: string;
  cost: string;
  repeat: boolean;
  miles: string;
  months: string;
}

function blankLine(): Line {
  return { key: uuidv4(), type: '', newName: '', cost: '', repeat: false, miles: '', months: '' };
}

function lineName(l: Line): string {
  return (l.type === NEW_TYPE ? l.newName : l.type).trim();
}

function parseMoney(s: string): number | undefined {
  const n = parseFloat(s);
  return s.trim() === '' || !isFinite(n) ? undefined : n;
}

function lineFromSchedule(name: string, schedule: ServiceSchedule | undefined, base: Line = blankLine()): Line {
  return {
    ...base,
    type: name,
    newName: '',
    repeat: !!schedule,
    miles: schedule?.intervalMiles ? String(schedule.intervalMiles) : '',
    months: schedule?.intervalMonths ? String(schedule.intervalMonths) : '',
  };
}

export default function ServiceForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const reminderScheduleId = params.get('schedule');
  const navigate = useNavigate();
  const { vehicles, selectedVehicleId } = useVehicles();

  const existing = useLiveQuery(() => (id ? db.maintenance.get(id) : undefined), [id]);
  const reminderSchedule = useLiveQuery(
    () => (reminderScheduleId ? db.schedules.get(reminderScheduleId) : undefined),
    [reminderScheduleId],
  );

  const [vehicleId, setVehicleId] = useState(selectedVehicleId ?? '');
  const [date, setDate] = useState(todayString());
  const [odometer, setOdometer] = useState('');
  const [location, setLocation] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine()]);

  // Every service name ever recorded (any vehicle) feeds the type dropdown.
  const knownTypes =
    useLiveQuery(async () => {
      const [records, schedules] = await Promise.all([db.maintenance.toArray(), db.schedules.toArray()]);
      const byKey = new Map<string, string>();
      for (const name of [
        ...records.flatMap((r) => r.services.map((s) => s.name)),
        ...schedules.map((s) => s.serviceName),
      ]) {
        if (name.trim() && !byKey.has(serviceKey(name))) byKey.set(serviceKey(name), name.trim());
      }
      return [...byKey.values()].sort((a, b) => a.localeCompare(b));
    }, [], [] as string[]) ?? [];

  const vehicleSchedules = useLiveQuery<ServiceSchedule[], ServiceSchedule[]>(
    () => (vehicleId ? db.schedules.where('vehicleId').equals(vehicleId).toArray() : Promise.resolve([])),
    [vehicleId],
    [],
  );
  const scheduleFor = (name: string) => vehicleSchedules.find((s) => serviceKey(s.serviceName) === serviceKey(name));

  const knownOdometer = useLiveQuery(
    async () => {
      if (!vehicleId) return null;
      const [fillups, records] = await Promise.all([
        db.fillups.where('vehicleId').equals(vehicleId).toArray() as Promise<Fillup[]>,
        db.maintenance.where('vehicleId').equals(vehicleId).toArray() as Promise<MaintenanceRecord[]>,
      ]);
      return latestOdometer(fillups, records);
    },
    [vehicleId],
    null,
  );

  // Editing: load the saved record once, with each service's repeat state
  // taken from the schedules currently running for its vehicle.
  const loadedExisting = useRef(false);
  useEffect(() => {
    if (!existing || loadedExisting.current) return;
    (async () => {
      const schedules = await db.schedules.where('vehicleId').equals(existing.vehicleId).toArray();
      loadedExisting.current = true;
      setVehicleId(existing.vehicleId);
      setDate(existing.date);
      setOdometer(String(existing.odometer));
      setLocation(existing.location ?? '');
      setTotalCost(existing.totalCost !== undefined ? String(existing.totalCost) : '');
      setNotes(existing.notes ?? '');
      setLines(
        existing.services.map((svc) => ({
          ...lineFromSchedule(
            svc.name,
            schedules.find((s) => serviceKey(s.serviceName) === serviceKey(svc.name)),
          ),
          cost: svc.cost !== undefined ? String(svc.cost) : '',
        })),
      );
    })();
  }, [existing]);

  // Arriving from a reminder card: that service, today's date, and its
  // repeat interval already selected so a single save keeps it going.
  const appliedReminder = useRef(false);
  useEffect(() => {
    if (id || !reminderSchedule || appliedReminder.current) return;
    appliedReminder.current = true;
    setVehicleId(reminderSchedule.vehicleId);
    setDate(todayString());
    setLines([lineFromSchedule(reminderSchedule.serviceName, reminderSchedule)]);
  }, [id, reminderSchedule]);

  // Odometer starts at the latest reading we know of, as a place to edit from.
  const odometerPrefilled = useRef(false);
  useEffect(() => {
    if (id || odometerPrefilled.current || knownOdometer === null || knownOdometer === undefined) return;
    odometerPrefilled.current = true;
    setOdometer(String(knownOdometer));
  }, [id, knownOdometer]);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function changeType(line: Line, type: string) {
    if (type === NEW_TYPE || type === '') {
      updateLine(line.key, { type, repeat: false });
      return;
    }
    // Picking a service that's already repeating on this vehicle carries its schedule over.
    setLines((prev) => prev.map((l) => (l.key === line.key ? lineFromSchedule(type, scheduleFor(type), l) : l)));
  }

  const itemizedTotal = lines.reduce((sum, l) => sum + (parseMoney(l.cost) ?? 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId) return alert('Select a vehicle first.');
    const odo = parseFloat(odometer);
    if (!isFinite(odo)) return alert('Odometer reading is required.');

    const filled = lines.filter((l) => lineName(l));
    if (!filled.length) return alert('Add at least one service.');

    const choices: ScheduleChoice[] = [];
    for (const l of filled) {
      if (!l.repeat) {
        choices.push({ serviceName: lineName(l), repeat: null });
        continue;
      }
      const intervalMiles = parseFloat(l.miles) > 0 ? parseFloat(l.miles) : undefined;
      const intervalMonths = parseFloat(l.months) > 0 ? Math.round(parseFloat(l.months)) : undefined;
      if (!intervalMiles && !intervalMonths) {
        return alert(`Set a mileage and/or month interval for "${lineName(l)}", or switch it to one-time.`);
      }
      choices.push({ serviceName: lineName(l), repeat: { intervalMiles, intervalMonths } });
    }

    const explicitTotal = parseMoney(totalCost);
    const record: MaintenanceRecord = {
      id: existing?.id ?? uuidv4(),
      vehicleId,
      date,
      odometer: odo,
      location: location.trim() || undefined,
      totalCost: explicitTotal ?? (itemizedTotal > 0 ? Math.round(itemizedTotal * 100) / 100 : undefined),
      services: filled.map((l) => ({ name: lineName(l), cost: parseMoney(l.cost) })),
      notes: notes.trim() || undefined,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    await saveMaintenanceRecord(record, choices);
    navigate('/');
  }

  async function handleDelete() {
    if (!existing) return;
    await db.maintenance.delete(existing.id);
    navigate('/');
  }

  return (
    <div>
      <BackButton fallback="/" />
      <h2>{existing ? 'Edit Service' : 'Add Service'}</h2>
      <form className="service-form card" onSubmit={handleSubmit}>
        <label>
          Vehicle
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
            <option value="" disabled>
              Select a vehicle…
            </option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>

        <div className="service-form__row">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Odometer (mi)
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              required
            />
          </label>
        </div>

        <div className="service-form__lines">
          {lines.map((line, idx) => (
            <fieldset key={line.key} className="service-line">
              <legend>Service {lines.length > 1 ? idx + 1 : ''}</legend>
              <label>
                Type
                <select value={line.type} onChange={(e) => changeType(line, e.target.value)}>
                  <option value="" disabled>
                    Select a service…
                  </option>
                  {knownTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value={NEW_TYPE}>New service type…</option>
                </select>
              </label>
              {line.type === NEW_TYPE && (
                <label>
                  New service type
                  <input
                    value={line.newName}
                    onChange={(e) => updateLine(line.key, { newName: e.target.value })}
                    placeholder="e.g. Oil Change"
                    autoFocus
                  />
                </label>
              )}
              <label>
                Cost for this service ($, optional)
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={line.cost}
                  onChange={(e) => updateLine(line.key, { cost: e.target.value })}
                />
              </label>

              <div className="service-line__repeat" role="group" aria-label="Repeat">
                <button
                  type="button"
                  className={!line.repeat ? 'is-active' : ''}
                  aria-pressed={!line.repeat}
                  onClick={() => updateLine(line.key, { repeat: false })}
                >
                  One-time
                </button>
                <button
                  type="button"
                  className={line.repeat ? 'is-active' : ''}
                  aria-pressed={line.repeat}
                  onClick={() => updateLine(line.key, { repeat: true })}
                >
                  Repeat
                </button>
              </div>
              {line.repeat && (
                <div className="service-line__interval">
                  <label>
                    Every (mi)
                    <input
                      type="number"
                      inputMode="numeric"
                      value={line.miles}
                      onChange={(e) => updateLine(line.key, { miles: e.target.value })}
                      placeholder="5000"
                    />
                  </label>
                  <span className="service-line__or">or</span>
                  <label>
                    Every (months)
                    <input
                      type="number"
                      inputMode="numeric"
                      value={line.months}
                      onChange={(e) => updateLine(line.key, { months: e.target.value })}
                      placeholder="12"
                    />
                  </label>
                  <p className="service-line__hint">Whichever comes first, if you set both.</p>
                </div>
              )}

              {lines.length > 1 && (
                <button
                  type="button"
                  className="service-line__remove"
                  onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                >
                  Remove this service
                </button>
              )}
            </fieldset>
          ))}
          <button type="button" onClick={() => setLines((prev) => [...prev, blankLine()])}>
            + Add another service
          </button>
        </div>

        <label>
          Total cost ($)
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={totalCost}
            onChange={(e) => setTotalCost(e.target.value)}
            placeholder={itemizedTotal > 0 ? itemizedTotal.toFixed(2) : undefined}
          />
          {itemizedTotal > 0 && totalCost === '' && (
            <span className="service-form__hint">Left blank, this saves as the itemized sum.</span>
          )}
        </label>

        <label>
          Location (shop or dealership)
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>

        <label>
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>

        <div className="service-form__actions">
          <button type="submit" className="btn-primary">
            {existing ? 'Save Changes' : 'Save Service'}
          </button>
          {existing && (
            <button type="button" className="btn-danger" onClick={handleDelete}>
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
