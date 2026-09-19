import { db } from '../db';

/** Wipes every table so the app starts over as if freshly installed. */
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.vehicles, db.fillups, db.maintenanceRaw, db.maintenance, db.schedules, async () => {
    await Promise.all([
      db.vehicles.clear(),
      db.fillups.clear(),
      db.maintenanceRaw.clear(),
      db.maintenance.clear(),
      db.schedules.clear(),
    ]);
  });
  // The selected-vehicle pointer would otherwise dangle at a deleted id.
  try {
    localStorage.removeItem('autotrack.selectedVehicleId');
  } catch {
    // storage unavailable; nothing to clean up
  }
}
