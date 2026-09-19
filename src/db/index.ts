import Dexie, { type Table } from 'dexie';
import type { Vehicle, Fillup, MaintenanceRaw, MaintenanceRecord, ServiceSchedule } from '../types';

export class AutoTrackDB extends Dexie {
  vehicles!: Table<Vehicle, string>;
  fillups!: Table<Fillup, string>;
  /** Legacy stash of imported Drivvo/Fuelio rows; superseded by `maintenance`. */
  maintenanceRaw!: Table<MaintenanceRaw, string>;
  maintenance!: Table<MaintenanceRecord, string>;
  schedules!: Table<ServiceSchedule, string>;

  constructor() {
    super('autotrack');
    this.version(1).stores({
      vehicles: 'id, name, active',
      fillups: 'id, vehicleId, date, odometer',
      maintenanceRaw: 'id, vehicleId, date',
    });
    this.version(2)
      .stores({
        maintenance: 'id, vehicleId, date, odometer',
        schedules: 'id, vehicleId',
      })
      .upgrade(async (tx) => {
        // Promote previously stashed imports into real records. The raw rows
        // are left in place, so nothing is lost. Rows without a vehicle,
        // date or odometer can't be placed on a timeline and stay raw-only.
        const raws = await tx.table<MaintenanceRaw, string>('maintenanceRaw').toArray();
        const records: MaintenanceRecord[] = [];
        for (const r of raws) {
          if (!r.vehicleId || !r.date || r.odometer === undefined) continue;
          records.push({
            id: r.id,
            vehicleId: r.vehicleId,
            date: r.date,
            odometer: r.odometer,
            location: r.location,
            totalCost: r.totalCost,
            services: [{ name: r.type?.trim() || 'Service', cost: r.totalCost }],
            notes: r.notes,
            createdAt: r.createdAt,
          });
        }
        await tx.table<MaintenanceRecord, string>('maintenance').bulkPut(records);
      });
  }
}

export const db = new AutoTrackDB();
