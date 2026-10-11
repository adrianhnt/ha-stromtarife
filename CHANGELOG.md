# Changelog

All notable changes to this project. Versions follow `version` in `custom_components/strom_tarife/manifest.json`; each version is published as a GitHub release.

## 0.8.1 (2026-10-11)

- Card: date fields no longer overflow the form and are no longer centered in Safari and on iOS

## 0.8.0 (2026-10-11)

- New card view `ansicht: ablesung`: a form to enter a meter reading directly in the card, without a dialog. Put it on its own dashboard view and bookmark it, or open it from the Companion app with `homeassistant://navigate/<dashboard>/<view>` ([#22](https://github.com/adrianhnt/ha-stromtarife/issues/22))

## 0.7.0 (2026-10-11)

- Energy price with up to three decimal places (e.g. 28.317 ct/kWh). Editing a contract no longer rounds the price to two decimals.
- Removing the integration deletes its statistics; contracts and readings are kept for a reinstall
- Deselecting a device in the options deletes its cost statistic
- Contract dialog: amounts of 1,000 € or more are prefilled without a thousands separator, so they can be saved again

## 0.6.0 (2026-10-11)

First public release.

- Brand icon, shown on the integrations page from Home Assistant 2026.3
- Minimum Home Assistant version raised to 2025.11: older versions fail to store the statistics (no `unit_class` column)
- README in English and German, MIT license
- CI with HACS validation, Hassfest and tests; releases are created from tags

## 0.5.2 (2026-10-11)

- Diagram: all devices are shown individually instead of grouping more than eight into "Weitere Geräte"

## 0.5.1 (2026-10-01)

- Diagram: in the hourly view, "Nicht erfasst" is estimated by spreading the daily value evenly (hatched, marked as estimate)
- Diagram: "Heute" button placed directly next to the date

## 0.5.0 (2026-09-27)

- Diagram in €: base price as its own series, switchable with "mit Grundpreis"
- Base price per month or per year per contract, new sensor for the monthly base price

## 0.4.0 (2026-09-27)

- Diagram: period selection like the Energy dashboard, donut chart with shares

## 0.3.x (2026-09-26)

- Diagram with unrecorded consumption, legend to hide and show series

## 0.2.x (2026-09-26)

- Meter readings; the meter statistic uses daily values; recalculation is never cancelled

## 0.1.0 (2026-09-26)

- Contracts with validity periods, cost statistics, dashboard card
