# CCT Map Notes

## Purpose
Map color-temperature fields into the built-in `cct` / UI `CCT` column.

## Current Aliases
The server maps these normalized field names to `cct`:

- `cct`
- `ledcct`
- `ledcricct`
- `cricct`
- `colourtemperature`
- `colortemperature`
- `colourtemperatures`
- `colortemperatures`
- `lightcolour`
- `lightcolor`

The external product-spec adapter checks these source labels:

- `CCT`
- `LED CCT`
- `LED CRI/CCT`
- `CRI/CCT`
- `Colour Temperature`
- `Color Temperature`
- `Colour Temperatures`
- `Color Temperatures`
- `Light Colour`
- `Light Color`

## Incident: Nocturne Hotel, Project 27
`LED 1.pdf` contained `LED CRI/CCT 2400K CRI >90`. The old map recognized `CCT`, `Colour Temperature`, and `Color Temperature`, but not the combined `LED CRI/CCT` label, so `2400K` appeared in the description while the built-in `CCT` column stayed empty.

## Backfill Rule Used
For existing project 27 rows with empty `cct`, extract the first Kelvin value following `LED CRI/CCT`, `CRI/CCT`, or ordering text before `CRI`.

## Normalization
When a matched CCT value contains extra CRI text, such as `2400K CRI >90`, the server stores only Kelvin tokens in the CCT column. For that example, the stored value is `2400K`. Multiple Kelvin values are preserved as `2200K / 2700K / 3000K / 4000K`.
