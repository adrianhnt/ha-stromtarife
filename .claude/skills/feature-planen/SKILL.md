---
name: feature-planen
description: Plant gemeinsam mit dem Nutzer ein neues Feature für die Stromtarife-Integration und schreibt das Ergebnis als umsetzbares GitHub-Issue. Nutzen, wenn der Nutzer ein Feature vorschlägt, eine Idee planen oder durchsprechen will oder ausdrücklich /feature-planen aufruft. Nicht für die Umsetzung selbst.
---

# Feature planen

Ziel: Aus einem Featurevorschlag wird im Dialog ein vollständig geklärtes GitHub-Issue, das eine **neue Session ohne Vorwissen** umsetzen kann. In dieser Session wird **kein Code geschrieben** und nichts committet.

## Ablauf

### 1. Verstehen und Kontext sammeln

Bevor die erste Frage kommt:

- `CLAUDE.md` gilt (Datenmodell, Statistiken, Karte, Fallstricke). Die betroffenen Dateien lesen, damit Fragen und Vorschläge zum echten Code passen.
- Offene und geschlossene Issues nach Duplikaten oder verwandten Themen durchsuchen (`mcp__github__search_issues` bzw. `list_issues` in `adrianhnt/ha-stromtarife`). Gibt es schon ein Issue, fragen: dieses ergänzen oder ein neues anlegen?
- In zwei, drei Sätzen zusammenfassen, wie das Feature verstanden wurde und welche Teile der Integration es berührt (Python-Kern, WebSocket, Sensoren, Statistiken, Karte, Doku).

### 2. Rückfragen, bis alles geklärt ist

Fragen in Runden stellen, nicht alles auf einmal:

- Pro Runde höchstens 3–4 Fragen, nach Wichtigkeit sortiert. Für Fragen mit klaren Alternativen `AskUserQuestion` nutzen, eine Empfehlung als erste Option mit „(empfohlen)“ markieren und kurz begründen.
- Eigene Empfehlungen geben statt nur zu fragen. Was sich aus dem Code oder aus `CLAUDE.md` beantworten lässt, nicht fragen, sondern als Annahme nennen.
- Nach jeder Runde den Stand kurz festhalten: **geklärt**, **offen**, **Annahmen**.
- Weiterfragen, bis die Checkliste unten vollständig ist und der Nutzer keine offenen Punkte mehr sieht. Nicht aus Ungeduld abkürzen; wenn der Nutzer selbst abbrechen will, offene Punkte im Issue unter „Offene Fragen“ aufführen.

**Checkliste – was geklärt sein muss** (Nicht-Zutreffendes ausdrücklich als „entfällt“ markieren):

- [ ] Problem / Nutzen: Wer hat welches Problem, welche Situation?
- [ ] Umfang: Was gehört dazu, was ausdrücklich **nicht** (Non-Goals)?
- [ ] Verhalten im Detail inkl. Rand- und Fehlerfälle (leere Daten, Lücken zwischen Verträgen, Zeitumstellung, Zukunft, Nicht-Admins, Neuberechnung läuft gerade).
- [ ] Datenmodell / Speicher: neue Felder? Migration alter Daten? Rückwärtskompatibel?
- [ ] Statistiken / Recorder: betroffen? Welche Neuberechnung (`nur_zaehler`, alles, stündlich)? Zeilenzahl beachten (keine Stundenzeilen für den Zähler).
- [ ] WebSocket-API und Dienste: neue oder geänderte Befehle, Schema. `ablesung/save` und `sensor.stromtarife_zahlerstand` müssen kompatibel bleiben.
- [ ] Entitäten: neue Sensoren/Buttons, Namen, Einheiten.
- [ ] Karte: welche `ansicht`, Layout (auch 390 px schmal, hell/dunkel), neue Kartenoptionen und Standardwerte, localStorage-Schlüssel, Texte (Deutsch, Zahlen `de-DE`), Diagramm-Regeln aus `CLAUDE.md`.
- [ ] Config-Flow / Optionen.
- [ ] Mindestversion HA 2025.11: neue HA-APIs nötig? Dann gegen die Mindestversion prüfen.
- [ ] Doku: beide READMEs, `CHANGELOG.md`, Screenshots, ggf. `CLAUDE.md`.
- [ ] Tests: was soll `dev/test_tarife_stub.py` prüfen, was der Mock (`dev/mock.html`) zeigen?
- [ ] Release: Teil eines Releases? Python-Änderung (braucht HA-Neustart) oder nur JS?
- [ ] Einordnung: Phase-Label und Typ-Label, Abhängigkeiten zu anderen Issues, ggf. Aufteilung in mehrere Issues.

### 3. Entwurf zeigen

Den vollständigen Issue-Text (siehe Vorlage) im Chat zeigen und fragen, ob er so angelegt werden soll. Änderungswünsche einarbeiten und erneut zeigen. Das Issue erst nach ausdrücklichem OK anlegen.

### 4. Issue anlegen

- Mit `mcp__github__issue_write` (method `create`) in `adrianhnt/ha-stromtarife`.
- **Sprache Englisch** (Backlog-Regel aus `CLAUDE.md`), Titel kurz und imperativ bzw. beschreibend wie die bestehenden Issues.
- Labels: genau ein Phasen-Label (`phase-1: release`, `phase-2: usability`, `phase-3: growth`) plus Typ (`enhancement`, `bug`, `documentation`, `infra`, `decision`).
- Ein bestehendes Issue wird stattdessen mit `issue_write` (method `update`) überarbeitet, nur nach OK.
- **Keine persönlichen Daten** (echte Verträge, Zählerstände, Adressen, URLs der eigenen Instanz) – das Repo ist öffentlich. Beispiele mit erfundenen Werten.
- Danach den Link zum Issue nennen und den Startsatz für die Umsetzungs-Session vorschlagen, z. B.: „Setze Issue #<n> um.“

## Vorlage für den Issue-Text

Abschnitte, die nicht zutreffen, weglassen. Das Issue muss für sich allein verständlich sein: keine Verweise auf „wie besprochen“, sondern die Entscheidung selbst hineinschreiben.

```markdown
## Problem

<Wer, welche Situation, was ist heute umständlich oder unmöglich.>

## Goal

<Ein, zwei Sätze: was nach der Umsetzung möglich ist.>

## Requirements

### Behavior
- <Konkretes, prüfbares Verhalten, inkl. Rand- und Fehlerfälle>

### Data model / storage
- <Felder, Migration, Rückwärtskompatibilität>

### Statistics / recalculation
- <Betroffene Reihen, welche Neuberechnung>

### WebSocket API / services / entities
- <Befehle mit Schema, Entitäten>

### Card
- <ansicht, Layout, Optionen mit Standardwerten, localStorage-Schlüssel, deutsche UI-Texte wörtlich>

### Documentation
- <READMEs (both), CHANGELOG, screenshots, CLAUDE.md>

## Non-goals

- <Was ausdrücklich nicht dazugehört>

## Decisions

- <Entscheidung> – <kurze Begründung, verworfene Alternative>

## Implementation notes

- <Betroffene Dateien und Funktionen, Fallstricke aus CLAUDE.md, die hier relevant sind>

## Open questions

- <Nur falls der Nutzer die Planung mit offenen Punkten beendet hat>

## Done when

- [ ] <Prüfbares Akzeptanzkriterium>
- [ ] `python3 dev/test_tarife_stub.py` ends with `OK` (covers <…>)
- [ ] `node --check` passes; screenshots checked (dark, light, 390 px)
- [ ] Both READMEs and CHANGELOG updated
```
