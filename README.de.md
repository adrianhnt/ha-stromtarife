# Stromtarife

[![Validate](https://github.com/adrianhnt/ha-stromtarife/actions/workflows/validate.yaml/badge.svg)](https://github.com/adrianhnt/ha-stromtarife/actions/workflows/validate.yaml)
[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/docs/faq/custom_repositories)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**[English version](README.md)**

Home-Assistant-Integration für **Stromverträge in Deutschland**. Sie verwaltet deine Verträge (Arbeitspreis in ct/kWh und Grundpreis) und deine Zählerstände und zeigt, was dein Strom wirklich kostet: insgesamt und je Gerät.

![Diagramm-Karte](https://raw.githubusercontent.com/adrianhnt/ha-stromtarife/main/docs/images/diagramm.png)

## Funktionen

- **Verträge mit Gültigkeitszeitraum:** Anbieter, gültig von/bis, Arbeitspreis und Grundpreis pro Monat oder pro Jahr. Lücken und Überschneidungen werden angezeigt.
- **Manuelle Zählerstände:** Stände vom Zähler eintragen, auch nachträglich mit dem echten Ablesezeitpunkt. Der Verbrauch zwischen zwei Ablesungen wird gleichmäßig verteilt.
- **Kosten-Statistiken für das Energie-Dashboard:** Gesamtkosten und Kosten je Gerät (Messsteckdosen oder beliebige Energie-Sensoren), jeweils mit dem Vertrag berechnet, der damals galt.
- **Dashboard-Karte** mit vier Ansichten: Verträge, Zählerstände, Kostenübersicht und ein Diagramm mit gestapelten Balken, Ringdiagramm und Anteil je Gerät, einschließlich des Verbrauchs, den kein Gerät erfasst.

## Voraussetzungen

- Home Assistant 2025.11 oder neuer
- Ein Stromvertrag mit festem Preis pro kWh (Preise in Euro)
- Optional: Energie-Sensoren (`device_class: energy`) für die Geräte, die einzeln erscheinen sollen

## Installation

### HACS

1. HACS → ⋮ → **Benutzerdefinierte Repositories** → `https://github.com/adrianhnt/ha-stromtarife` mit Typ **Integration** hinzufügen.
2. In HACS nach **Stromtarife** suchen und herunterladen.
3. Home Assistant neu starten.

### Manuell

`custom_components/strom_tarife` in den Ordner `custom_components` deiner Home-Assistant-Konfiguration kopieren und Home Assistant neu starten.

## Einrichtung

1. **Einstellungen → Geräte & Dienste → Integration hinzufügen → Stromtarife.** Die Energie-Sensoren der Geräte wählen, deren Kosten einzeln erscheinen sollen. Das lässt sich später in den Optionen der Integration ändern.
2. **Karte hinzufügen**, einmal je gewünschter Ansicht:

   ```yaml
   type: custom:strom-tarife-card
   ansicht: vertraege   # oder: zaehler, ablesung, kosten, diagramm
   ```

3. **Verträge** in der Ansicht `vertraege` und **Zählerstände** in der Ansicht `zaehler` eintragen. Bearbeiten dürfen nur Administratoren.
4. **Energie-Dashboard (optional):** Einstellungen → Dashboards → Energie → Netzbezug: die Statistik `strom_tarife:zaehler` wählen und als Kosten-Statistik `strom_tarife:kosten_gesamt`.

## Karte

| `ansicht` | Inhalt |
|---|---|
| `vertraege` | Vertragstabelle mit Hinzufügen, Bearbeiten und Löschen. Zeiträume ohne Vertrag werden angezeigt (sie kosten 0 €). Überschneiden sich Verträge, gilt der mit dem späteren Beginn. |
| `zaehler` | Ablesungen mit Verbrauch seit der vorherigen und Ø pro Tag. |
| `ablesung` | Formular, um direkt eine neue Ablesung einzutragen, ohne Dialog. Gedacht für eine eigene Dashboard-Ansicht als Lesezeichen (siehe unten). |
| `kosten` | Kosten je Reihe für diesen Monat, dieses Jahr und das Vorjahr. |
| `diagramm` | Verbrauch oder Kosten für einen wählbaren Zeitraum (Tag, Woche, Monat, Jahr, Gesamt), gestapelt je Gerät plus „Nicht erfasst“ (Zähler minus Geräte), mit Ringdiagramm und Anteilen in %. Ein Klick auf eine Zeile blendet sie aus oder ein. |

### Schnell ablesen per Lesezeichen

Eine Karte mit `ansicht: ablesung` auf eine eigene Dashboard-Ansicht legen, z. B. mit dem Pfad `ablesen`. Beim Öffnen steht der Cursor schon im Feld „Zählerstand“. Als Zeitpunkt gilt der Moment des Speicherns, solange man ihn nicht selbst ändert. Nach dem Speichern zeigt die Karte den Wert und den Verbrauch seit der vorherigen Ablesung, das Formular ist wieder leer.

Die Ansicht als Lesezeichen oder als Icon auf dem Home-Bildschirm des Handys speichern:

- Browser: `https://<deine-instanz>/<dashboard>/ablesen`
- Companion App: `homeassistant://navigate/<dashboard>/ablesen` (bei mehreren Servern mit `?server=default`). Auf dem iPhone lässt sich der Link mit der Kurzbefehle-App („URL öffnen“) auf den Home-Bildschirm legen, auf Android über die Shortcuts der Home-Assistant-App.

Optionen für `diagramm` (Startwerte, in der Karte umschaltbar):

| Option | Werte | Standard |
|---|---|---|
| `einheit` | `kwh`, `eur` | `eur` |
| `zeitraum` | `tag`, `woche`, `monat`, `jahr`, `gesamt` | `monat` |
| `grundpreis` | `true`, `false`: Grundpreis in € einrechnen | `true` |

<p>
  <img src="https://raw.githubusercontent.com/adrianhnt/ha-stromtarife/main/docs/images/vertraege.png" alt="Verträge" width="49%">
  <img src="https://raw.githubusercontent.com/adrianhnt/ha-stromtarife/main/docs/images/zaehler.png" alt="Zählerstände" width="49%">
</p>

## Berechnung

- Die **Zählerstatistik** `strom_tarife:zaehler` (kWh) entsteht aus deinen Ablesungen: ein Wert je Tag, zwischen den Ablesungen linear interpoliert. Nach der letzten Ablesung gibt es keine Werte, bis du die nächste einträgst.
- **Gesamtkosten** `strom_tarife:kosten_gesamt`: Tagesverbrauch × Arbeitspreis des Vertrags, der an dem Tag galt.
- **Gerätekosten** `strom_tarife:kosten_<entität>`: stündliche Langzeitstatistik des Energie-Sensors × Arbeitspreis. Wird jede Stunde zur Minute 12 fortgeschrieben.
- Der **Grundpreis** fließt nicht in die Kosten-Statistiken ein, sie enthalten nur Arbeitspreis-Kosten, passend zum Energie-Dashboard. Die Diagramm-Karte kann ihn in € dazurechnen: Jeder Monat bekommt 1/12 des Jahrespreises (bzw. den Monatspreis) des damals gültigen Vertrags.
- Eine Vertragsänderung berechnet alles neu, eine Änderung an den Ablesungen nur Zähler und Gesamtkosten. Komplett neu rechnen lässt sich über den Knopf oder die Aktion `strom_tarife.neu_berechnen`.

## Entitäten

Alle Entitäten gehören zum Gerät „Stromtarife“. Ihre Entity-IDs hängen von der Sprache ab, die Home Assistant beim Einrichten der Integration hatte. Die tatsächliche ID steht in den Einstellungen der Entität.

| Entität | Beispiel-ID (Deutsch) | Beispiel-ID (Englisch) |
|---|---|---|
| Arbeitspreis des heutigen Vertrags (ct/kWh) | `sensor.stromtarife_arbeitspreis` | `sensor.stromtarife_energy_price` |
| Grundpreis pro Jahr (€) | `sensor.stromtarife_grundpreis` | `sensor.stromtarife_base_price` |
| Grundpreis pro Monat (€) | `sensor.stromtarife_grundpreis_pro_monat` | `sensor.stromtarife_base_price_per_month` |
| Anbieter des heutigen Vertrags | `sensor.stromtarife_anbieter` | `sensor.stromtarife_provider` |
| Letzte Ablesung (kWh, Attribut `abgelesen`) | `sensor.stromtarife_zahlerstand` | `sensor.stromtarife_meter_reading` |
| Kosten neu berechnen | `button.stromtarife_kosten_neu_berechnen` | `button.stromtarife_recalculate_costs` |

## Integration entfernen

Beim Entfernen der Integration werden alle ihre Statistiken (`strom_tarife:*`) gelöscht. Verträge und Ablesungen bleiben erhalten und sind nach erneutem Hinzufügen wieder da. Wird ein Gerät in den Optionen abgewählt, verschwindet auch seine Kostenstatistik.

## Grenzen

- Zählerwerte kommen nur aus manuellen Ablesungen. Ein Zähler-Sensor als Alternative ist geplant ([#10](https://github.com/adrianhnt/ha-stromtarife/issues/10)).
- Ein fester Arbeitspreis je Vertrag. HT/NT-Tarife, dynamische Tarife und Einspeisevergütung werden nicht unterstützt.
- Preise in Euro, gebaut für den deutschen Markt.

## Entwicklung

Im Ordner `dev/` liegen ein Mock für die Karte, ein Screenshot-Skript und ein Python-Test mit gestubbten Home-Assistant-Modulen. Details stehen in [CLAUDE.md](CLAUDE.md). Fehler und Ideen gern im [Issue-Tracker](https://github.com/adrianhnt/ha-stromtarife/issues).

## Lizenz

[MIT](LICENSE)
