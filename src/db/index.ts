import Dexie, { type Table } from 'dexie';
import type { Vehicle, Fillup, MaintenanceRaw } from '../types';

export class AutoTrackDB extends Dexie {
  vehicles!: Table<Vehicle, string>;
  fillups!: Table<Fillup, string>;
  maintenanceRaw!: Table<MaintenanceRaw, string>;

  constructor() {
    super('autotrack');
    this.version(1).stores({
      vehicles: 'id, name, active',
      fillups: 'id, vehicleId, date, odometer',
      maintenanceRaw: 'id, vehicleId, date',
    });
  }
}

export const db = new AutoTrackDB();
