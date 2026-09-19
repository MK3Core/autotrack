import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import VehicleServices from '../components/VehicleServices';
import { useVehicles } from '../lib/VehicleContext';
import { deleteVehicleMaintenance } from '../lib/maintenance';
import type { Vehicle } from '../types';
import './Vehicles.css';

const emptyForm = {
  name: '',
  make: '',
  model: '',
  year: '',
  licensePlate: '',
  fuelCapacityGal: '',
  notes: '',
};

export default function Vehicles() {
  const { vehicles, selectVehicle } = useVehicles();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(v: Vehicle) {
    setEditingId(v.id);
    setForm({
      name: v.name,
      make: v.make ?? '',
      model: v.model ?? '',
      year: v.year ? String(v.year) : '',
      licensePlate: v.licensePlate ?? '',
      fuelCapacityGal: v.fuelCapacityGal ? String(v.fuelCapacityGal) : '',
      notes: v.notes ?? '',
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
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
    setShowForm(false);
  }

  async function toggleActive(v: Vehicle) {
    await db.vehicles.put({ ...v, active: !v.active });
  }

  async function handleDelete(v: Vehicle) {
    const count = await db.fillups.where('vehicleId').equals(v.id).count();
    const serviceCount = await db.maintenance.where('vehicleId').equals(v.id).count();
    if (!confirm(`Delete "${v.name}"? This will also delete ${count} logged fillup(s) and ${serviceCount} service record(s).`)) return;
    await db.fillups.where('vehicleId').equals(v.id).delete();
    await deleteVehicleMaintenance(v.id);
    await db.vehicles.delete(v.id);
  }

  return (
    <div>
      <h2>Vehicles</h2>
      <ul className="vehicle-list">
        {vehicles.map((v) => (
          <li key={v.id} className={`vehicle-list__item card ${v.active ? '' : 'is-inactive'}`}>
            <div>
              <strong>{v.name}</strong>
              <div className="vehicle-list__meta">
                {[v.year, v.make, v.model].filter(Boolean).join(' ')}
                {v.licensePlate ? ` · ${v.licensePlate}` : ''}
              </div>
            </div>
            <div className="vehicle-list__actions">
              <button onClick={() => startEdit(v)}>Edit</button>
              <button onClick={() => toggleActive(v)}>{v.active ? 'Deactivate' : 'Activate'}</button>
              <button className="btn-danger" onClick={() => handleDelete(v)}>
                Delete
              </button>
            </div>
            <VehicleServices vehicleId={v.id} />
          </li>
        ))}
      </ul>

      {!showForm && (
        <button className="btn-primary" onClick={startAdd}>
          + Add Vehicle
        </button>
      )}

      {showForm && (
        <form className="vehicle-form card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit Vehicle' : 'New Vehicle'}</h3>
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
            <button type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
