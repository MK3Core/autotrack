import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import ClearDataDialog from '../components/ClearDataDialog';
import { clearAllData } from '../lib/clearData';
import { exportVehicleCsv, importFile, type ImportSummary } from '../lib/importExport';
import { useVehicles } from '../lib/VehicleContext';
import { useOnTabLeave } from '../lib/useOnTabLeave';
import './ImportExport.css';

export default function ImportExport() {
  const { vehicles } = useVehicles();
  const fileInput = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  useOnTabLeave('/data', () => setConfirmingClear(false));
  const fillupCount = useLiveQuery(() => db.fillups.count(), [], 0);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const result = await importFile(file);
      if (
        result.vehiclesAdded === 0 &&
        result.vehiclesUpdated === 0 &&
        result.fillupsAdded === 0 &&
        result.maintenanceAdded === 0 &&
        result.schedulesAdded === 0
      ) {
        setError(
          result.skippedRows > 0
            ? 'Nothing imported: no rows had an odometer and vehicle name.'
            : 'Nothing imported: unrecognized file.',
        );
      } else {
        setSummary(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function handleExport(vehicleId: string) {
    setError(null);
    try {
      await exportVehicleCsv(vehicleId);
    } catch (err) {
      setError(err instanceof Error ? `Export failed: ${err.message}` : 'Export failed.');
    }
  }

  return (
    <div>
      <h2>Import / Export</h2>

      <div className="card data-section">
        <h3>Import</h3>
        <p>AutoTrack, Drivvo or Fuelio backups. Never overwrites.</p>
        <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} disabled={busy} />
        {busy && <p>Importing…</p>}
        {error && <p className="data-section__error">{error}</p>}
        {summary && (
          <ul className="data-section__summary">
            <li>Vehicles added: {summary.vehiclesAdded}</li>
            <li>Vehicles updated: {summary.vehiclesUpdated}</li>
            <li>Fillups added: {summary.fillupsAdded}</li>
            <li>Service records added: {summary.maintenanceAdded}</li>
            {summary.schedulesAdded > 0 && <li>Repeating services added: {summary.schedulesAdded}</li>}
            {summary.skippedRows > 0 && <li>Rows skipped: {summary.skippedRows}</li>}
          </ul>
        )}
      </div>

      <div className="card data-section">
        <h3>Export</h3>
        <p>One .csv per vehicle. Re-importable.</p>
        {vehicles.length === 0 && <p>No vehicles yet.</p>}
        <ul className="data-section__vehicle-list">
          {vehicles.map((v) => (
            <li key={v.id}>
              <span>{v.name}</span>
              <button className="btn-primary" onClick={() => handleExport(v.id)}>
                Export .csv
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="card data-section data-section--danger">
        <h3>Clear data</h3>
        <p>Deletes everything. Can&apos;t be undone.</p>
        <button
          className="btn-danger"
          disabled={vehicles.length === 0 && fillupCount === 0}
          onClick={() => setConfirmingClear(true)}
        >
          Clear all data…
        </button>
      </div>

      {confirmingClear && (
        <ClearDataDialog
          vehicleCount={vehicles.length}
          fillupCount={fillupCount}
          onCancel={() => setConfirmingClear(false)}
          onConfirm={async () => {
            await clearAllData();
            setConfirmingClear(false);
            setSummary(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
