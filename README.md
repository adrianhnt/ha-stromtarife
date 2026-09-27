# Stromtarife

Home-Assistant-Integration, um Zählerstände und Stromverträge mit Gültigkeitszeitraum zu verwalten und die Stromkosten danach zu berechnen – für den Gesamtverbrauch (Zähler) und für einzelne Geräte.

## Zählerstände

Abgelesene Stände (Zeitpunkt, kWh, Notiz) werden in einer Tabelle gepflegt – auch nachträglich mit dem echten Ablesezeitpunkt. Zwischen zwei Ablesungen wird der Verbrauch gleichmäßig auf die Stunden verteilt. Daraus entsteht die Statistik `strom_tarife:zaehler` (kWh), die im Energie-Dashboard als Netzbezug eingetragen wird. Nach der letzten Ablesung erscheint noch kein Verbrauch; er wird mit der nächsten Ablesung nachgetragen. Ein Stand, der kleiner ist als ein früherer (oder größer als ein späterer), wird abgelehnt.

## Verträge

Jeder Vertrag hat Anbieter, gültig von / bis (bis leer = offen), Arbeitspreis in ct/kWh (zwei Nachkommastellen), Grundpreis (wahlweise pro Monat oder pro Jahr) und eine Notiz. Gepflegt werden sie direkt auf dem Dashboard in einer Tabelle:

```yaml
type: custom:strom-tarife-card
ansicht: vertraege   # oder: zaehler, kosten, diagramm
```

- **vertraege** – Tabelle mit Hinzufügen / Bearbeiten / Löschen (nur Administratoren). Zeiträume ohne Vertrag werden angezeigt (sie kosten 0 €). Überschneiden sich Verträge, gilt der mit dem späteren Beginn.
- **zaehler** – Ablesungen mit Verbrauch seit der vorherigen und Ø pro Tag, Hinzufügen / Bearbeiten / Löschen.
- **kosten** – Kosten je Reihe für diesen Monat, dieses Jahr und das Vorjahr, auf Cent gerundet.
- **diagramm** – Zeitraum wie im Energie-Dashboard wählbar (Tag / Woche / Monat / Jahr / Gesamt, vor- und zurückblättern, „Heute“, oder frei über den Kalender). Gestapelte Balken (Stunden, Tage, Monate oder Jahre – je nach Zeitraum) plus Ringdiagramm mit Tabelle: je Gerät und „Nicht erfasst“ (Zähler minus Geräte) Verbrauch bzw. Kosten und Anteil in %. Die Anteile beziehen sich immer auf das, was gerade angezeigt wird. Ein Klick auf eine Zeile blendet sie aus oder ein; die Auswahl merkt sich der Browser. Optional `einheit: kwh|eur` und `zeitraum: tag|woche|monat|jahr|gesamt` als Startwerte.

## Berechnung

Jede Stunde wird mit dem Arbeitspreis des Vertrags berechnet, der an diesem Tag galt. Grundlage sind die Zählerstatistik aus den Ablesungen und die stündlichen Langzeit-Statistiken der Geräte-Energiesensoren. Ergebnis sind externe Statistiken:

- `strom_tarife:kosten_gesamt` – für das Energie-Dashboard als Kosten-Statistik des Netzbezugs
- `strom_tarife:kosten_<gerät>` – je Gerät

Gerätekosten werden stündlich (Minute 12) ergänzt. Nach jeder Änderung an Verträgen oder Ablesungen wird alles neu berechnet; manuell über den Knopf „Kosten neu berechnen“ oder den Dienst `strom_tarife.neu_berechnen`.

Der Grundpreis wird gespeichert und angezeigt, fließt aber (noch) nicht in die Kosten ein.

## Entitäten

- `sensor.stromtarife_arbeitspreis` (ct/kWh), `sensor.stromtarife_grundpreis` (€/Jahr), `sensor.stromtarife_anbieter` – jeweils des heute gültigen Vertrags
- `sensor.stromtarife_zahlerstand` – letzte Ablesung
- `button.stromtarife_kosten_neu_berechnen`

## Installation

HACS → Benutzerdefiniertes Repository → dieses Repo (Typ Integration) → herunterladen → Neustart → Einstellungen → Geräte & Dienste → „Stromtarife“ hinzufügen, Geräte wählen. Im Energie-Dashboard als Netzbezug `strom_tarife:zaehler` mit Kosten-Statistik `strom_tarife:kosten_gesamt` eintragen.
