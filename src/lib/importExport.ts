import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import type { Vehicle, Fillup, MaintenanceRecord, ServiceItem, ServiceSchedule } from '../types';
import { serviceKey } from './maintenance';
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

function toTimeString(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (v instanceof Date) {
    // SheetJS parses a bare "HH:MM" CSV value into a Date anchored to its
    // 1899/1900 time-only epoch, using local-time setters to encode it (so
    // local, not UTC, accessors recover the original time). But it also
    // parses a bare "yyyy-MM-dd" value (no time component at all, e.g. a
    // Fuelio row with no time recorded) into a real-year Date at midnight;
    // that's not a genuine time, so it's reported as absent instead of "00:00".
    const looksLikeRealCalendarDate = v.getFullYear() > 1901;
    if (looksLikeRealCalendarDate && v.getHours() === 0 && v.getMinutes() === 0 && v.getSeconds() === 0) {
      return undefined;
    }
    const h = String(v.getHours()).padStart(2, '0');
    const m = String(v.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  // Also pulls a trailing "HH:mm" off a combined "yyyy-MM-dd HH:mm" value
  // (Fuelio's single "Data" column carries both), and returns undefined for
  // a date-only value rather than passing through a non-time string.
  const match = String(v).trim().match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*$/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : undefined;
}

/**
 * A gas type is only useful as free text ("Regular (87)", "Premium"); some
 * sources (Fuelio's "FuelType") instead store an opaque numeric code into a
 * lookup table we don't have, which would otherwise slip through the
 * generic 'fueltype' alias and show up as a meaningless bare number.
 */
function toGasType(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v).trim();
  return /^\d+(\.\d+)?$/.test(s) ? undefined : s;
}

const VEHICLE_ALIASES = {
  name: ['vehiclename', 'name', 'vehicle', 'car'],
  make: ['manufacturer', 'make'],
  model: ['model'],
  year: ['year'],
  licensePlate: ['licenseplate', 'plate'],
  // 'tank1capacity' is Fuelio's column name.
  fuelCapacityGal: ['fuelcapacitygal', 'fuelcapacity', 'tanksize', 'tank1capacity'],
  active: ['active'],
  notes: ['notes'],
};

// Aliases below are shared across every source format: our own native CSV,
// Drivvo's xlsx, and Fuelio's CSV, plus reasonably-shaped CSVs from anywhere
// else. Where two formats disagree on what a given column name means (see
// pricePerGallon/totalCost below), each format's own header still normalizes
// to a distinct key, so there's no ambiguity in practice.
const FILLUP_ALIASES = {
  vehicleName: ['vehiclename', 'vehicle', 'car'],
  // Fuelio's "Data" column is a "yyyy-MM-dd[ HH:mm]" typo/localization of "Date".
  date: ['date', 'data'],
  time: ['time', 'data'],
  // 'odomi' is Fuelio's "Odo (mi)".
  odometer: ['odometermi', 'odometerkm', 'odometer', 'mileage', 'odomi'],
  gasType: ['gastype', 'fuel', 'fueltype'],
  // Fuelio's "VolumePrice" is its per-gallon price; its "Price (optional)"
  // (-> 'priceoptional') is the total, so it's listed under totalCost instead.
  pricePerGallon: ['pricegal', 'pricepergallon', 'price', 'volumeprice'],
  totalCost: ['totalcost', 'cost', 'total', 'priceoptional'],
  // 'fuelusgallons' is Fuelio's "Fuel (us gallons)".
  gallons: ['volume', 'gallons', 'gals', 'fuelusgallons'],
  // 'full' is Fuelio's own "Full" column.
  fullTank: ['filledtankcompletely', 'fulltank', 'full'],
  // 'missed' is Fuelio's own "Missed" column, with the same meaning we give it.
  missedFillup: ['missedfillupbefore', 'missedfillup', 'missed'],
  // 'cityoptional' is Fuelio's "City (optional)", which doubles as a station name.
  gasStation: ['gasstation', 'station', 'cityoptional', 'city'],
  notes: ['notes', 'notesoptional'],
};

const MAINTENANCE_ALIASES = {
  vehicleName: ['vehiclename', 'vehicle', 'car'],
  date: ['date'],
  // 'odo' is Fuelio's "## Costs" column.
  odometer: ['odometermi', 'odometerkm', 'odometer', 'odo'],
  totalCost: ['totalcost', 'cost', 'total'],
  // 'costtitle' is Fuelio's human-readable label (e.g. "Oil Change"); its
  // "CostTypeID" is only a numeric code into a separate lookup table.
  type: ['typeofservice', 'typeofexpense', 'type', 'costtitle'],
  location: ['servicelocation', 'expenselocation', 'location'],
  notes: ['notes'],
};

// AutoTrack's own service block: one row per service, grouped into a visit by
// "Record ID". The record-level columns repeat on every row of a visit.
const SERVICE_ROW_ALIASES = {
  recordId: ['recordid'],
  date: ['servicedate'],
  odometer: ['serviceodometer'],
  location: ['servicelocation'],
  totalCost: ['servicetotalcost'],
  name: ['service'],
  cost: ['servicecost'],
  notes: ['servicenotes'],
};

const RECURRING_ALIASES = {
  name: ['recurringservice'],
  intervalMiles: ['everymi'],
  intervalMonths: ['everymonths'],
};

export interface ImportSummary {
  vehiclesAdded: number;
  vehiclesUpdated: number;
  fillupsAdded: number;
  maintenanceAdded: number;
  schedulesAdded: number;
  skippedRows: number;
}

function isBlankRow(row: unknown[] | undefined): boolean {
  return !row || row.length === 0 || row.every((c) => c === null || c === undefined || String(c).trim() === '');
}

function rowToObject(headers: unknown[], values: unknown[]): Row {
  const obj: Row = {};
  headers.forEach((h, i) => {
    obj[String(h ?? '')] = values[i] ?? null;
  });
  return obj;
}

interface DetectedSource {
  vehicleRow: Row;
  fillupRows: Row[];
  /** Foreign-format cost/service rows (Fuelio "## Costs"): one service each. */
  maintenanceRows: Row[];
  /** Our own service block: one row per service, grouped into visits. */
  serviceRows?: Row[];
  recurringRows?: Row[];
}

/**
 * AutoTrack's own native single-file export: one CSV (or single-sheet .xlsx)
 * with a vehicle-info header + value row, then blank-line-separated blocks
 * for fillups, services and recurring services - see `buildVehicleCsv`.
 * Detected structurally (a "vehicle name" header with no "odometer" column,
 * followed by at least one recognizable block), not by file extension, so it
 * works for the .csv this app exports today, including older exports that
 * only have the fillup block. Returns null for anything else (a plain flat CSV,
 * a Drivvo-style multi-sheet workbook, etc.), which falls through to the
 * existing sheet-name-based import path below unchanged.
 */
function detectNativeCsv(wb: XLSX.WorkBook): DetectedSource | null {
  if (wb.SheetNames.length !== 1) return null;
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });

  let vehicleHeaderIdx = -1;
  for (let i = 0; i < aoa.length; i++) {
    if (isBlankRow(aoa[i])) continue;
    const headers = aoa[i].map((h) => normalizeHeader(String(h ?? '')));
    if (headers.includes('vehiclename') && !headers.some((h) => h.startsWith('odometer'))) {
      vehicleHeaderIdx = i;
    }
    break; // the first non-blank row must be the vehicle header, or this isn't our format
  }
  if (vehicleHeaderIdx === -1) return null;

  const vehicleValueRow = aoa[vehicleHeaderIdx + 1];
  if (isBlankRow(vehicleValueRow)) return null;
  const vehicleRow = rowToObject(aoa[vehicleHeaderIdx], vehicleValueRow);

  // Everything after the vehicle row is a series of blank-line-separated
  // blocks, each a header row plus data rows, told apart by their headers:
  // fillups, then (optionally) services and recurring services.
  const fillupRows: Row[] = [];
  const serviceRows: Row[] = [];
  const recurringRows: Row[] = [];
  let recognizedBlocks = 0;

  let i = vehicleHeaderIdx + 2;
  while (i < aoa.length) {
    if (isBlankRow(aoa[i])) {
      i++;
      continue;
    }
    const headerRow = aoa[i];
    const headers = headerRow.map((h) => normalizeHeader(String(h ?? '')));
    const target = headers.some((h) => h.startsWith('odometer'))
      ? fillupRows
      : headers.includes('serviceodometer')
        ? serviceRows
        : headers.includes('recurringservice')
          ? recurringRows
          : null;
    i++;
    while (i < aoa.length && !isBlankRow(aoa[i])) {
      if (target) target.push(rowToObject(headerRow, aoa[i]));
      i++;
    }
    if (target) recognizedBlocks++;
  }
  if (recognizedBlocks === 0) return null;

  return { vehicleRow, fillupRows, maintenanceRows: [], serviceRows, recurringRows };
}

/**
 * Fuelio's backup CSV: a "## Vehicle" marker row, a header + one value row,
 * then a "## Log" marker row, a header row, and one row per fillup. Detected
 * by those literal section markers, which is unambiguous and doesn't overlap
 * with any other supported format.
 */
function detectFuelioCsv(wb: XLSX.WorkBook): DetectedSource | null {
  if (wb.SheetNames.length !== 1) return null;
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });

  const isMarker = (row: unknown[] | undefined, marker: string) =>
    !!row && row.length > 0 && String(row[0] ?? '').trim().toLowerCase() === marker;
  // Fuelio's backup has several sections beyond Vehicle/Log (CostCategories,
  // Costs, FavStations, Category, ...), each starting with its own "## Name"
  // row. Any row shaped like that ends whatever section came before it.
  const isAnySectionMarker = (row: unknown[] | undefined) =>
    !!row && row.length > 0 && String(row[0] ?? '').trim().startsWith('##');

  /** Reads the header + data rows of one "## Marker" section, stopping at the next one. */
  function readSection(markerIdx: number): Row[] {
    const headerRow = aoa[markerIdx + 1];
    if (isBlankRow(headerRow)) return [];
    const rows: Row[] = [];
    for (let i = markerIdx + 2; i < aoa.length; i++) {
      if (isAnySectionMarker(aoa[i])) break;
      if (isBlankRow(aoa[i])) continue;
      rows.push(rowToObject(headerRow, aoa[i]));
    }
    return rows;
  }

  const vehicleMarkerIdx = aoa.findIndex((row) => isMarker(row, '## vehicle'));
  if (vehicleMarkerIdx === -1) return null;
  const vehicleRows = readSection(vehicleMarkerIdx);
  if (!vehicleRows.length) return null;

  const logMarkerIdx = aoa.findIndex((row, i) => i > vehicleMarkerIdx + 1 && isMarker(row, '## log'));
  if (logMarkerIdx === -1) return null;
  const fillupRows = readSection(logMarkerIdx);

  const costsMarkerIdx = aoa.findIndex((row, i) => i > logMarkerIdx + 1 && isMarker(row, '## costs'));
  const maintenanceRows = costsMarkerIdx !== -1 ? readSection(costsMarkerIdx) : [];

  return { vehicleRow: vehicleRows[0], fillupRows, maintenanceRows };
}

/**
 * xlsx (zip) and xls (OLE) are binary and SheetJS reads them as-is. A CSV has
 * no encoding marker, and handing SheetJS its raw bytes makes it guess Latin-1,
 * which mangles curly quotes, accents and degree signs, so decode it ourselves.
 */
function readWorkbook(buf: ArrayBuffer): XLSX.WorkBook {
  const bytes = new Uint8Array(buf);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf;
  if (isZip || isOle) return XLSX.read(bytes, { type: 'array', cellDates: true });
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Not valid UTF-8: an older Windows export, most likely.
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return XLSX.read(text, { type: 'string', cellDates: true });
}

/** Strictly increasing timestamps, so records created by one import keep their file order. */
function createdAtStamper(): () => string {
  let last = Date.now();
  return () => new Date(++last).toISOString();
}

export async function importFile(file: File): Promise<ImportSummary> {
  const buf = await file.arrayBuffer();
  const wb = readWorkbook(buf);
  const stamp = createdAtStamper();

  const summary: ImportSummary = {
    vehiclesAdded: 0,
    vehiclesUpdated: 0,
    fillupsAdded: 0,
    maintenanceAdded: 0,
    schedulesAdded: 0,
    skippedRows: 0,
  };

  const existingVehicles = await db.vehicles.toArray();
  const vehicleByName = new Map<string, Vehicle>(
    existingVehicles.map((v) => [v.name.trim().toLowerCase(), v]),
  );

  // Set below when the vehicle source has exactly one row: a fillup/maintenance
  // row with no vehicle name (our own single-vehicle export omits that column,
  // since the whole file is already scoped to one vehicle) attaches to that
  // vehicle instead of falling back to a generic "Imported Vehicle" stub.
  let singleVehicleId: string | undefined;

  async function findOrCreateVehicle(name: string | undefined): Promise<string> {
    const trimmedName = name?.trim();
    if (!trimmedName && singleVehicleId) return singleVehicleId;
    const cleanName = trimmedName || 'Imported Vehicle';
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

  const detected = detectNativeCsv(wb) ?? detectFuelioCsv(wb);

  let vehicleRows: Row[];
  let fillupRowGroups: Row[][];
  let maintenanceRowGroups: Row[][];
  const serviceRows = detected?.serviceRows ?? [];
  const recurringRows = detected?.recurringRows ?? [];

  if (detected) {
    vehicleRows = [detected.vehicleRow];
    fillupRowGroups = [detected.fillupRows];
    maintenanceRowGroups = detected.maintenanceRows.length ? [detected.maintenanceRows] : [];
  } else {
    // --- Vehicles sheet (Drivvo-style, optional) ---
    const vehiclesSheetName = findSheet('Vehicles');
    vehicleRows = vehiclesSheetName
      ? XLSX.utils.sheet_to_json<Row>(wb.Sheets[vehiclesSheetName], { defval: null })
      : [];

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
    fillupRowGroups = fillupSheetNames.map((name) =>
      XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], { defval: null }),
    );
    maintenanceRowGroups = maintenanceSheetNames.map((name) =>
      XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], { defval: null }),
    );
  }

  for (const row of vehicleRows) {
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
    // Some sources (Fuelio, when a tank size was never entered) write 0 rather
    // than leaving it blank; 0 gallons isn't a real tank, so treat it as unset.
    if (cap !== undefined && cap > 0) vehicle.fuelCapacityGal = cap;
    vehicle.active = toBool(pick(nrow, VEHICLE_ALIASES.active), true);
    const notes = pick(nrow, VEHICLE_ALIASES.notes);
    if (notes) vehicle.notes = String(notes);

    await db.vehicles.put(vehicle);
    vehicleByName.set(key, vehicle);
    if (existing) summary.vehiclesUpdated++;
    else summary.vehiclesAdded++;

    if (vehicleRows.length === 1) singleVehicleId = vehicle.id;
  }

  const newFillups: Fillup[] = [];
  for (const rows of fillupRowGroups) {
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
        time: toTimeString(pick(nrow, FILLUP_ALIASES.time)),
        odometer,
        gasType: toGasType(pick(nrow, FILLUP_ALIASES.gasType)) ?? 'Regular (87)',
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

  // --- Foreign-format Services / Expenses / Costs: one single-service record each ---
  const newMaintenance: MaintenanceRecord[] = [];
  for (const rows of maintenanceRowGroups) {
    for (const row of rows) {
      const nrow = normalizedRow(row);
      const odometer = toNumber(pick(nrow, MAINTENANCE_ALIASES.odometer));
      if (odometer === undefined) {
        // Can't place a service on the odometer timeline without a reading.
        summary.skippedRows++;
        continue;
      }
      const vehicleName = pick(nrow, MAINTENANCE_ALIASES.vehicleName) as string | undefined;
      const totalCost = toNumber(pick(nrow, MAINTENANCE_ALIASES.totalCost));
      newMaintenance.push({
        id: uuidv4(),
        vehicleId: await findOrCreateVehicle(vehicleName),
        date: toDateString(pick(nrow, MAINTENANCE_ALIASES.date)),
        odometer,
        totalCost,
        location: (pick(nrow, MAINTENANCE_ALIASES.location) as string) ?? undefined,
        services: [{ name: String(pick(nrow, MAINTENANCE_ALIASES.type) ?? '').trim() || 'Service', cost: totalCost }],
        notes: (pick(nrow, MAINTENANCE_ALIASES.notes) as string) ?? undefined,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // --- Our own service block: rows sharing a Record ID are one visit ---
  const visits = new Map<string, MaintenanceRecord>();
  for (const row of serviceRows) {
    const nrow = normalizedRow(row);
    const odometer = toNumber(pick(nrow, SERVICE_ROW_ALIASES.odometer));
    const name = String(pick(nrow, SERVICE_ROW_ALIASES.name) ?? '').trim();
    if (odometer === undefined || !name) {
      summary.skippedRows++;
      continue;
    }
    const date = toDateString(pick(nrow, SERVICE_ROW_ALIASES.date));
    const location = (pick(nrow, SERVICE_ROW_ALIASES.location) as string) ?? undefined;
    // Older/hand-edited files may lack Record IDs; fall back to date + odometer + shop.
    const groupKey = String(pick(nrow, SERVICE_ROW_ALIASES.recordId) ?? `${date}|${odometer}|${location ?? ''}`);
    const service: ServiceItem = { name, cost: toNumber(pick(nrow, SERVICE_ROW_ALIASES.cost)) };
    const existing = visits.get(groupKey);
    if (existing) {
      existing.services.push(service);
      existing.totalCost ??= toNumber(pick(nrow, SERVICE_ROW_ALIASES.totalCost));
      existing.notes ??= (pick(nrow, SERVICE_ROW_ALIASES.notes) as string) ?? undefined;
      continue;
    }
    visits.set(groupKey, {
      id: uuidv4(),
      // Our export is always scoped to one vehicle (see singleVehicleId).
      vehicleId: await findOrCreateVehicle(undefined),
      date,
      odometer,
      location,
      totalCost: toNumber(pick(nrow, SERVICE_ROW_ALIASES.totalCost)),
      services: [service],
      notes: (pick(nrow, SERVICE_ROW_ALIASES.notes) as string) ?? undefined,
      createdAt: stamp(),
    });
  }
  newMaintenance.push(...visits.values());
  if (newMaintenance.length) {
    await db.maintenance.bulkPut(newMaintenance);
    summary.maintenanceAdded += newMaintenance.length;
  }

  // --- Recurring services: one schedule per vehicle + service name ---
  if (recurringRows.length) {
    const vehicleId = await findOrCreateVehicle(undefined);
    const existingSchedules = await db.schedules.where('vehicleId').equals(vehicleId).toArray();
    const byName = new Map<string, ServiceSchedule>(existingSchedules.map((sc) => [serviceKey(sc.serviceName), sc]));
    for (const row of recurringRows) {
      const nrow = normalizedRow(row);
      const name = String(pick(nrow, RECURRING_ALIASES.name) ?? '').trim();
      const intervalMiles = toNumber(pick(nrow, RECURRING_ALIASES.intervalMiles));
      const intervalMonths = toNumber(pick(nrow, RECURRING_ALIASES.intervalMonths));
      if (!name || (!intervalMiles && !intervalMonths)) {
        summary.skippedRows++;
        continue;
      }
      const current = byName.get(serviceKey(name));
      const schedule: ServiceSchedule = {
        id: current?.id ?? uuidv4(),
        vehicleId,
        serviceName: name,
        intervalMiles: intervalMiles || undefined,
        intervalMonths: intervalMonths || undefined,
        createdAt: current?.createdAt ?? stamp(),
      };
      await db.schedules.put(schedule);
      byName.set(serviceKey(name), schedule);
      if (!current) summary.schedulesAdded++;
    }
  }

  return summary;
}

function downloadBlob(filename: string, content: BlobPart, mime: string) {
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

/**
 * Builds one vehicle's data as AutoTrack's native single-file CSV: a vehicle
 * info header + value row, then blank-line-separated blocks for fillups,
 * services (one row per service) and recurring services. `detectNativeCsv` recognizes this exact shape on import, so
 * this file can be dropped straight back into Import to restore or move a
 * vehicle's data, without any special-cased round-trip logic.
 */
export async function buildVehicleCsv(vehicleId: string): Promise<{ text: string; vehicleName: string }> {
  const vehicle = await db.vehicles.get(vehicleId);
  if (!vehicle) throw new Error('Vehicle not found');
  const fillups = await db.fillups.where('vehicleId').equals(vehicleId).toArray();
  const records = await db.maintenance.where('vehicleId').equals(vehicleId).toArray();
  const schedules = await db.schedules.where('vehicleId').equals(vehicleId).toArray();

  const vehicleRows = [
    {
      'Vehicle Name': vehicle.name,
      Manufacturer: vehicle.make ?? '',
      Model: vehicle.model ?? '',
      Year: vehicle.year ?? '',
      'License plate': vehicle.licensePlate ?? '',
      'Fuel capacity(gal)': vehicle.fuelCapacityGal ?? '',
      Active: vehicle.active ? 'Yes' : 'No',
      Notes: vehicle.notes ?? '',
    },
  ];

  const fillupRows = fillups
    .sort((a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer || (a.time ?? '').localeCompare(b.time ?? ''))
    .map((f) => ({
      Date: f.date,
      Time: f.time ?? '',
      Odometer: f.odometer,
      'Gas Type': f.gasType,
      'Price Per Gallon': f.pricePerGallon !== undefined ? Number(f.pricePerGallon.toFixed(3)) : '',
      'Total Cost': f.totalCost !== undefined ? Number(f.totalCost.toFixed(2)) : '',
      Gallons: f.gallons !== undefined ? Number(f.gallons.toFixed(3)) : '',
      'Full Tank': f.fullTank ? 'Yes' : 'No',
      'Missed Fillup Before': f.missedFillup ? 'Yes' : 'No',
      'Gas Station': f.gasStation ?? '',
      Notes: f.notes ?? '',
    }));

  // One row per service; a visit's shared fields repeat on each of its rows
  // and are tied together by "Record ID" on import.
  // Visits on the same date and odometer fall back to creation order, so
  // exporting the same data always produces the same file.
  const serviceRows = records
    .sort((a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer || a.createdAt.localeCompare(b.createdAt))
    .flatMap((r, idx) =>
      r.services.map((svc) => ({
        'Record ID': idx + 1,
        'Service Date': r.date,
        'Service Odometer': r.odometer,
        'Service Location': r.location ?? '',
        'Service Total Cost': r.totalCost !== undefined ? Number(r.totalCost.toFixed(2)) : '',
        Service: svc.name,
        'Service Cost': svc.cost !== undefined ? Number(svc.cost.toFixed(2)) : '',
        'Service Notes': r.notes ?? '',
      })),
    );

  const recurringRows = schedules
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.serviceName.localeCompare(b.serviceName))
    .map((sc) => ({
      'Recurring Service': sc.serviceName,
      'Every (mi)': sc.intervalMiles ?? '',
      'Every (months)': sc.intervalMonths ?? '',
    }));

  const toCsv = (rows: object[]) => XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows)).trimEnd();
  const blocks = [toCsv(vehicleRows), toCsv(fillupRows)];
  if (serviceRows.length) blocks.push(toCsv(serviceRows));
  if (recurringRows.length) blocks.push(toCsv(recurringRows));
  const text = blocks.join('\n\n') + '\n';

  return { text, vehicleName: vehicle.name };
}

/**
 * The Android/iOS WebView ignores `<a download>` blob links, so on a device we
 * write the file to the app cache and hand it to the system share sheet
 * (save to Files/Drive, email, etc.). The browser build still downloads directly.
 */
async function saveFile(filename: string, text: string) {
  if (!Capacitor.isNativePlatform()) {
    downloadBlob(filename, text, 'text/csv');
    return;
  }
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  try {
    await Share.share({ title: filename, dialogTitle: 'Export vehicle data', url: uri });
  } catch (err) {
    // Dismissing the share sheet rejects on some platforms; that isn't an error.
    if (!/cancel/i.test(err instanceof Error ? err.message : String(err))) throw err;
  }
}

export async function exportVehicleCsv(vehicleId: string) {
  const { text, vehicleName } = await buildVehicleCsv(vehicleId);
  const safeName = vehicleName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'vehicle';
  await saveFile(`autotrack-${safeName}-${toDateString(new Date())}.csv`, text);
}
