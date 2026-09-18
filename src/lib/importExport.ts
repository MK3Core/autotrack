import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import type { Vehicle, Fillup, MaintenanceRaw } from '../types';
import { computeThirdValue } from './calc';

type Row = Record<string, unknown>;

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Builds a lookup from normalized header name -> value, for one row. */
function normalizedRow(row: Row): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const key of Object.keys(row)) {
    map.set(normalizeHeader(key), row[key]);
  }
  return map;
}

function pick(nrow: Map<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    if (nrow.has(alias) && nrow.get(alias) !== null && nrow.get(alias) !== '') {
      return nrow.get(alias);
    }
  }
  return undefined;
}

function toNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isFinite(n) ? n : undefined;
}

function toBool(v: unknown, fallback = false): boolean {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  return ['yes', 'true', '1', 'y'].includes(s);
}

function toDateString(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number') {
    // Excel serial date fallback.
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const s = String(v ?? '').trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const parsedDate = new Date(s);
  if (!isNaN(parsedDate.getTime())) return toDateString(parsedDate);
  return s;
}

const VEHICLE_ALIASES = {
  name: ['vehiclename', 'name', 'vehicle', 'car'],
  make: ['manufacturer', 'make'],
  model: ['model'],
  year: ['year'],
  licensePlate: ['licenseplate', 'plate'],
  fuelCapacityGal: ['fuelcapacitygal', 'fuelcapacity', 'tanksize'],
  active: ['active'],
  notes: ['notes'],
};

const FILLUP_ALIASES = {
  vehicleName: ['vehiclename', 'vehicle', 'car'],
  date: ['date'],
  time: ['time'],
  odometer: ['odometermi', 'odometerkm', 'odometer', 'mileage'],
  gasType: ['gastype', 'fuel', 'fueltype'],
  pricePerGallon: ['pricegal', 'pricepergallon', 'price'],
  totalCost: ['totalcost', 'cost', 'total'],
  gallons: ['volume', 'gallons', 'gals'],
  fullTank: ['filledtankcompletely', 'fulltank'],
  missedFillup: ['missedfillupbefore', 'missedfillup', 'missedaprevious fillup'],
  gasStation: ['gasstation', 'station'],
  notes: ['notes'],
};

const MAINTENANCE_ALIASES = {
  vehicleName: ['vehiclename', 'vehicle', 'car'],
  date: ['date'],
  odometer: ['odometermi', 'odometerkm', 'odometer'],
  totalCost: ['totalcost', 'cost', 'total'],
  type: ['typeofservice', 'typeofexpense', 'type'],
  location: ['servicelocation', 'expenselocation', 'location'],
  notes: ['notes'],
};

export interface ImportSummary {
  vehiclesAdded: number;
  vehiclesUpdated: number;
  fillupsAdded: number;
  maintenanceAdded: number;
  skippedRows: number;
}

export async function importFile(file: File): Promise<ImportSummary> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });

  const summary: ImportSummary = {
    vehiclesAdded: 0,
    vehiclesUpdated: 0,
    fillupsAdded: 0,
    maintenanceAdded: 0,
    skippedRows: 0,
  };

  const existingVehicles = await db.vehicles.toArray();
  const vehicleByName = new Map<string, Vehicle>(
    existingVehicles.map((v) => [v.name.trim().toLowerCase(), v]),
  );

  async function findOrCreateVehicle(name: string | undefined): Promise<string> {
    const cleanName = (name ?? 'Imported Vehicle').trim() || 'Imported Vehicle';
    const key = cleanName.toLowerCase();
    const existing = vehicleByName.get(key);
    if (existing) return existing.id;
    const vehicle: Vehicle = {
      id: uuidv4(),
      name: cleanName,
      active: true,
      createdAt: new Date().toISOString(),
    };
    vehicleByName.set(key, vehicle);
    await db.vehicles.put(vehicle);
    summary.vehiclesAdded++;
    return vehicle.id;
  }

  const sheetNames = wb.SheetNames;
  const findSheet = (want: string) =>
    sheetNames.find((n) => normalizeHeader(n) === normalizeHeader(want));

  // --- Vehicles sheet (Drivvo-style, optional) ---
  const vehiclesSheetName = findSheet('Vehicles');
  if (vehiclesSheetName) {
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[vehiclesSheetName], { defval: null });
    for (const row of rows) {
      const nrow = normalizedRow(row);
      const name = String(pick(nrow, VEHICLE_ALIASES.name) ?? '').trim();
      if (!name) {
        summary.skippedRows++;
        continue;
      }
      const key = name.toLowerCase();
      const existing = vehicleByName.get(key);
      const vehicle: Vehicle = existing ?? {
        id: uuidv4(),
        name,
        active: true,
        createdAt: new Date().toISOString(),
      };
      vehicle.make = (pick(nrow, VEHICLE_ALIASES.make) as string) ?? vehicle.make;
      vehicle.model = (pick(nrow, VEHICLE_ALIASES.model) as string) ?? vehicle.model;
      const year = toNumber(pick(nrow, VEHICLE_ALIASES.year));
      if (year !== undefined) vehicle.year = year;
      vehicle.licensePlate = (pick(nrow, VEHICLE_ALIASES.licensePlate) as string) ?? vehicle.licensePlate;
      const cap = toNumber(pick(nrow, VEHICLE_ALIASES.fuelCapacityGal));
      if (cap !== undefined) vehicle.fuelCapacityGal = cap;
      vehicle.active = toBool(pick(nrow, VEHICLE_ALIASES.active), true);
      const notes = pick(nrow, VEHICLE_ALIASES.notes);
      if (notes) vehicle.notes = String(notes);

      await db.vehicles.put(vehicle);
      vehicleByName.set(key, vehicle);
      if (existing) summary.vehiclesUpdated++;
      else summary.vehiclesAdded++;
    }
  }

  // --- Fillup rows: the Refueling sheet if present (Drivvo-style), else
  // every sheet that isn't Vehicles/Services/Expenses (generic CSV import) ---
  const maintenanceSheetNames = [
    findSheet('Services'),
    findSheet('Maintenance'),
    findSheet('Expenses'),
  ].filter((n): n is string => !!n);
  const refuelingSheetName = findSheet('Refueling');
  const nonFillupSheetNames = new Set([vehiclesSheetName, ...maintenanceSheetNames].filter(Boolean));
  const fillupSheetNames = refuelingSheetName
    ? [refuelingSheetName]
    : sheetNames.filter((n) => !nonFillupSheetNames.has(n));

  const newFillups: Fillup[] = [];
  for (const sheetName of fillupSheetNames) {
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], { defval: null });
    for (const row of rows) {
      const nrow = normalizedRow(row);
      const odometer = toNumber(pick(nrow, FILLUP_ALIASES.odometer));
      if (odometer === undefined) {
        summary.skippedRows++;
        continue;
      }
      const vehicleName = pick(nrow, FILLUP_ALIASES.vehicleName) as string | undefined;
      const vehicleId = await findOrCreateVehicle(vehicleName);

      let values: { pricePerGallon?: number; totalCost?: number; gallons?: number } = {
        pricePerGallon: toNumber(pick(nrow, FILLUP_ALIASES.pricePerGallon)),
        totalCost: toNumber(pick(nrow, FILLUP_ALIASES.totalCost)),
        gallons: toNumber(pick(nrow, FILLUP_ALIASES.gallons)),
      };
      values = computeThirdValue(values);

      let notes = (pick(nrow, FILLUP_ALIASES.notes) as string) ?? undefined;
      const secondFuelVolume = nrow.get('volume2');
      if (secondFuelVolume) {
        notes = `${notes ? notes + ' | ' : ''}Source had additional fuel-type rows not imported.`;
      }

      const fillup: Fillup = {
        id: uuidv4(),
        vehicleId,
        date: toDateString(pick(nrow, FILLUP_ALIASES.date)),
        time: (pick(nrow, FILLUP_ALIASES.time) as string) ?? undefined,
        odometer,
        gasType: (pick(nrow, FILLUP_ALIASES.gasType) as string) ?? 'Regular (87)',
        pricePerGallon: values.pricePerGallon,
        totalCost: values.totalCost,
        gallons: values.gallons,
        fullTank: toBool(pick(nrow, FILLUP_ALIASES.fullTank), true),
        missedFillup: toBool(pick(nrow, FILLUP_ALIASES.missedFillup), false),
        gasStation: (pick(nrow, FILLUP_ALIASES.gasStation) as string) ?? undefined,
        notes,
        createdAt: new Date().toISOString(),
      };
      newFillups.push(fillup);
    }
  }
  if (newFillups.length) {
    await db.fillups.bulkPut(newFillups);
    summary.fillupsAdded += newFillups.length;
  }

  // --- Maintenance / Services / Expenses sheets: stash raw for a future feature ---
  const newMaintenance: MaintenanceRaw[] = [];
  for (const sheetName of maintenanceSheetNames) {
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], { defval: null });
    for (const row of rows) {
      const nrow = normalizedRow(row);
      const vehicleName = pick(nrow, MAINTENANCE_ALIASES.vehicleName) as string | undefined;
      const vehicleId = vehicleName ? await findOrCreateVehicle(vehicleName) : undefined;
      newMaintenance.push({
        id: uuidv4(),
        vehicleId,
        vehicleName,
        date: toDateString(pick(nrow, MAINTENANCE_ALIASES.date)),
        odometer: toNumber(pick(nrow, MAINTENANCE_ALIASES.odometer)),
        totalCost: toNumber(pick(nrow, MAINTENANCE_ALIASES.totalCost)),
        type: pick(nrow, MAINTENANCE_ALIASES.type) as string,
        location: pick(nrow, MAINTENANCE_ALIASES.location) as string,
        notes: pick(nrow, MAINTENANCE_ALIASES.notes) as string,
        raw: row,
        createdAt: new Date().toISOString(),
      });
    }
  }
  if (newMaintenance.length) {
    await db.maintenanceRaw.bulkPut(newMaintenance);
    summary.maintenanceAdded += newMaintenance.length;
  }

  return summary;
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportFillupsCSV() {
  const [fillups, vehicles] = await Promise.all([db.fillups.toArray(), db.vehicles.toArray()]);
  const vehicleName = new Map(vehicles.map((v) => [v.id, v.name]));
  const rows = fillups
    .sort((a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer)
    .map((f) => ({
      'Vehicle Name': vehicleName.get(f.vehicleId) ?? 'Unknown',
      Date: f.date,
      Time: f.time ?? '',
      Odometer: f.odometer,
      'Gas Type': f.gasType,
      'Price Per Gallon': f.pricePerGallon ?? '',
      'Total Cost': f.totalCost ?? '',
      Gallons: f.gallons ?? '',
      'Full Tank': f.fullTank ? 'Yes' : 'No',
      'Missed Fillup Before': f.missedFillup ? 'Yes' : 'No',
      'Gas Station': f.gasStation ?? '',
      Notes: f.notes ?? '',
    }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  downloadBlob(`autotrack-fillups-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
}

export async function exportVehiclesCSV() {
  const vehicles = await db.vehicles.toArray();
  const rows = vehicles.map((v) => ({
    'Vehicle Name': v.name,
    Manufacturer: v.make ?? '',
    Model: v.model ?? '',
    Year: v.year ?? '',
    'License plate': v.licensePlate ?? '',
    'Fuel capacity(gal)': v.fuelCapacityGal ?? '',
    Active: v.active ? 'Yes' : 'No',
    Notes: v.notes ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  downloadBlob(`autotrack-vehicles-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
}
