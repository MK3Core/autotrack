# Feature Backlog

Ideas and known gaps that are deliberately deferred, not forgotten. Nothing
here is scheduled; it's a record of "later" decisions so they don't get
re-litigated or lost between sessions.

## Backend + sync service

Right now AutoTrack is fully client-side: all data lives in the browser's
IndexedDB (see `src/db/index.ts`), with no server and no sync. That means
data is tied to one browser/device, isn't backed up automatically, and won't
carry over to a new phone or a reinstalled app without a manual CSV export/
import.

A real backend would change that: a server + database, user accounts (or at
least a per-install device key), and a sync protocol so the same data shows
up across devices in near-real-time. This is a meaningfully bigger step than
anything built so far (hosting, auth, conflict resolution when the same
vehicle is edited offline on two devices, etc.), so it's parked here rather
than being a natural next increment.

Not a current priority, but the direction to build toward eventually.

## Maintenance / service records

Drivvo's Services/Expenses sheets and Fuelio's "## Costs" section are
already parsed on import and stashed as-is in the `maintenanceRaw` table
(`src/types/index.ts`, `src/lib/importExport.ts`), so nothing is lost when
importing from either app. There's no UI for this data yet: no maintenance
log, no entry form, no reports. Building that out (oil changes, repairs,
registration, etc., alongside fillups) is the natural next feature after the
backend question above.

## Android / iOS app packaging

Capacitor is scaffolded (`android/`, `capacitor.config.ts`) but no APK has
been built yet — that was deliberately deferred to focus on web
functionality first (see conversation history). Building the actual signed
APK needs an Android SDK + JDK toolchain that isn't set up on this machine
yet; iOS packaging hasn't been scaffolded at all. Revisit once the web app's
feature set feels stable.

## Mobile keyboard verification

The fillup form's numeric fields (notably Total Cost, which uses
`type="text" inputMode="decimal"` to get proper currency formatting) should
be checked on a real phone to confirm the numeric keypad appears as
expected rather than the full keyboard. Not verified yet in this
environment (no device/browser testing available here).
