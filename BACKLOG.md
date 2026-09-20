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
vehicle is edited offline on two devices, ongoing running cost), so it's
parked here rather than being a natural next increment.

Not a current priority, but the direction to build toward eventually. Notes
from investigating it:

- **Privacy shapes the design.** Sync should be end-to-end encrypted: the
  client encrypts with a key derived from a user passphrase and the server
  only ever stores ciphertext, so the operator can't read anyone's fillups or
  service history. The cost is that the server can't offer any feature that
  needs to read the data.
- **Cheapest first step: an encrypted backup file, no server.** Let the user
  export an encrypted snapshot to wherever they like (Android share sheet or
  storage picker: Drive, Nextcloud, a USB stick). That delivers "my data
  survives a lost phone" with no hosting, accounts or running cost, and is
  most of what "cloud backup" means to a single-user app.
- **The schema has to change first.** Records only carry `createdAt`
  (`src/types/index.ts`) and deletes are hard deletes (for example
  `deleteVehicleMaintenance` in `src/lib/maintenance.ts`). Sync needs an
  `updatedAt` on every record plus tombstones for deletes, so a deletion on
  one device propagates instead of being resurrected by another. That's a new
  Dexie version in `src/db/index.ts`.
- **Conflict handling can stay simple.** One person on one or two devices:
  per-record last-writer-wins on `updatedAt` is enough. CRDT libraries
  (Automerge, Yjs) and Postgres-backed sync engines (PowerSync, ElectricSQL)
  solve harder problems than this app has, and would mean moving off Dexie.
- **Hosted option worth evaluating: Dexie Cloud.** The app already uses Dexie
  and already uses UUID string ids. At the time of writing it's free for up
  to 3 production users and starts around $3/month for 25 seats, with a paid
  self-host license. It isn't end-to-end encrypted out of the box (E2EE means
  pairing it with a separate encryption addon), so check how that interacts
  with indexed fields before committing.
- **The document vault stays out of sync.** See "Secure document vault"
  below; vault contents are excluded from any sync or backup by default.
- **Keep it separate from events.** If "Local events" below is ever built, it
  must not share accounts or identifiers with this service.

## Launch name: Glovebox

Working name for the v1.0 launch is **Glovebox**. It also pairs nicely with
the "Glovebox notebook" theme below.

The catch is that the name is crowded. Google Play and the App Store already
list several vehicle apps called Glovebox or GloveBox (a garage assistant, a
fuel and expense tracker, a vehicle documents manager, the Glovebox Reminder
app, GEICO's GloveBox, Digital Glovebox). A public store listing would
compete with them in search and could draw a trademark objection. No legal
clearance has been done. Before committing to it for a store launch: run a
USPTO trademark search, and consider a distinctive variant. If the app stays
a sideloaded GitHub Release, the risk is much lower.

Renaming mechanics, so it stays a small change:

- The display name is in `capacitor.config.ts` (`appName`),
  `android/app/src/main/res/values/strings.xml` (`app_name`,
  `title_activity_main`), `index.html`, and the in-app strings in
  `src/components/VehicleSwitcher.tsx`, `src/pages/Log.tsx` and
  `src/pages/ImportExport.tsx`.
- Leave the `applicationId` (`com.autotrack.app`) alone. Changing it makes
  Android treat the app as a different one, which would break Obtainium
  updates and orphan existing installs and their data.

## Android Auto Backup is on

`android/app/src/main/AndroidManifest.xml` sets `android:allowBackup="true"`
with no backup rules. Auto Backup and device-to-device transfer therefore
take the app's whole private data directory, which includes the WebView's
IndexedDB (where all the app's data lives).

- Today that is an accidental, unreliable cloud backup. IndexedDB is copied
  file by file while the app may be running, and torn restores have been
  reported in other WebView apps.
- It has to be settled before the document vault exists: add
  `android:dataExtractionRules` (Android 12+) and `android:fullBackupContent`
  (older) so anything sensitive is excluded from both cloud backup and device
  transfer. The rules can exclude just the vault directory while leaving the
  rest alone, or turn backup off entirely if an explicit backup feature
  replaces it.

## Service schedule templates by make and model

Keep a database of manufacturer-recommended services per make/model/year, so
a new vehicle's repeating reminders populate automatically instead of the
user entering each one by hand.

Viable, and the best fit with the current app; it can be done fully offline.

- `Vehicle` already has optional `make`, `model` and `year`. Matching on
  those needs no VIN, so nothing identifying has to leave the device. NHTSA's
  free vPIC API can decode a VIN into make/model/year/trim/engine to prefill
  the vehicle, but it carries no maintenance data.
- The interval data is the hard part. Complete OEM schedules are sold by
  commercial providers (MOTOR, DataOne, Vehicle Databases, TorqueNode);
  pricing and terms haven't been looked at. The alternative is a small
  hand-curated dataset from owner's manuals, starting with generic defaults
  (oil, tire rotation, brake fluid, and so on) plus a handful of popular
  models. Intervals are facts, but copying manual text or a licensed
  compilation wholesale is a copyright question to settle first.
- Model gap: `ServiceSchedule` only means "repeat every N miles and/or M
  months". Manufacturers publish milestone schedules ("at 30k do X"),
  separate normal and severe-use intervals, and vary by trim and engine.
  Templates need a way to map those onto repeating intervals and to pick
  normal vs severe.
- Baseline gap: `scheduleStatus` in `src/lib/maintenance.ts` returns null for
  a service that has never been logged, because reminders are measured from
  the last time it was done. Auto-populated schedules need a first-run prompt
  ("when was this last done?") or a fallback baseline, otherwise the new
  reminders never fire.
- Ship the data bundled with the app (or as a static file), not through a
  per-user lookup, so it stays private and works offline.

**Monetization via manufacturers and dealerships** is speculative. Dealers do
pay for service-retention and lead-generation tools, but:

- Intervals from a manufacturer-funded source lose credibility. Users may
  read them as an upsell.
- Selling leads or data needs identifying data, which conflicts with the
  privacy stance. Vehicle data selling is under regulatory scrutiny (the 2025
  FTC action involving GM and OnStar).
- If pursued, keep it opt-in and non-tracking: a "find a dealer or shop"
  button, or clearly labeled sponsored placement, with no user-level data
  shared.

Don't build data collection for it. Revisit once there's a user base.

## Secure document vault

Store a driver's license, insurance card and similar documents in the app,
with no remote backup and no knowledge of their contents on our side.

Viable on Android for the insurance card and registration. Treat the license
carefully.

- **What it can legitimately be.** A photo of a license is not valid ID in
  any state; only mobile driver's licenses cryptographically signed by the
  state count (in Apple, Google or Samsung Wallet, or a state app, currently
  around 14 states), and this app can't issue those. So a license here is a
  reference copy. Electronic proof of insurance is accepted in 49 states and
  DC (New Mexico doesn't require police to accept it), which makes the
  insurance card the highest-value document. Consider pointing users at their
  wallet app for a real mDL rather than competing with it.
- **Design.** Encrypt each document with an AES-GCM key generated in the
  Android Keystore (hardware-backed, StrongBox where the device has it) and
  require biometric or device credential to use it. Store ciphertext as
  app-private files, not in IndexedDB. The WebView's WebCrypto can't use
  Keystore keys as far as I know, so this needs a small native Capacitor
  plugin. Existing plugins (`@aparajita/capacitor-secure-storage`,
  `capacitor-biometric-keychain`) keep small strings in SharedPreferences,
  which suits holding a key but not images; evaluate them for that.
- **Hardening.** `FLAG_SECURE` (blocks screenshots and recents thumbnails),
  auto-lock when the app leaves the foreground, and no document contents in
  logs. The CSV export and the Clear data flow must handle the vault
  deliberately rather than by accident.
- **Consequence of no backup.** A lost or wiped phone means the documents are
  gone, and Keystore keys are invalidated when the user's enrolled biometrics
  change. The UI has to say plainly that these are convenience copies and the
  originals should be kept. Any backup added later should be a
  passphrase-encrypted export the user controls, never part of sync.
- **Prerequisite:** the Auto Backup item above.
- **Be honest about the threat model.** It protects against casual access, a
  lost phone and backup leakage. It does not protect against a rooted device
  while the vault is unlocked.

## Local events with anonymous RSVP

Users post events (car meets and the like); anyone within some range sees
them and can RSVP anonymously. Privacy and lack of tracking are the point.

Technically feasible, but it's a second product rather than a feature of the
tracker, and the largest and riskiest idea here. Last in line.

- **Separate server, no accounts.** It must not be the sync backend and must
  share no identifiers with it, or the no-tracking claim can't be defended.
- **Coarse location.** The client sends a geohash cell instead of
  coordinates and asks for events in the neighboring cells. Cell size trades
  privacy against precision. The server still sees IP addresses, which needs
  its own answer.
- **Anonymous RSVPs invite abuse.** Without accounts, nothing stops inflated
  counts or spam events. The likely direction is rate-limited anonymous
  tokens (Privacy Pass style blind signatures), issued after device
  attestation such as Play Integrity. That's my judgment, not something
  confirmed to work for RSVPs, so prototype it before committing.
- **Moderation is mandatory.** Google Play's user-generated-content policy
  requires acceptance of terms before posting, in-app reporting on all
  content, blocking, and ongoing moderation. That is a standing time cost and
  pulls against fully anonymous posters. In-person meetups also carry safety
  and liability questions (illegal street events, for one).
- **Organizers need to edit or cancel.** A per-event secret key held on the
  device works without an account.
- **Cold start.** An events list is useless where there are few users, so it
  would need to launch in one region or niche.
- **De-risk first.** Test demand with a static, hand-curated listing for one
  area before building any of the above.

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

## Selectable themes

The app is always dark today (`src/index.css` defines one set of color
variables on `:root`, and `src/main.tsx` hard-codes light status bar icons
for it). The default dark look stays, but a theme picker should offer more:

- **Light mode.** A straightforward light palette. Needs the native side to
  follow along: status/nav bar colors (`capacitor.config.ts`) and the
  status bar icon style call in `src/main.tsx` are both currently fixed for
  dark. Recharts colors in `src/pages/Reports.tsx` are also picked with a
  dark background in mind.
- **Glovebox notebook.** A hand-written, paper-notebook look, like an old
  guy keeping a written log in the glovebox: ruled or lined paper
  background, handwriting-style font, ink-on-paper colors, maybe
  pen-underline touches. Purely a visual skin over the same screens.

Most of the app already reads colors from CSS variables, so a theme is
mostly a swapped variable set. A few colors are hard-coded (for example the
`#3f78e0` hover in `.btn-primary`) and would need to move to variables first.
The choice should persist across launches (localStorage is fine).
