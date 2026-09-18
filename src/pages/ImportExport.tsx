import { useRef, useState } from 'react';
import { exportFillupsCSV, exportVehiclesCSV, importFile, type ImportSummary } from '../lib/importExport';
import './ImportExport.css';

export default function ImportExport() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const result = await importFile(file);
      setSummary(result);
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
        <p>
          Import a CSV or an Excel export (.xlsx), including a Drivvo export — its Vehicles, Refueling, and
          Services sheets are all recognized automatically. Vehicles are matched by name; new ones are created
          as needed. Nothing is deleted or overwritten by an import.
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
        <p>Download your data as CSV, ready to open in Excel/Sheets or re-import elsewhere.</p>
        <div className="data-section__buttons">
          <button className="btn-primary" onClick={() => exportFillupsCSV()}>
            Export Fillups CSV
          </button>
          <button onClick={() => exportVehiclesCSV()}>Export Vehicles CSV</button>
        </div>
      </div>
    </div>
  );
}
