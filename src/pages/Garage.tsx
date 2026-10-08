import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import CarIcon from '../components/CarIcon';
import ServiceReminders from '../components/ServiceReminders';
import { useVehicles } from '../lib/VehicleContext';
import { useOnTabLeave } from '../lib/useOnTabLeave';
import { copyText } from '../lib/clipboard';
import { deleteVehicleMaintenance, latestOdometer } from '../lib/maintenance';
import { normalizeVin, VIN_LENGTH } from '../lib/vehicle';
import { makeLogoUrl } from '../lib/makeLogos';
import { DISTANCE_UNITS, FUEL_UNITS, unitsFor } from '../lib/units';
import type { DistanceUnit, Fillup, FuelUnit, MaintenanceRecord, Vehicle } from '../types';
import './Garage.css';

const emptyForm = {
  name: '',
  make: '',
  model: '',
  year: '',
  licensePlate: '',
  vin: '',
  fuelCapacityGal: '',
  distanceUnit: 'mi' as DistanceUnit,
  fuelUnit: 'gal' as FuelUnit,
  notes: '',
};

const ODOMETER_DIGITS = 6;

/** The odometer reading as mechanical wheels; leading zeros are dimmed. */
function Odometer({ reading, unitLabel }: { reading: number; unitLabel: string }) {
  const digits = String(Math.floor(reading)).padStart(ODOMETER_DIGITS, '0').split('');
  const firstSignificant = digits.findIndex((d) => d !== '0');
  return (
    <div className="odometer" aria-label={`${Math.floor(reading).toLocaleString()} ${unitLabel}`}>
      {digits.map((d, i) => (
        <span
          key={i}
          className={`odometer__digit ${firstSignificant === -1 || i < firstSignificant ? 'is-lead' : ''}`}
        >
          {d}
        </span>
      ))}
    </div>
  );
}

const COPIED_MS = 1400;

/**
 * Wraps a vehicle graphic so one tap copies its value, for pasting a VIN or
 * plate into a form. Shows a brief "Copied" tag on success. Without a value
 * (e.g. the VIN placeholder) it renders the graphic as-is, not tappable.
 */
function Copyable({ value, label, children }: { value: string | null; label: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!value) return <>{children}</>;
  return (
    <button
      type="button"
      className={`copyable ${copied ? 'is-copied' : ''}`}
      aria-label={`Copy ${label}: ${value}`}
      onClick={async () => setCopied(await copyText(value))}
    >
      {children}
      <span className="copyable__tag" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </button>
  );
}

/** The selected vehicle's details and service reminders. */
export default function Garage() {
  const { vehicles, selectedVehicle, selectVehicle } = useVehicles();
  // null = not editing, 'new' = adding a vehicle, otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [searchParams, setSearchParams] = useSearchParams();
  // Leaving the tab discards an unsaved add/edit.
  useOnTabLeave('/garage', () => setEditing(null));

  const data = useLiveQuery(async () => {
    if (!selectedVehicle) return { fillups: [] as Fillup[], records: [] as MaintenanceRecord[] };
    const [fillups, records] = await Promise.all([
      db.fillups.where('vehicleId').equals(selectedVehicle.id).toArray() as Promise<Fillup[]>,
      db.maintenance.where('vehicleId').equals(selectedVehicle.id).toArray() as Promise<MaintenanceRecord[]>,
    ]);
    return { fillups, records };
  }, [selectedVehicle?.id]);

  // The "+ Add Vehicle" pill in the top bar links here with ?add=1.
  useEffect(() => {
    if (searchParams.get('add') !== '1') return;
    startAdd();
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const inactive = vehicles.filter((v) => !v.active && v.id !== selectedVehicle?.id);

  function startAdd() {
    setEditing('new');
    setForm(emptyForm);
  }

  function startEdit(v: Vehicle) {
    setEditing(v.id);
    setForm({
      name: v.name,
      make: v.make ?? '',
      model: v.model ?? '',
      year: v.year ? String(v.year) : '',
      licensePlate: v.licensePlate ?? '',
      vin: v.vin ?? '',
      fuelCapacityGal: v.fuelCapacityGal ? String(v.fuelCapacityGal) : '',
      distanceUnit: v.distanceUnit ?? 'mi',
      fuelUnit: v.fuelUnit ?? 'gal',
      notes: v.notes ?? '',
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const editingId = editing === 'new' ? null : editing;
    const vehicle: Vehicle = {
      id: editingId ?? uuidv4(),
      name: form.name.trim(),
      make: form.make.trim() || undefined,
      model: form.model.trim() || undefined,
      year: form.year ? parseInt(form.year, 10) : undefined,
      licensePlate: form.licensePlate.trim() || undefined,
      vin: normalizeVin(form.vin) || undefined,
      fuelCapacityGal: form.fuelCapacityGal ? parseFloat(form.fuelCapacityGal) : undefined,
      distanceUnit: form.distanceUnit,
      fuelUnit: form.fuelUnit,
      notes: form.notes.trim() || undefined,
      active: true,
      createdAt: new Date().toISOString(),
    };
    if (editingId) {
      const existing = await db.vehicles.get(editingId);
      vehicle.active = existing?.active ?? true;
      vehicle.createdAt = existing?.createdAt ?? vehicle.createdAt;
    } else {
      selectVehicle(vehicle.id);
    }
    await db.vehicles.put(vehicle);
    setEditing(null);
  }

  async function setActive(v: Vehicle, active: boolean) {
    await db.vehicles.put({ ...v, active });
    if (active) selectVehicle(v.id);
  }

  async function handleDelete(v: Vehicle) {
    const count = await db.fillups.where('vehicleId').equals(v.id).count();
    const serviceCount = await db.maintenance.where('vehicleId').equals(v.id).count();
    if (!confirm(`Delete "${v.name}" with its ${count} fillup(s) and ${serviceCount} service(s)?`)) return;
    await db.fillups.where('vehicleId').equals(v.id).delete();
    await deleteVehicleMaintenance(v.id);
    await db.vehicles.delete(v.id);
    setEditing(null);
  }

  if (editing || !vehicles.length) {
    const editingVehicle = vehicles.find((v) => v.id === editing);
    return (
      <div>
        <h2>{editingVehicle ? 'Edit Vehicle' : 'New Vehicle'}</h2>
        {!vehicles.length && !editing && <p className="garage__hint">Add your first vehicle.</p>}
        <form className="vehicle-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <div className="vehicle-form__row">
            <label>
              Year
              <input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            </label>
            <label>
              Make
              <input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
            </label>
            <label>
              Model
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </label>
          </div>
          {/* Labels only: switching units relabels existing numbers, it doesn't convert them. */}
          <div className="vehicle-form__row">
            <label>
              Distance
              <select
                value={form.distanceUnit}
                onChange={(e) => setForm({ ...form, distanceUnit: e.target.value as DistanceUnit })}
              >
                {DISTANCE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fuel
              <select
                value={form.fuelUnit}
                onChange={(e) => setForm({ ...form, fuelUnit: e.target.value as FuelUnit })}
              >
                {FUEL_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="vehicle-form__row">
            <label>
              License plate
              <input
                value={form.licensePlate}
                onChange={(e) => setForm({ ...form, licensePlate: e.target.value })}
              />
            </label>
            <label>
              Fuel capacity ({unitsFor(form).vol})
              <input
                type="number"
                step="0.1"
                value={form.fuelCapacityGal}
                onChange={(e) => setForm({ ...form, fuelCapacityGal: e.target.value })}
              />
            </label>
          </div>
          <label>
            VIN
            <input
              className="vehicle-form__vin"
              value={form.vin}
              onChange={(e) => setForm({ ...form, vin: normalizeVin(e.target.value) })}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={VIN_LENGTH}
            />
            {form.vin.length > 0 && form.vin.length < VIN_LENGTH && (
              <span className="vehicle-form__help">
                {form.vin.length} of {VIN_LENGTH} characters. Older vehicles can have shorter VINs.
              </span>
            )}
          </label>
          <label>
            Notes
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </label>
          <div className="vehicle-form__actions">
            <button type="submit" className="btn-primary">
              Save
            </button>
            {vehicles.length > 0 && (
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            )}
          </div>
          {editingVehicle && (
            <div className="vehicle-form__manage">
              <button type="button" onClick={() => setActive(editingVehicle, !editingVehicle.active)}>
                {editingVehicle.active ? 'Deactivate' : 'Activate'}
              </button>
              <button type="button" className="btn-danger" onClick={() => handleDelete(editingVehicle)}>
                Delete Vehicle
              </button>
            </div>
          )}
        </form>
      </div>
    );
  }

  if (!selectedVehicle || !data) return null;

  const odometer = latestOdometer(data.fillups, data.records);
  // Year and make on one line with the model beneath, so long models get a line to
  // themselves. The vehicle name is already shown in the switcher pill above, so it
  // only stands in when none of them are filled in.
  const yearMake = [selectedVehicle.year, selectedVehicle.make].filter(Boolean).join(' ');
  const hasDescription = !!(yearMake || selectedVehicle.model);
  // The app is dark-only for now; a theme picker would pass the theme's background here.
  const logoUrl = makeLogoUrl(selectedVehicle.make, 'dark');

  return (
    <div className="garage">
      <section className="garage__hero card">
        <div className="garage__hero-top">
          {/* The maker's logo in its own colors, or a generic car when the make is unknown. */}
          {logoUrl ? (
            <div className="garage__badge garage__badge--logo">
              <img className="garage__logo" src={logoUrl} alt={`${selectedVehicle.make} logo`} />
            </div>
          ) : (
            <div className="garage__badge">
              <CarIcon className="garage__car-icon" />
            </div>
          )}
          <div className="garage__title">
            <h2>
              {yearMake && <span className="garage__year-make">{yearMake}</span>}
              {selectedVehicle.model && <span className="garage__model">{selectedVehicle.model}</span>}
              {!hasDescription && selectedVehicle.name}
            </h2>
            {!hasDescription && (
              <button type="button" className="garage__fill-in" onClick={() => startEdit(selectedVehicle)}>
                Add year, make and model
              </button>
            )}
            {!selectedVehicle.active && <span className="garage__inactive-note">Inactive</span>}
          </div>
        </div>

        {/* Odometer and plate, then VIN and Edit; tap any graphic to copy it. The graphics speak for themselves, so no captions. */}
        <div className="garage__instruments">
          {/* Odometer on the left, plate on the right; they wrap onto two lines if the screen is too narrow. */}
          <div className="garage__instrument-row">
            {odometer !== null && (
              <Copyable value={String(Math.floor(odometer))} label="odometer">
                <Odometer reading={odometer} unitLabel={unitsFor(selectedVehicle).distLong} />
              </Copyable>
            )}
            {selectedVehicle.licensePlate && (
              <Copyable value={selectedVehicle.licensePlate} label="license plate">
                <span className="plate" aria-label={`License plate ${selectedVehicle.licensePlate}`}>
                  <span className="plate__text">{selectedVehicle.licensePlate}</span>
                </span>
              </Copyable>
            )}
          </div>
          {/* Edit sits at the card's bottom right, on the VIN's line. */}
          <div className="garage__vin-row">
            {/* Printed like the VIN in the windshield; zeros until one is entered. */}
            <Copyable value={selectedVehicle.vin ?? null} label="VIN">
              <div
                className={`vin-plate ${selectedVehicle.vin ? '' : 'is-placeholder'}`}
                aria-label={selectedVehicle.vin ? `VIN ${selectedVehicle.vin}` : 'No VIN entered'}
              >
                <span className="vin-plate__text">{selectedVehicle.vin || '0'.repeat(VIN_LENGTH)}</span>
              </div>
            </Copyable>
            <button type="button" className="garage__edit" onClick={() => startEdit(selectedVehicle)}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M11 2.5l2.5 2.5L6 12.5H3.5V10z" />
              </svg>
              Edit
            </button>
          </div>
        </div>

        {selectedVehicle.notes && <p className="garage__notes">{selectedVehicle.notes}</p>}
      </section>

      <ServiceReminders vehicle={selectedVehicle} />

      {inactive.length > 0 && (
        <section className="garage__inactive">
          <h4 className="garage__section-title">Inactive</h4>
          <ul>
            {inactive.map((v) => (
              <li key={v.id}>
                <span>{v.name}</span>
                <button type="button" onClick={() => setActive(v, true)}>
                  Activate
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
