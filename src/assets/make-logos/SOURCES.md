# Manufacturer logos

Full-color logos for the Garage badge, one WebP per make, looked up by
`src/lib/makeLogos.ts`. Each was trimmed to the emblem (brand text dropped
where the logo has a separate emblem) and scaled to at most 256px.

All logos are trademarks of their respective owners and are used only to
identify the user's own vehicle. They are not freely licensed.

Sources:

- Most files: [filippofilip95/car-logos-dataset](https://github.com/filippofilip95/car-logos-dataset)
  (`logos/original/`, crawled from carlogos.org), August 2025 crawl.
- `alfa-romeo.webp`, `genesis.webp`: the same dataset's `logos/optimized/`
  versions (the originals were broken).
- `porsche.webp`: the 2024 crest from English Wikipedia,
  [File:Porsche Logo 2024.png](https://en.wikipedia.org/wiki/File:Porsche_Logo_2024.png).

Dark-background versions: logos with dark ink also have a
`<slug>.dark.webp`, made by mirroring every pixel darker than 45% lightness to
the matching light tone with the same hue (black to white, navy to light
blue), leaving mid and light tones such as red, orange and chrome alone.
`makeLogoUrl` picks it when the logo sits on a dark background. Current list:
aston-martin, audi, bentley, chrysler, cupra, genesis, hummer, jaguar, jeep, lincoln, lucid, maserati, mclaren, mercury, nissan, polestar, rivian, saab, toyota, volkswagen.

To add a make: drop `<slug>.webp` in this folder (light-background logo,
transparent WebP, about 256px on the long side), plus a `<slug>.dark.webp`
if its ink is too dark to read on the dark theme. The slug with dashes
removed is matched against the make; add nicknames to `ALIASES` in
`src/lib/makeLogos.ts`.

Makes covered:

abarth, acura, alfa-romeo, alpine, aston-martin, audi, bentley, bmw,
bugatti, buick, byd, cadillac, chevrolet, chrysler, citroen, cupra, dacia,
dodge, ds, ferrari, fiat, fisker, ford, genesis, gmc, honda, hummer,
hyundai, infiniti, isuzu, jaguar, jeep, kia, koenigsegg, lamborghini,
land-rover, lexus, lincoln, lotus, lucid, maserati, mazda, mclaren,
mercedes-benz, mercury, mg, mini, mitsubishi, nissan, oldsmobile, opel,
pagani, peugeot, plymouth, polestar, pontiac, porsche, ram, renault,
rivian, rolls-royce, saab, saturn, scion, seat, skoda, smart, subaru,
suzuki, tesla, toyota, vauxhall, vinfast, volkswagen, volvo
