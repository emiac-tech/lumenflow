# Dimming Map Notes

## Purpose
Map dimming-related PDF/extractor fields into the built-in `dimming` / UI `Dimming` column.

## Current Aliases
The server maps these normalized field names to `dimming`:

- `dimming`
- `dimmingtype`
- `dimmingoptions`
- `dimmingoption`
- `dimmable`
- `control`
- `controloptions`
- `controlgear`

The external product-spec adapter checks these source labels:

- `Dimming`
- `Dimmable`
- `Dimming Type`
- `Dimming Options`
- `Dimming Option`
- `Control`
- `Control Options`
- `Control Gear`

## Incident: Nocturne Hotel, Project 27
Rows from Enigma PDFs used `Dimming options: Mains Dimmable / DALI / 0-10V / Casambi`. The old map did not include `Dimming Options`, so the value stayed in description text and did not populate the built-in `Dimming` column.

## Backfill Rule Used
For existing project 27 rows, if `dimming` was empty, extract the value after `Dimming options:` from the stored row description or PDF text, stopping before the next known specification label such as `CRI`, `Lifetime`, `Power`, or `Delivered Lumens`.
