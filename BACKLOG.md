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
