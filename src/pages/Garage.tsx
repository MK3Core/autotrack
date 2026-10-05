import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import CarIcon from '../components/CarIcon';
import VehicleServices from '../components/VehicleServices';
import { useVehicles } from '../lib/VehicleContext';
import { useOnTabLeave } from '../lib/useOnTabLeave';
import { computeLifetimeMpgStats, computeTotalCostPerMile } from '../lib/calc';
import { deleteVehicleMaintenance, latestOdometer } from '../lib/maintenance';
import { normalizeVin, VIN_LENGTH } from '../lib/vehicle';
import type { Fillup, MaintenanceRecord, Vehicle } from '../types';
import './Garage.css';

const emptyForm = {
  name: '',
  make: '',
  model: '',
  year: '',
  licensePlate: '',
  vin: '',
  fuelCapacityGal: '',
  notes: '',
};

const ODOMETER_DIGITS = 6;

/** Mileage as mechanical odometer wheels; leading zeros are dimmed. */
function Odometer({ miles }: { miles: number }) {
  const digits = String(Math.floor(miles)).padStart(ODOMETER_DIGITS, '0').split('');
  const firstSignificant = digits.findIndex((d) => d !== '0');
  return (
    <div className="odometer" aria-label={`${Math.floor(miles).toLocaleString()} miles`}>
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

/** The selected vehicle's details, light stats and repeating services. */
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
    if (!confirm(`Delete "${v.name}"? This will also delete ${count} logged fillup(s) and ${serviceCount} service record(s).`)) return;
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
        {!vehicles.length && !editing && <p className="garage__hint">Add your first vehicle to start tracking it.</p>}
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
          <div className="vehicle-form__row">
            <label>
              License plate
              <input
                value={form.licensePlate}
                onChange={(e) => setForm({ ...form, licensePlate: e.target.value })}
              />
            </label>
            <label>
              Fuel capacity (gal)
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

  const mpg = computeLifetimeMpgStats(data.fillups).average;
  const { costPerMile, trackedMiles } = computeTotalCostPerMile(data.fillups, data.records);
  const odometer = latestOdometer(data.fillups, data.records);
  const specs = [
    { label: 'Year', value: selectedVehicle.year ? String(selectedVehicle.year) : null },
    { label: 'Make', value: selectedVehicle.make },
    { label: 'Model', value: selectedVehicle.model },
    { label: 'Tank', value: selectedVehicle.fuelCapacityGal ? `${selectedVehicle.fuelCapacityGal} gal` : null },
  ].filter((s): s is { label: string; value: string } => !!s.value);

  return (
    <div className="garage">
      <section className="garage__hero card">
        <div className="garage__hero-top">
          <div className="garage__badge">
            <CarIcon className="garage__car-icon" />
          </div>
          <div className="garage__title">
            <h2>{selectedVehicle.name}</h2>
            {!selectedVehicle.active && <span className="garage__inactive-note">Inactive</span>}
          </div>
          <button type="button" className="garage__edit" onClick={() => startEdit(selectedVehicle)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M11 2.5l2.5 2.5L6 12.5H3.5V10z" />
            </svg>
            Edit
          </button>
        </div>

        <div className="garage__lane" />

        <div className="garage__dash">
          <div className="garage__dash-item">
            <span className="garage__dash-label">Odometer</span>
            {odometer !== null ? <Odometer miles={odometer} /> : <span className="garage__empty">No entries yet</span>}
          </div>
          {selectedVehicle.licensePlate && (
            <div className="garage__dash-item garage__dash-item--end">
              <span className="garage__dash-label">Plate</span>
              <span className="plate">{selectedVehicle.licensePlate}</span>
            </div>
          )}
        </div>

        {specs.length > 0 || selectedVehicle.vin ? (
          <div className="garage__specs-box">
            {specs.length > 0 && (
              <dl className="garage__specs">
                {specs.map((s) => (
                  <div key={s.label}>
                    <dt>{s.label}</dt>
                    <dd>{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {selectedVehicle.vin && (
              <div className="garage__vin">
                <span className="garage__dash-label">VIN</span>
                <span className="garage__vin-value">{selectedVehicle.vin}</span>
              </div>
            )}
          </div>
        ) : (
          <button type="button" className="garage__fill-in" onClick={() => startEdit(selectedVehicle)}>
            Add year, make and model
          </button>
        )}
        {selectedVehicle.notes && <p className="garage__notes">{selectedVehicle.notes}</p>}
      </section>

      <section className="garage__stats card">
        <div className="stat">
          <span className="stat__value">{mpg !== null ? mpg.toFixed(1) : 'N/A'}</span>
          <span className="stat__label">Avg MPG</span>
        </div>
        <div className="stat">
          <span className="stat__value">{costPerMile !== null ? `$${costPerMile.toFixed(2)}` : 'N/A'}</span>
          <span className="stat__label">Cost / Mile</span>
        </div>
        <div className="stat">
          <span className="stat__value">{trackedMiles !== null ? trackedMiles.toLocaleString() : 'N/A'}</span>
          <span className="stat__label">Miles Tracked</span>
        </div>
      </section>

      <VehicleServices vehicleId={selectedVehicle.id} />

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
