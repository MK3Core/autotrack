# AutoTrack

A private fuel and maintenance log for your vehicles. AutoTrack runs as an
Android app (or in any browser), keeps every record on the device, and needs
no account, server or internet connection.

## Features

- **Multiple vehicles.** Switch between them from the top of the screen. Each
  vehicle has its own units (miles or kilometers, gallons or liters) and can
  be marked inactive to hide it from the switcher.
- **Fillups.** Log date, odometer, fuel grade, station and notes. Enter any
  two of price per unit, amount and total cost and the third is calculated.
  Partial tanks and missed fillups are handled so fuel economy stays accurate.
- **Log.** One timeline of fillups and service visits, grouped by month, with
  each fillup's fuel economy ranked against the vehicle's own history.
  Readings that look like an unlogged fillup are flagged as "check mileage"
  so you can mark them as missed or confirm them.
- **Service records.** One entry per shop visit with any number of services,
  optional itemized costs and the total actually paid.
- **Service reminders.** Make a service repeat every N miles and/or M months.
  The Garage shows what's due next, measured from the last time it was logged.
- **Garage.** A spec card for the selected vehicle: maker's logo, year, make
  and model, odometer, license plate and VIN (tap any of the last three to
  copy it), plus its service reminders.
- **Reports.** Pick a range (3 months, 6 months, a year or all time) and see
  distance driven, fuel economy with every tank on a best-to-worst strip,
  cost of ownership split into fuel and service (total and per mile), and
  fuel price against its low and high. Trend arrows compare with the
  previous period (on all time, the second half against the first), and
  each card opens a chart.
- **Import / export.** Import backups from AutoTrack (.csv), Drivvo (.xlsx)
  and Fuelio (.csv). Export one .csv per vehicle with its details and full
  history; it opens in Excel or Sheets and imports back into AutoTrack.
- **Clear data.** Wipe everything to start fresh.

## Your data

Everything is stored in the app's local database (IndexedDB) on the device.
There is no sync or cloud backup, so use **Import / Export** to back up a
vehicle or move it to another device. Uninstalling the app or clearing its
storage deletes your data.

## Install (Android)

AutoTrack isn't on any app store yet; official Google Play and App Store
releases are planned (see [Roadmap](#roadmap)). Until then, signed APKs are
published on the [Releases page](https://github.com/MK3Core/autotrack/releases).
Requires Android 7.0 or newer.

**With Obtainium (recommended, gets updates automatically):**

1. Install [Obtainium](https://github.com/ImranR98/Obtainium).
2. Tap **Add App** and paste `https://github.com/MK3Core/autotrack`.
3. Install it from Obtainium. New releases show up as updates.

**Manually:**

1. Download the latest `autotrack-x.y.z.apk` from the Releases page on your
   phone.
2. Open it and allow your browser or file manager to install unknown apps
   when Android asks.
3. To update, install the newer APK over the old one. Your data is kept.

There is no iOS build yet; an official App Store release is planned.

## Development

Built with React, TypeScript and Vite, with Dexie for storage and Capacitor
for the Android app.

```sh
npm install
npm run dev        # dev server at http://localhost:5173 (add -- --host for your phone)
npm run build      # type-check and build the web app into dist/
npm run lint
```

Project layout:

- `src/pages`: the tabs (Log, Garage, Reports, Import / Export) and the
  fillup and service forms
- `src/lib`: calculations, reminders, import/export, units, make logos
- `src/db`: the Dexie database schema
- `src/assets/make-logos`: bundled manufacturer logos (see its `SOURCES.md`)
- `android`: the Capacitor Android project

### Building the Android app

Requires the Android SDK and JDK 21 (Android Studio provides both).

```sh
npm run android:sync   # build the web app and copy it into android/
npm run android:open   # open the project in Android Studio to run or build
```

### Releasing

Pushing a `vX.Y.Z` tag runs `.github/workflows/release-apk.yml`, which builds
a signed release APK and publishes it as a GitHub Release (the version name
comes from the tag):

```sh
git tag v0.3.3
git push origin v0.3.3
```

Signing uses the repository secrets `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`.
Every release must be signed with the same key, or Android will refuse to
update existing installs. Running the workflow by hand from the Actions tab
builds a dev version instead, published as a release tagged
`v0.0.<run number>-dev`.

## Roadmap

The goal is an official launch on **Google Play** and the **Apple App
Store** someday. Ideas planned for the future, with notes on each, are in
[BACKLOG.md](./BACKLOG.md):

- Official Google Play and App Store releases (and an iOS app)
- A launch name ("Glovebox" is the working name) and app icon
- Encrypted backup, and eventually end-to-end encrypted sync across devices
- Receipt photos on service records, and a "sale packet" export for buyers
- A secure on-device vault for insurance and registration cards
- Manufacturer service schedules that fill in reminders automatically
- Search across service history
- Themes: light mode and a "Glovebox notebook" look
- Vehicle value in Reports (market value over time and per mile)
- Save-to-folder export
- Local car events with anonymous RSVP

## Logos

Manufacturer logos are trademarks of their owners and are shown only to
identify your own vehicle. Sources are listed in
`src/assets/make-logos/SOURCES.md`.
