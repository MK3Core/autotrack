import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import type { Fillup, MaintenanceRecord, ServiceSchedule } from '../types';

/** A reminder starts showing this many miles before its due odometer... */
export const REMINDER_MILES_WINDOW = 200;
/** ...or this many days before its due date, whichever is hit first. */
export const REMINDER_DAYS_WINDOW = 5;

export function serviceKey(name: string): string {
  return name.trim().toLowerCase();
}

export function todayString(): string {
  return toDateString(new Date());
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Adds calendar months, clamping to month end (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(dateStr: string, months: number): string {
  const d = parseDate(dateStr);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toDateString(d);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

/** The highest odometer known for a vehicle, across fillups and service visits. */
export function latestOdometer(fillups: Fillup[], records: MaintenanceRecord[]): number | null {
  const all = [...fillups.map((f) => f.odometer), ...records.map((r) => r.odometer)];
  return all.length ? Math.max(...all) : null;
}

/** Newest record containing this service, or undefined if it's never been done. */
export function lastPerformed(
  records: MaintenanceRecord[],
  serviceName: string,
): MaintenanceRecord | undefined {
  const key = serviceKey(serviceName);
  return records
    .filter((r) => r.services.some((s) => serviceKey(s.name) === key))
    .sort((a, b) => b.date.localeCompare(a.date) || b.odometer - a.odometer)[0];
}

export interface Reminder {
  schedule: ServiceSchedule;
  last: MaintenanceRecord;
  dueOdometer?: number;
  dueDate?: string;
  /** Negative when overdue. Undefined when the schedule has no mileage interval. */
  milesRemaining?: number;
  daysRemaining?: number;
}

/**
 * Where one schedule stands: when it's next due by mileage and/or date, and
 * how far off that is. Null when it's never been performed, since there's
 * no baseline to measure from.
 */
export function scheduleStatus(
  schedule: ServiceSchedule,
  records: MaintenanceRecord[],
  currentOdometer: number | null,
  today: string = todayString(),
): Reminder | null {
  const last = lastPerformed(records, schedule.serviceName);
  if (!last) return null;

  const status: Reminder = { schedule, last };
  if (schedule.intervalMiles) {
    status.dueOdometer = last.odometer + schedule.intervalMiles;
    if (currentOdometer !== null) status.milesRemaining = status.dueOdometer - currentOdometer;
  }
  if (schedule.intervalMonths) {
    status.dueDate = addMonths(last.date, schedule.intervalMonths);
    status.daysRemaining = daysBetween(today, status.dueDate);
  }
  return status;
}

/** True once a schedule is inside its warning window (or already overdue). */
export function isReminderDue(r: Reminder): boolean {
  return (
    (r.milesRemaining !== undefined && r.milesRemaining <= REMINDER_MILES_WINDOW) ||
    (r.daysRemaining !== undefined && r.daysRemaining <= REMINDER_DAYS_WINDOW)
  );
}

/** Every schedule that's inside its warning window, most urgent first. */
export function computeReminders(
  schedules: ServiceSchedule[],
  records: MaintenanceRecord[],
  currentOdometer: number | null,
  today: string = todayString(),
): Reminder[] {
  const reminders = schedules
    .map((s) => scheduleStatus(s, records, currentOdometer, today))
    .filter((r): r is Reminder => r !== null && isReminderDue(r));

  // Urgency: compare each reminder's closest-to-due measure as a fraction of
  // its own window so miles and days sort against each other sensibly.
  const urgency = (r: Reminder) =>
    Math.min(
      r.milesRemaining !== undefined ? r.milesRemaining / REMINDER_MILES_WINDOW : Infinity,
      r.daysRemaining !== undefined ? r.daysRemaining / REMINDER_DAYS_WINDOW : Infinity,
    );
  return reminders.sort((a, b) => urgency(a) - urgency(b));
}

const plural = (n: number, unit: string) => `${n.toLocaleString()} ${unit}${n === 1 ? '' : 's'}`;

/** e.g. "due in 100 mi", "overdue by 3 days", "due in 150 mi · due in 2 days". */
export function describeReminder(r: Reminder): string {
  const parts: string[] = [];
  const add = (remaining: number | undefined, limit: number, label: (n: number) => string, nowText: string) => {
    if (remaining === undefined || remaining > limit) return;
    if (remaining < 0) parts.push(`overdue by ${label(-remaining)}`);
    else if (remaining === 0) parts.push(nowText);
    else parts.push(`due in ${label(remaining)}`);
  };
  add(r.milesRemaining, REMINDER_MILES_WINDOW, (n) => `${n.toLocaleString()} mi`, 'due now');
  add(r.daysRemaining, REMINDER_DAYS_WINDOW, (n) => plural(n, 'day'), 'due today');
  return parts.join(' · ');
}

export function describeInterval(s: Pick<ServiceSchedule, 'intervalMiles' | 'intervalMonths'>): string {
  const parts: string[] = [];
  if (s.intervalMiles) parts.push(`${s.intervalMiles.toLocaleString()} mi`);
  if (s.intervalMonths) parts.push(plural(s.intervalMonths, 'month'));
  return parts.length === 2 ? `Every ${parts[0]} or ${parts[1]}` : `Every ${parts[0] ?? '?'}`;
}

export interface ScheduleChoice {
  serviceName: string;
  /** null = one-time; anything else (re)creates/updates the schedule. */
  repeat: { intervalMiles?: number; intervalMonths?: number } | null;
}

/**
 * Saves a record and applies each service's repeat choice: repeating services
 * upsert their schedule (one per vehicle + service name), one-time ones end
 * any schedule that was running for that service.
 */
export async function saveMaintenanceRecord(
  record: MaintenanceRecord,
  choices: ScheduleChoice[],
): Promise<void> {
  await db.transaction('rw', db.maintenance, db.schedules, async () => {
    await db.maintenance.put(record);
    const existing = await db.schedules.where('vehicleId').equals(record.vehicleId).toArray();
    for (const choice of choices) {
      const key = serviceKey(choice.serviceName);
      const current = existing.find((s) => serviceKey(s.serviceName) === key);
      if (!choice.repeat) {
        if (current) await db.schedules.delete(current.id);
        continue;
      }
      await db.schedules.put({
        id: current?.id ?? uuidv4(),
        vehicleId: record.vehicleId,
        serviceName: choice.serviceName,
        intervalMiles: choice.repeat.intervalMiles,
        intervalMonths: choice.repeat.intervalMonths,
        createdAt: current?.createdAt ?? new Date().toISOString(),
      });
    }
  });
}

export async function deleteVehicleMaintenance(vehicleId: string): Promise<void> {
  await db.maintenance.where('vehicleId').equals(vehicleId).delete();
  await db.schedules.where('vehicleId').equals(vehicleId).delete();
}
