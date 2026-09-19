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

## iOS app packaging

Android is done: Capacitor builds a signed release APK via GitHub Actions
(`.github/workflows/release-apk.yml`) on every `vX.Y.Z` tag push, published
as a GitHub Release that Obtainium tracks for updates on-device. iOS
packaging hasn't been scaffolded at all yet (no `ios/` project, no signing
setup, no distribution path). Revisit if/when an iPhone install is wanted.

## Mobile keyboard verification

The fillup form's numeric fields (notably Total Cost, which uses
`type="text" inputMode="decimal"` to get proper currency formatting) should
be checked on a real phone to confirm the numeric keypad appears as
expected rather than the full keyboard. Not verified yet.

## Android back gesture / back button crashes the app

Swiping in from the edge (or the Android back gesture/button generally)
crashes the app instead of navigating back. Capacitor's WebView doesn't
automatically wire Android's back gesture into the app's own routing (React
Router's `HashRouter`) - it needs an explicit native-side listener
(`App.addListener('backButton', ...)` from `@capacitor/app`) that's not
currently installed or configured. Without it, Android's default handling
is likely conflicting with the SPA's routing state in a way that crashes
rather than gracefully falling through.

Desired behavior once fixed: the back gesture should do exactly what the
in-app `BackButton` component does (`src/components/BackButton.tsx`) -
navigate back in history, or fall through to the Log page on a top-level
screen that has no back button of its own (Log, Reports, Vehicles, Data).
Ideally the same navigation logic gets shared between the two rather than
reimplemented separately.

Not yet investigated in depth - root cause above is a reasonable guess, not
a confirmed diagnosis.
