# Stromtarife – Hinweise für Claude Code

Custom Integration für Home Assistant (Domain `strom_tarife`), verteilt über HACS aus diesem öffentlichen Repo. Verwaltet Stromverträge und manuell abgelesene Zählerstände und rechnet daraus Kosten für den Gesamtverbrauch und für einzelne Geräte (Messsteckdosen). Dazu gehört eine eigene Lovelace-Karte.

**Öffentliches Repo: keine persönlichen Daten** (Verträge, Zählerstände, Adressen, Tokens, URLs der eigenen Instanz) in Code, Tests, Commits oder Doku.

Zielgruppe: Stromverträge in Deutschland (immer EUR), Oberfläche auf Deutsch und Englisch (Karte bisher nur Deutsch, siehe #17).

Sprache:
- Deutsch: UI-Texte, Kommentare, Commit-Messages, `README.de.md`, diese Datei. Zahlen im Frontend mit `de-DE` formatieren.
- Englisch: GitHub-Issues (Backlog), `README.md`, `CHANGELOG.md` und Release-Notes.
- Beide READMEs immer gemeinsam ändern. Bilder darin mit absoluter `raw.githubusercontent.com`-URL, weil HACS relative Pfade nicht anzeigt.

Backlog: GitHub-Issues mit Labels `phase-1: release`, `phase-2: usability`, `phase-3: growth` und `decision`, `enhancement`, `bug`, `documentation`, `infra`. Commits verweisen mit `Refs #n` bzw. `Closes #n`. Gearbeitet wird direkt auf `main`, ohne Pull Requests.

## Aufbau

```
custom_components/strom_tarife/
  __init__.py      Setup, Static Path für die Karte + add_extra_js_url (…/strom-tarife-card.js?v=<mtime beim Start>)
  tarife.py        Kern: Manager `StromTarife` – Speicher, Validierung, Statistik-Berechnung, Worker
  websocket.py     WS-Befehle für die Karte
  sensor.py        Arbeitspreis (ct/kWh), Grundpreis (€/Jahr und €/Monat), Anbieter, Zählerstand
  button.py        „Kosten neu berechnen“
  config_flow.py   nur Geräteauswahl (Energie-Sensoren, Option `geraete`)
  const.py         METER_STAT, STAT_PREFIX, TOTAL_ID="gesamt", UPDATE_MINUTE=12
  frontend/strom-tarife-card.js   Karte (Vanilla-JS-Web-Component, kein Build-Schritt)
  brand/           icon.png, icon@2x.png (ab HA 2026.3 lokal geladen; Quelle dev/brand/icon.svg, rendern mit dev/brand.mjs)
dev/               lokale Testumgebung (Mock-hass, Screenshots, Python-Stub-Test, Icon-Quelle)
docs/images/       Screenshots für die READMEs (aus dev/out/, nur Mock-Daten)
.github/workflows/ validate.yaml (HACS Action, Hassfest, Stub-Test, node --check), release.yaml (Release aus Tag)
```

## Datenmodell

- Speicher: `.storage/strom_tarife.vertraege` mit den Schlüsseln `vertraege` und `ablesungen`.
- Vertrag: `id, anbieter, von, bis (None = offen), arbeitspreis_ct (3 Nachkommastellen), grundpreis_eur, grundpreis_einheit ("jahr"|"monat"), notiz`. Überschneiden sich Verträge, gilt der mit dem späteren Beginn. Lücken kosten 0 €.
- Grundpreis fließt **nicht** in die Kosten-Statistiken ein. Er erscheint nur in der Karte (`diagramm` in €, abschaltbar). `grundpreis_pro_jahr()` rechnet Monatswerte ×12, `grundpreis_pro_monat()` Jahreswerte ÷12. Die Migration setzt eine fehlende Einheit auf „jahr“, ohne die Werte umzurechnen.
- Ablesung: `id, zeitpunkt ("YYYY-MM-DDTHH:MM", lokale Zeit), stand (kWh), notiz`. Validierung: nicht in der Zukunft, Stand monoton zu früheren und späteren Ablesungen.

## Statistiken (externe Statistiken im Recorder)

- `strom_tarife:zaehler` (kWh, unit_class energy): **eine Zeile je Tag** (Start 23:00 Uhr lokal am Vortag, Summe = Wert um Mitternacht) plus eine Zeile je Ablesung, linear interpoliert. Nach der letzten Ablesung gibt es keine Zeilen.
  **Keine Stundenzeilen!** Das waren rund 32.000 Zeilen, und die haben die Recorder-Warteschlange auf einem HA Green minutenlang blockiert.
- `strom_tarife:kosten_gesamt`: aus der Zählerstatistik × Arbeitspreis des Vertrags am jeweiligen Tag.
- `strom_tarife:kosten_<entity_object_id>` je Gerät: aus den stündlichen Langzeitstatistiken des Energie-Sensors × Arbeitspreis. Genau rechnen, erst in der Anzeige auf Cent runden.
- Neu berechnet wird so:
  - Vertragsänderung: alles.
  - Ablesungsänderung: nur Zähler und Gesamt (`nur_zaehler`).
  - Stündlich zur Minute 12: Geräte inkrementell fortschreiben.
  - Knopf, Dienst `strom_tarife.neu_berechnen` und WS `neu_berechnen`: alles, wird nur eingeplant.
- Der Worker wird **nie abgebrochen**: eine Schleife mit `_full_requested` / `_full_scope_all`. Ein abgebrochener Lauf hat früher geleerte Statistiken hinterlassen.
- Schreiben: erst `get_instance(hass).async_clear_statistics([...])`, dann `async_add_external_statistics`.
- Aufräumen (`async_clear_own_statistics`): Bei jeder vollen Neuberechnung (nicht `nur_zaehler`) werden Statistiken mit `source=strom_tarife` gelöscht, die zu keiner Reihe mehr gehören (abgewählte Geräte). `async_remove_entry` löscht alle; der Speicher mit Verträgen und Ablesungen bleibt.

### Fakten zur Recorder-API (HA 2026.9)

- `StatisticMetaData` braucht `mean_type` und `unit_class`.
- `statistics_during_period(hass, start, end, ids, period, units, types)` liefert Zeilen mit `start` als float in Sekunden. Über WebSocket kommt `start` in ms.
- `get_last_statistics(hass, n, id, convert_units, types)`.
- Nach einem Import in eine *Entitäts*-Statistik: `recorder/adjust_sum_statistics`, sonst beginnen die Live-Summen wieder bei 0.

### Fallstricke

- **Zeitzone:** Differenzen zwischen `datetime`s mit derselben ZoneInfo sind Wanduhrzeit, bei der Zeitumstellung also falsch. Vorher nach UTC wandeln (siehe `_reading_time`).
- Gerätenamen aus `state.name` nehmen, nicht aus dem Entity-Namen, sonst heißt alles „Energie“.
- `ablesung/save` und `sensor.stromtarife_zahlerstand` (Attribut `abgelesen`) werden von einem externen Ablauf genutzt: Ein Zählerfoto wird automatisch abgelesen und eingetragen. **Schema und Verhalten rückwärtskompatibel halten.**

## WebSocket-API

`strom_tarife/data` · `vertrag/save` · `vertrag/delete` · `ablesung/save` · `ablesung/delete` · `neu_berechnen` (Schreibbefehle nur für Admins)

`data` liefert `vertraege` (mit `aktiv`, `ueberschneidet`), `luecken`, `ablesungen` (neueste zuerst, mit `verbrauch`, `tage`, `pro_tag`), `reihen` (`id, name, source, statistic_id`; `gesamt` + Geräte) und `berechnung`.

`ablesung/save`: `{"ablesung": {"id"?, "zeitpunkt", "stand", "notiz"}}`. Mit `id` wird eine bestehende Ablesung geändert.

## Karte `custom:strom-tarife-card`

Die Option `ansicht` bestimmt, was die Karte zeigt:

| `ansicht` | Inhalt |
|---|---|
| `vertraege` | Tabelle mit Dialog (Grundpreis wahlweise pro Jahr oder pro Monat) |
| `zaehler` | Ablesungen mit Verbrauch und Ø pro Tag |
| `ablesung` | Formular für eine neue Ablesung direkt in der Karte, für eine eigene Ansicht als Lesezeichen (#22) |
| `kosten` | Monat, Jahr und Vorjahr je Reihe |
| `diagramm` | siehe unten |

**`ablesung`**
- Formular statt Modal: Zählerstand (Fokus beim Anzeigen), Zeitpunkt, Notiz, Speichern per Enter. Darüber die letzte Ablesung, danach eine Bestätigung mit Verbrauch seit davor.
- Der Zeitpunkt läuft mit (`zeitManuell`), gespeichert wird `localNow()` beim Speichern. HA hält die Karte beim Ansichtswechsel vor: `connectedCallback` setzt ein leeres Formular zurück, `visibilitychange` zeichnet neu (App aus dem Hintergrund).
- `_render` stellt Fokus und Cursor wieder her, weil die Karte alle 5 Minuten und nach Neuberechnungen neu zeichnet.
- Nur für Admins, sonst ein Hinweis. Companion App: `homeassistant://navigate/<dashboard>/<ansicht>`.

**`diagramm`**
- Zeitraumwahl wie im Energie-Dashboard: Tag, Woche, Monat, Jahr, Gesamt, ‹ ›, „Heute“, Kalender mit Von/Bis.
- Zeitraumzeile rechts außen: `[Heute] Datum ‹ ›`, direkt nebeneinander. Die Pfeile stehen ganz rechts und springen beim Blättern nicht. Bei Platzmangel rutscht „Heute“ unter die Auswahl. Kein Kalender-Icon.
- Das Balkenraster richtet sich nach der Länge: bis 2 Tage Stunden, bis 62 Tage Tage, bis etwa 3 Jahre Monate, darüber Jahre.
- Gestapelte Balken je Gerät plus „Nicht erfasst“ (Zähler minus Geräte).
- Darunter ein Ringdiagramm mit Tabelle (Wert und Anteil in %). **Die Anteile beziehen sich immer auf die gerade angezeigten Reihen im Zeitraum.**
- Ein Klick auf eine Zeile blendet die Reihe aus oder ein. Gespeichert wird das in localStorage `strom-tarife-diagramm-ausgeblendet`.
- In der Stundenansicht ist „Nicht erfasst“ geschätzt: Zähler minus Geräte des Tages, gleichmäßig auf die Stunden verteilt, die der Zählerwert abdeckt (bis zur letzten Ablesung, nicht in die Zukunft). Balken, Legende und Tooltip zeigen es schraffiert, der Tooltip sagt „geschätzt“.
- **Grundpreis** (nur in €): eigene Reihe, unten im Stapel. Jeder Monat bekommt 1/12 des Jahrespreises bzw. den Monatspreis des an dem Tag gültigen Vertrags (`contractOn` = `contract_at`), gleichmäßig auf Tage und Stunden verteilt, bis jetzt. Vertragswechsel im Zeitraum ergeben so automatisch mehrere Grundpreise. Wird im Browser berechnet, nicht im Recorder.
- Schalter „mit Grundpreis“ neben kWh/€. Startwert aus `grundpreis: true|false` (Standard an), danach localStorage `strom-tarife-diagramm-grundpreis`. Ein Klick auf die Zeile „Grundpreis“ setzt dieselbe Einstellung wie der Schalter (sie zählt nicht zu den ausgeblendeten Reihen, „Alle anzeigen“ lässt sie unberührt).
- Optionen: `einheit: kwh|eur`, `zeitraum: tag|woche|monat|jahr|gesamt`, `grundpreis: true|false`. Alte Werte `monate`/`jahre` werden verstanden.

Weitere Regeln für die Karte:
- Kosten auf dem Dashboard immer auf Cent gerundet (`2,34 €`).
- Bei Kosten ohne Grundpreis den Hinweis „ohne Grundpreis“ anzeigen, mit Grundpreis erklären, wie er verteilt wird.
- **Diagramm-Regeln:** feste Farbfolge je Gerät, nie nach Rang umfärben.
  - hell: `#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4 #008300 #4a3aa7 #e34948`
  - dunkel: `#3987e5 #d95926 #199e70 #c98500 #d55181 #008300 #9085e9 #e66767`
  - „Nicht erfasst“: grau, hell `#b4b2a9`, dunkel `#6f6e69`
  - „Grundpreis“: hell `#5f5e5a`, dunkel `#a8a69d`
  - alle Geräte werden einzeln gezeigt, nie zusammengefasst. Ab dem 9. Gerät gibt es eine feste Farbe aus dem Index (HSL, Goldener Winkel ab Farbton 185)
  - Balken höchstens 24 px breit, oben 4 px gerundet, 2 px Lücke zwischen Segmenten
  - keine zweite y-Achse
  - Tooltip beim Überfahren
- **Cache:** Die Karte wird mit `?v=<mtime beim HA-Start>` geladen. Nach einem reinen JS-Update liefert HA die neue Datei zwar sofort aus, Browser brauchen aber einen Neustart von HA oder ein hartes Neuladen.

## Lokal testen

- Python: `python3 dev/test_tarife_stub.py` (HA-Module sind gestubbt, braucht Python ≥ 3.12, sonst nichts). Muss mit `OK` enden.
- Karte: `dev/mock.html?theme=dark|light&ansicht=diagramm|vertraege|zaehler|ablesung|kosten&grundpreis=0&admin=0`, direkt im Browser öffnen. Mock-hass mit synthetischen Statistiken.
- Screenshots: `cd dev && npm install && node screenshot.mjs` (in der Cloud-Umgebung mit `PW_CHROMIUM=/opt/pw-browsers/chromium`). Das Ergebnis landet in `dev/out/`. Screenshots immer ansehen, bevor eine UI-Änderung fertig ist: dunkel, hell und schmal (390 px).
- `node --check custom_components/strom_tarife/frontend/strom-tarife-card.js` vor jedem Commit.

## Release

Mindestversion: HA 2025.11 (`hacs.json`). Erst ab da hat `statistics_meta` die Spalte `unit_class`; ältere Versionen brechen beim Schreiben der Statistik ab. Neue Recorder- oder Helper-APIs nur nach Prüfung gegen die Mindestversion verwenden (Wheel von PyPI laden und nachsehen).

1. `version` in `manifest.json` erhöhen, Abschnitt `## X.Y.Z (Datum)` in `CHANGELOG.md` (Englisch), beide READMEs anpassen.
2. Commit und Push auf `main`, CI abwarten.
3. Release anlegen: Workflow „Release“ manuell auf `main` starten (Actions → Release → Run workflow, über den GitHub-MCP `actions_run_trigger` mit `run_workflow`). Er leitet das Tag `vX.Y.Z` aus der Manifest-Version ab und legt Tag und GitHub-Release mit dem Changelog-Abschnitt an. Tags lassen sich aus der Cloud-Umgebung nicht pushen (Proxy 403); lokal geht auch `git push origin vX.Y.Z`. HACS bietet nur noch Releases an, keine einzelnen Commits.
4. In HA per HACS aktualisieren: Repo-ID `1389007769`, erst „Update information“, dann „Download“. Über den HA-MCP geht das mit `ha_manage_hacs` und `update_information`, dann `download`.
5. Bei Python-Änderungen braucht es einen **Neustart von HA, aber nur nach ausdrücklichem OK des Nutzers**. Bei reinen JS-Änderungen reicht ein hartes Neuladen im Browser.
6. Danach im echten Dashboard prüfen: Konsole ohne Fehler und Werte plausibel.
