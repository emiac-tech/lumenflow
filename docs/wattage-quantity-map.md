# Wattage Quantity Map Notes

## Purpose
Map multiplicative wattage expressions into built-in `unit_watts`, `quantity`, and calculated `total_watts`.

## Current Rule
If a wattage value contains a multiplier pattern such as:

- `40W*8`
- `40W x 8`
- `40W × 8`

then the server stores:

- `unit_watts`: `40W`
- `quantity`: `8`
- `total_watts`: `320W`

## Incident: Nocturne Hotel, Project 27
`PL1.pdf` had the source meaning `Max Wattage: 40W*8 (Total maximum 320W)`. The stored row only had `unit_watts=40W`, `quantity=1`, and `total_watts=40W`, so row 214 required backfill to `quantity=8` and `total_watts=320W`.
