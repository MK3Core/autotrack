import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import ClearDataDialog from '../components/ClearDataDialog';
import { clearAllData } from '../lib/clearData';
import { exportVehicleCsv, importFile, type ImportSummary } from '../lib/importExport';
import { useVehicles } from '../lib/VehicleContext';
import './ImportExport.css';

export default function ImportExport() {
  const { vehicles } = useVehicles();
  const fileInput = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
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
        result.maintenanceAdded === 0
      ) {
        setError(
          result.skippedRows > 0
            ? `Nothing was imported. Found ${result.skippedRows} row${result.skippedRows === 1 ? '' : 's'} of data, but none matched a supported format (missing odometer or vehicle name). Double-check this file is a CSV/XLSX export from one of the apps above.`
            : "Nothing was imported. This file doesn't look like a supported format: no recognizable data rows were found in it.",
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

  return (
    <div>
      <h2>Import / Export</h2>

      <div className="card data-section">
        <h3>Import</h3>
        <p className="data-section__compat-intro">Importer supports the following backup file types from apps:</p>
        <ul className="data-section__compat-list">
          <li>AutoTrack (.csv)</li>
          <li>Drivvo (.xlsx)</li>
          <li>Fuelio (.csv)</li>
        </ul>
        <p>
          Vehicle details and fillups are recognized automatically from any of the above. Vehicles are
          matched by name; new ones are created as needed. Nothing is deleted or overwritten by an import.
        </p>
        <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} disabled={busy} />
        {busy && <p>Importing…</p>}
        {error && <p className="data-section__error">{error}</p>}
        {summary && (
          <ul className="data-section__summary">
            <li>Vehicles added: {summary.vehiclesAdded}</li>
            <li>Vehicles updated: {summary.vehiclesUpdated}</li>
            <li>Fillups added: {summary.fillupsAdded}</li>
            <li>Maintenance records stashed for later: {summary.maintenanceAdded}</li>
            {summary.skippedRows > 0 && <li>Rows skipped (missing odometer/name): {summary.skippedRows}</li>}
          </ul>
        )}
      </div>

      <div className="card data-section">
        <h3>Export</h3>
        <p>
          One .csv file per vehicle: its details on the first lines, then its full fillup history below.
          Opens fine in Excel/Sheets, and can be dropped back into Import above to restore it.
        </p>
        {vehicles.length === 0 && <p>No vehicles yet.</p>}
        <ul className="data-section__vehicle-list">
          {vehicles.map((v) => (
            <li key={v.id}>
              <span>{v.name}</span>
              <button className="btn-primary" onClick={() => exportVehicleCsv(v.id)}>
                Export .csv
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="card data-section data-section--danger">
        <h3>Clear data</h3>
        <p>
          Permanently deletes all vehicles and fillups so you can start fresh. Export anything you want
          to keep first.
        </p>
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
