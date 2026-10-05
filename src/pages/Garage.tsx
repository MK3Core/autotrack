import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import VehicleServices from '../components/VehicleServices';
import { useVehicles } from '../lib/VehicleContext';
import { useOnTabLeave } from '../lib/useOnTabLeave';
import { computeLifetimeMpgStats, computeTotalCostPerMile } from '../lib/calc';
import { deleteVehicleMaintenance } from '../lib/maintenance';
import type { Fillup, MaintenanceRecord, Vehicle } from '../types';
import './Garage.css';

const emptyForm = {
  name: '',
  make: '',
  model: '',
  year: '',
  licensePlate: '',
  fuelCapacityGal: '',
  notes: '',
};

function vehicleSubtitle(v: Vehicle) {
  return [[v.year, v.make, v.model].filter(Boolean).join(' '), v.licensePlate].filter(Boolean).join(' · ');
}

/** The selected vehicle's details, light stats and repeating services. */
export default function Garage() {
  const { vehicles, selectedVehicle, selectVehicle } = useVehicles();
  // null = not editing, 'new' = adding a vehicle, otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
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
  const subtitle = vehicleSubtitle(selectedVehicle);

  return (
    <div className="garage">
      <section className="garage__vehicle">
        <div className="garage__title">
          <h2>{selectedVehicle.name}</h2>
          <button type="button" className="garage__edit" onClick={() => startEdit(selectedVehicle)}>
            Edit
          </button>
        </div>
        {subtitle && <p className="garage__subtitle">{subtitle}</p>}
        {!selectedVehicle.active && <p className="garage__inactive-note">Inactive. Hidden from the vehicle bar.</p>}
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

      <section className="garage__footer">
        <button type="button" className="garage__add" onClick={startAdd}>
          + Add Vehicle
        </button>
        {inactive.length > 0 && (
          <div className="garage__inactive">
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
          </div>
        )}
      </section>
    </div>
  );
}
