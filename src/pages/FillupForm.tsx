import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { useVehicles } from '../lib/VehicleContext';
import { computeThirdValue } from '../lib/calc';
import { GAS_TYPE_PRESETS, type Fillup, type FillupCalcField } from '../types';
import './FillupForm.css';

const TRIANGLE_FIELDS: FillupCalcField[] = ['pricePerGallon', 'totalCost', 'gallons'];

function today() {
  return new Date().toISOString().slice(0, 10);
}
function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

export default function FillupForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { vehicles, selectedVehicleId } = useVehicles();
  const existing = useLiveQuery(() => (id ? db.fillups.get(id) : undefined), [id]);

  const [vehicleId, setVehicleId] = useState(selectedVehicleId ?? '');
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(nowTime());
  const [odometer, setOdometer] = useState('');
  const [gasType, setGasType] = useState<string>(GAS_TYPE_PRESETS[0]);
  const [customGasType, setCustomGasType] = useState('');
  const [values, setValues] = useState<{ pricePerGallon?: number; totalCost?: number; gallons?: number }>({});
  const [editedOrder, setEditedOrder] = useState<FillupCalcField[]>([]);
  const [fullTank, setFullTank] = useState(true);
  const [missedFillup, setMissedFillup] = useState(false);
  const [gasStation, setGasStation] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!existing) return;
    setVehicleId(existing.vehicleId);
    setDate(existing.date);
    setTime(existing.time ?? '');
    setOdometer(String(existing.odometer));
    if (GAS_TYPE_PRESETS.includes(existing.gasType as (typeof GAS_TYPE_PRESETS)[number])) {
      setGasType(existing.gasType);
    } else {
      setGasType('Custom');
      setCustomGasType(existing.gasType);
    }
    setValues({
      pricePerGallon: existing.pricePerGallon,
      totalCost: existing.totalCost,
      gallons: existing.gallons,
    });
    setEditedOrder(['pricePerGallon', 'gallons']);
    setFullTank(existing.fullTank);
    setMissedFillup(existing.missedFillup);
    setGasStation(existing.gasStation ?? '');
    setNotes(existing.notes ?? '');
  }, [existing]);

  useEffect(() => {
    if (editedOrder.length < 2) return;
    const target = TRIANGLE_FIELDS.find((f) => !editedOrder.includes(f));
    if (!target) return;
    const source: Record<string, number | undefined> = {};
    for (const f of editedOrder) source[f] = values[f];
    const result = computeThirdValue(source);
    if (result[target] !== undefined && result[target] !== values[target]) {
      setValues((prev) => ({ ...prev, [target]: result[target] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.pricePerGallon, values.totalCost, values.gallons, editedOrder]);

  function handleTriangleChange(field: FillupCalcField, raw: string) {
    const val = raw === '' ? undefined : parseFloat(raw);
    setValues((prev) => ({ ...prev, [field]: val }));
    setEditedOrder((prev) => [...prev.filter((f) => f !== field), field].slice(-2));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId) return alert('Select a vehicle first.');
    const odo = parseFloat(odometer);
    if (!isFinite(odo)) return alert('Odometer reading is required.');

    const finalGasType = gasType === 'Custom' ? customGasType.trim() || 'Other' : gasType;

    const fillup: Fillup = {
      id: existing?.id ?? uuidv4(),
      vehicleId,
      date,
      time: time || undefined,
      odometer: odo,
      gasType: finalGasType,
      pricePerGallon: values.pricePerGallon,
      totalCost: values.totalCost,
      gallons: values.gallons,
      fullTank,
      missedFillup,
      gasStation: gasStation.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    await db.fillups.put(fillup);
    navigate('/fillups');
  }

  async function handleDelete() {
    if (!existing) return;
    if (!confirm('Delete this fillup?')) return;
    await db.fillups.delete(existing.id);
    navigate('/fillups');
  }

  const filledCount = TRIANGLE_FIELDS.filter((f) => values[f] !== undefined).length;

  return (
    <div>
      <h2>{existing ? 'Edit Fillup' : 'Add Fillup'}</h2>
      <form className="fillup-form card" onSubmit={handleSubmit}>
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

        <div className="fillup-form__row">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>

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

        <label>
          Gas Type
          <select value={gasType} onChange={(e) => setGasType(e.target.value)}>
            {GAS_TYPE_PRESETS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
            <option value="Custom">Custom…</option>
          </select>
        </label>
        {gasType === 'Custom' && (
          <label>
            Custom gas type
            <input value={customGasType} onChange={(e) => setCustomGasType(e.target.value)} />
          </label>
        )}

        <fieldset className="fillup-form__triangle">
          <legend>Enter any two — the third is calculated{filledCount < 2 ? ' automatically' : ''}</legend>
          <label>
            Price / gal ($)
            <input
              type="number"
              inputMode="decimal"
              step="0.001"
              value={values.pricePerGallon ?? ''}
              onChange={(e) => handleTriangleChange('pricePerGallon', e.target.value)}
            />
          </label>
          <label>
            Gallons
            <input
              type="number"
              inputMode="decimal"
              step="0.001"
              value={values.gallons ?? ''}
              onChange={(e) => handleTriangleChange('gallons', e.target.value)}
            />
          </label>
          <label>
            Total cost ($)
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={values.totalCost ?? ''}
              onChange={(e) => handleTriangleChange('totalCost', e.target.value)}
            />
          </label>
        </fieldset>

        <label className="fillup-form__checkbox">
          <input type="checkbox" checked={fullTank} onChange={(e) => setFullTank(e.target.checked)} />
          Filled tank completely
        </label>

        <label className="fillup-form__checkbox">
          <input type="checkbox" checked={missedFillup} onChange={(e) => setMissedFillup(e.target.checked)} />
          A fillup before this one was never logged (breaks mileage calc)
        </label>

        <label>
          Gas station
          <input value={gasStation} onChange={(e) => setGasStation(e.target.value)} />
        </label>

        <label>
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>

        <div className="fillup-form__actions">
          <button type="submit" className="btn-primary">
            {existing ? 'Save Changes' : 'Save Fillup'}
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
