# Stromtarife

[![Validate](https://github.com/adrianhnt/ha-stromtarife/actions/workflows/validate.yaml/badge.svg)](https://github.com/adrianhnt/ha-stromtarife/actions/workflows/validate.yaml)
[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/docs/faq/custom_repositories)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**[Deutsche Version](README.de.md)**

Home Assistant integration for **German electricity contracts**. Keep track of your contracts (energy price in ct/kWh plus base price) and your meter readings, and see what your electricity really costs: in total and per device.

![Diagram card](https://raw.githubusercontent.com/adrianhnt/ha-stromtarife/main/docs/images/diagramm.png)

## Features

- **Contracts with validity periods:** provider, valid from/to, energy price (Arbeitspreis) and base price (Grundpreis) per month or per year. Gaps and overlaps are shown.
- **Manual meter readings:** enter the readings from your meter, even afterwards with the actual time of reading. Consumption between two readings is spread evenly.
- **Cost statistics for the Energy dashboard:** total costs and costs per device (smart plugs or any energy sensor), each priced with the contract that was valid at the time.
- **Dashboard card** with four views: contracts, meter readings, cost overview and a diagram with stacked bars, donut chart and share per device, including consumption not covered by any device.

## Requirements

- Home Assistant 2025.11 or newer
- An electricity contract with a fixed price per kWh (prices in EUR)
- Optional: energy sensors (`device_class: energy`) for the devices you want to track individually

The card UI is currently in German. An English version is planned ([#17](https://github.com/adrianhnt/ha-stromtarife/issues/17)).

## Installation

### HACS

1. HACS → ⋮ → **Custom repositories** → add `https://github.com/adrianhnt/ha-stromtarife` with type **Integration**.
2. Search for **Stromtarife** in HACS and download it.
3. Restart Home Assistant.

### Manual

Copy `custom_components/strom_tarife` into the `custom_components` folder of your Home Assistant configuration and restart Home Assistant.

## Setup

1. **Settings → Devices & services → Add integration → Stromtarife.** Pick the energy sensors of the devices whose costs you want to see individually. You can change this later in the integration's options.
2. **Add the card** to a dashboard, once per view you want:

   ```yaml
   type: custom:strom-tarife-card
   ansicht: vertraege   # contracts; or: zaehler, kosten, diagramm
   ```

3. **Enter your contracts** in the `vertraege` view and **your meter readings** in the `zaehler` view. Only administrators can edit.
4. **Energy dashboard (optional):** Settings → Dashboards → Energy → Grid consumption: choose the statistic `strom_tarife:zaehler` and as cost statistic `strom_tarife:kosten_gesamt`.

## Card

| `ansicht` | Shows |
|---|---|
| `vertraege` | Contracts table with add, edit and delete. Periods without a contract are listed (they cost 0 €). If contracts overlap, the one that started later applies. |
| `zaehler` | Meter readings with consumption since the previous reading and average per day. |
| `kosten` | Costs per series for this month, this year and last year. |
| `diagramm` | Consumption or costs for a selectable period (day, week, month, year, all), stacked per device plus "Nicht erfasst" (meter minus devices), with a donut chart and shares in %. Click a row to hide or show it. |

Options for `diagramm` (start values, can be changed in the card):

| Option | Values | Default |
|---|---|---|
| `einheit` | `kwh`, `eur` | `eur` |
| `zeitraum` | `tag`, `woche`, `monat`, `jahr`, `gesamt` | `monat` |
| `grundpreis` | `true`, `false`: include the base price in € | `true` |

<p>
  <img src="https://raw.githubusercontent.com/adrianhnt/ha-stromtarife/main/docs/images/vertraege.png" alt="Contracts" width="49%">
  <img src="https://raw.githubusercontent.com/adrianhnt/ha-stromtarife/main/docs/images/zaehler.png" alt="Meter readings" width="49%">
</p>

## How costs are calculated

- The **meter statistic** `strom_tarife:zaehler` (kWh) is built from your readings: one value per day, interpolated linearly between readings. After the last reading there is no data until you enter the next one.
- **Total costs** `strom_tarife:kosten_gesamt`: daily consumption × energy price of the contract valid on that day.
- **Device costs** `strom_tarife:kosten_<entity>`: hourly long-term statistics of the energy sensor × energy price. Updated every hour at minute 12.
- The **base price** is not part of the cost statistics, they contain energy costs only, matching the Energy dashboard. The diagram card can add it in €: each month gets 1/12 of the yearly price (or the monthly price) of the contract valid at that time.
- Changing a contract recalculates everything, changing a reading recalculates the meter and total costs. You can trigger a full recalculation with the button or the action `strom_tarife.neu_berechnen`.

## Entities

All entities belong to the device "Stromtarife". Their entity IDs depend on the language Home Assistant used when the integration was set up, so check the actual ID in the entity settings.

| Entity | Example ID (German) | Example ID (English) |
|---|---|---|
| Energy price of today's contract (ct/kWh) | `sensor.stromtarife_arbeitspreis` | `sensor.stromtarife_energy_price` |
| Base price per year (€) | `sensor.stromtarife_grundpreis` | `sensor.stromtarife_base_price` |
| Base price per month (€) | `sensor.stromtarife_grundpreis_pro_monat` | `sensor.stromtarife_base_price_per_month` |
| Provider of today's contract | `sensor.stromtarife_anbieter` | `sensor.stromtarife_provider` |
| Last meter reading (kWh, attribute `abgelesen`) | `sensor.stromtarife_zahlerstand` | `sensor.stromtarife_meter_reading` |
| Recalculate costs | `button.stromtarife_kosten_neu_berechnen` | `button.stromtarife_recalculate_costs` |

## Limitations

- Meter data comes from manual readings only. Using a meter sensor instead is planned ([#10](https://github.com/adrianhnt/ha-stromtarife/issues/10)).
- One fixed energy price per contract. Time-of-use tariffs (HT/NT), dynamic prices and feed-in remuneration are not supported.
- Prices in EUR. The integration is built for the German market.
- When you remove the integration, its statistics and stored contracts and readings currently stay in Home Assistant ([#12](https://github.com/adrianhnt/ha-stromtarife/issues/12)).

## Development

The `dev/` folder contains a mock for the card, a screenshot script and a Python test with stubbed Home Assistant modules. See [CLAUDE.md](CLAUDE.md) (German) for details. Bug reports and ideas are welcome in the [issue tracker](https://github.com/adrianhnt/ha-stromtarife/issues).

## License

[MIT](LICENSE)
