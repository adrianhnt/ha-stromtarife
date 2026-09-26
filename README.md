# Stromtarife

Home-Assistant-Integration, um Stromverträge mit Gültigkeitszeitraum zu verwalten und die Stromkosten danach zu berechnen – für den Gesamtverbrauch (Zähler) und für einzelne Geräte.

## Verträge

Jeder Vertrag hat Anbieter, gültig von / bis (bis leer = offen), Arbeitspreis in ct/kWh (zwei Nachkommastellen), Grundpreis in €/Monat und eine Notiz. Gepflegt werden sie direkt auf dem Dashboard in einer Tabelle:

```yaml
type: custom:strom-tarife-card
ansicht: vertraege   # oder: kosten
```

- **vertraege** – Tabelle mit Hinzufügen / Bearbeiten / Löschen (nur Administratoren). Zeiträume ohne Vertrag werden angezeigt (sie kosten 0 €). Überschneiden sich Verträge, gilt der mit dem späteren Beginn.
- **kosten** – Kosten je Reihe für diesen Monat, dieses Jahr und das Vorjahr, auf Cent gerundet.

## Berechnung

Jede Stunde wird mit dem Arbeitspreis des Vertrags berechnet, der an diesem Tag galt. Grundlage sind die stündlichen Langzeit-Statistiken des Zählers und der Geräte-Energiesensoren. Ergebnis sind externe Statistiken:

- `strom_tarife:kosten_gesamt` – für das Energie-Dashboard als Kosten-Statistik des Netzbezugs
- `strom_tarife:kosten_<gerät>` – je Gerät

Neue Stunden werden stündlich (Minute 12) ergänzt. Nach jeder Vertragsänderung wird alles neu berechnet; manuell über den Knopf „Kosten neu berechnen“ oder den Dienst `strom_tarife.neu_berechnen` (z. B. nach einem Import alter Zählerstände).

Der Grundpreis wird gespeichert und angezeigt, fließt aber (noch) nicht in die Kosten ein.

## Entitäten

- `sensor.stromtarife_arbeitspreis` (ct/kWh), `sensor.stromtarife_grundpreis` (€/Monat), `sensor.stromtarife_anbieter` – jeweils des heute gültigen Vertrags
- `button.stromtarife_kosten_neu_berechnen`

## Installation

HACS → Benutzerdefiniertes Repository → dieses Repo (Typ Integration) → herunterladen → Neustart → Einstellungen → Geräte & Dienste → „Stromtarife“ hinzufügen, Zähler und Geräte wählen.
