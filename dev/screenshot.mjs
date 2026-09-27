// Screenshots der Karte mit Mock-Daten: cd dev && npm install && node screenshot.mjs
// Ergebnis: dev/out/*.png – vor jedem UI-Commit ansehen (dunkel, hell, schmal).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
mkdirSync(out, { recursive: true });
const url = (q) => 'file://' + path.join(here, 'mock.html') + '?' + new URLSearchParams(q);

const shots = [
  ['diagramm-dunkel', { theme: 'dark', ansicht: 'diagramm' }, 900],
  ['diagramm-hell', { theme: 'light', ansicht: 'diagramm' }, 900],
  ['diagramm-schmal', { theme: 'dark', ansicht: 'diagramm', breite: '358' }, 390],
  ['diagramm-tag-kwh', { theme: 'dark', ansicht: 'diagramm', zeitraum: 'tag', einheit: 'kwh' }, 900],
  ['diagramm-gesamt', { theme: 'light', ansicht: 'diagramm', zeitraum: 'gesamt' }, 900],
  ['diagramm-jahr', { theme: 'dark', ansicht: 'diagramm', zeitraum: 'jahr' }, 900],
  ['diagramm-tag-eur', { theme: 'light', ansicht: 'diagramm', zeitraum: 'tag' }, 900],
  ['diagramm-ohne-grundpreis', { theme: 'dark', ansicht: 'diagramm', grundpreis: '0' }, 900],
  // 4 Tage zurück: vor der letzten Ablesung, „Nicht erfasst“ geschätzt/schraffiert
  ['diagramm-stunden-geschaetzt', { theme: 'light', ansicht: 'diagramm', zeitraum: 'tag', einheit: 'kwh' }, 900, 4],
  ['vertraege', { theme: 'dark', ansicht: 'vertraege' }, 900],
  ['zaehler', { theme: 'light', ansicht: 'zaehler' }, 900],
  ['kosten', { theme: 'dark', ansicht: 'kosten' }, 900],
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
let errors = 0;
for (const [name, q, width, zurueck = 0] of shots) {
  const page = await browser.newPage({ viewport: { width, height: 1200 } });
  page.on('pageerror', (e) => { errors++; console.error(`[${name}] Fehler:`, e.message); });
  page.on('console', (m) => m.type() === 'error' && (errors++, console.error(`[${name}] Konsole:`, m.text())));
  await page.goto(url(q));
  await page.waitForTimeout(800);
  for (let i = 0; i < zurueck; i++) {
    await page.locator('strom-tarife-card [data-shift="-1"]').click();
    await page.waitForTimeout(300);
  }
  await page.locator('strom-tarife-card').screenshot({ path: path.join(out, `${name}.png`) });
  await page.close();
}
await browser.close();
console.log(errors ? `${errors} Fehler – siehe oben` : `OK – ${shots.length} Screenshots in ${out}`);
process.exit(errors ? 1 : 0);
