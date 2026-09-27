// Stromtarife – Dashboard-Karte (Verträge als Tabelle / Kostenübersicht)
// type: custom:strom-tarife-card
// ansicht: vertraege | zaehler | kosten | diagramm (einheit: kwh|eur, zeitraum: tag|woche|monat|jahr|gesamt, grundpreis: true|false)

const DOMAIN = "strom_tarife";
const EVENT = "strom-tarife-updated";
const HIDDEN_KEY = "strom-tarife-diagramm-ausgeblendet";
const UNTRACKED = "__nicht_erfasst";
const BASE = "__grundpreis";
const BASE_KEY = "strom-tarife-diagramm-grundpreis";

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const num2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};
const fmtTime = (iso) => {
  if (!iso) return "";
  const [d, t] = iso.split("T");
  return `${fmtDate(d)} ${t}`;
};
const num1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
const localNow = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const gpText = (v) => {
  const yearly = v.grundpreis_einheit !== "monat";
  const main = `${eur.format(v.grundpreis_eur)}/${yearly ? "Jahr" : "Monat"}`;
  const other = yearly ? `≈ ${eur.format(v.grundpreis_eur / 12)}/Monat` : `≈ ${eur.format(v.grundpreis_eur * 12)}/Jahr`;
  return `${main}<div class="sub">${other}</div>`;
};
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------------------------------------------------------------- Zeiträume (Diagramm)
const pct1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const KINDS = [
  ["tag", "Tag"],
  ["woche", "Woche"],
  ["monat", "Monat"],
  ["jahr", "Jahr"],
  ["gesamt", "Gesamt"],
];
// ältere Konfiguration: monate -> monat, jahre -> gesamt
const normKind = (k) => ({ monate: "monat", jahre: "gesamt" })[k] ?? (KINDS.some(([x]) => x === k) ? k : "monat");
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function periodFor(kind, ref, firstYear) {
  const d = startOfDay(ref);
  if (kind === "tag") return { art: kind, start: d, end: addDays(d, 1) };
  if (kind === "woche") {
    const s = addDays(d, -((d.getDay() + 6) % 7));
    return { art: kind, start: s, end: addDays(s, 7) };
  }
  if (kind === "monat") return { art: kind, start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 1) };
  if (kind === "jahr") return { art: kind, start: new Date(d.getFullYear(), 0, 1), end: new Date(d.getFullYear() + 1, 0, 1) };
  return { art: "gesamt", start: new Date(firstYear ?? d.getFullYear(), 0, 1), end: new Date(new Date().getFullYear() + 1, 0, 1) };
}

// Balkenraster nach Länge des Zeitraums (wie im Energie-Dashboard)
function granularity(p) {
  const days = Math.round((p.end - p.start) / 864e5);
  if (days <= 2) return "hour";
  if (days <= 62) return "day";
  if (days <= 1100) return "month";
  return "year";
}

function bucketKey(d, g) {
  if (g === "hour") return d.getTime();
  if (g === "day") return startOfDay(d).getTime();
  if (g === "month") return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return new Date(d.getFullYear(), 0, 1).getTime();
}

function bucketsFor(p, g) {
  const out = [];
  if (g === "hour") {
    for (let t = p.start.getTime(); t < p.end.getTime(); t += 36e5) out.push(new Date(t));
    return out;
  }
  let d = new Date(bucketKey(p.start, g));
  while (d < p.end) {
    out.push(d);
    d = g === "day" ? addDays(d, 1) : g === "month" ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : new Date(d.getFullYear() + 1, 0, 1);
  }
  return out;
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 864e5 + 1) / 7);
}

const dfmt = (d, o) => d.toLocaleDateString("de-DE", o);
const DMY = { day: "2-digit", month: "2-digit", year: "numeric" };

function periodLabel(p) {
  const last = addDays(p.end, -1);
  switch (p.art) {
    case "tag":
      return dfmt(p.start, { weekday: "short", ...DMY });
    case "woche":
      return `KW ${isoWeek(p.start)} · ${dfmt(p.start, { day: "2-digit", month: "2-digit" })}–${dfmt(last, DMY)}`;
    case "monat":
      return dfmt(p.start, { month: "long", year: "numeric" });
    case "jahr":
      return String(p.start.getFullYear());
    case "gesamt":
      return `${p.start.getFullYear()}–${last.getFullYear()}`;
    default:
      return last.getTime() === p.start.getTime() ? dfmt(p.start, DMY) : `${dfmt(p.start, DMY)} – ${dfmt(last, DMY)}`;
  }
}

function bucketLabel(d, g, p) {
  if (g === "hour") return String(d.getHours());
  if (g === "day") return p.art === "woche" ? `${dfmt(d, { weekday: "short" }).replace(".", "")} ${d.getDate()}.` : `${d.getDate()}.`;
  if (g === "month") {
    const m = dfmt(d, { month: "short" }).replace(".", "");
    return d.getMonth() === 0 || d.getTime() === bucketKey(p.start, "month") ? `${m} ${String(d.getFullYear()).slice(2)}` : m;
  }
  return String(d.getFullYear());
}

function bucketTitle(d, g) {
  if (g === "hour") {
    const e = new Date(d.getTime() + 36e5);
    return `${dfmt(d, DMY)}, ${d.getHours()}–${e.getHours() || 24} Uhr`;
  }
  if (g === "day") return dfmt(d, { weekday: "short", ...DMY });
  if (g === "month") return dfmt(d, { month: "long", year: "numeric" });
  return String(d.getFullYear());
}

// ---------------------------------------------------------------- Grundpreis (Diagramm)
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Vertrag an einem Tag – wie contract_at im Backend: bei Überschneidung gilt der spätere Beginn
function contractOn(vertraege, iso) {
  let best = null;
  for (const v of vertraege) if (v.von <= iso && (!v.bis || iso <= v.bis) && (!best || v.von > best.von)) best = v;
  return best;
}

const gpPerMonth = (v) => (v?.grundpreis_eur || 0) / (v?.grundpreis_einheit === "monat" ? 1 : 12);

// Grundpreis je Balken: jeder Monat trägt 1/12 des Jahrespreises (bzw. den Monatspreis) des an dem Tag
// gültigen Vertrags, gleichmäßig auf seine Tage und Stunden verteilt – bis jetzt, nicht in die Zukunft
function basePrice(vertraege, p, g, bucketStarts) {
  const out = new Map(bucketStarts.map((b) => [b.getTime(), 0]));
  const stop = Math.min(p.end.getTime(), Date.now());
  for (let d = startOfDay(p.start); d.getTime() < stop; d = addDays(d, 1)) {
    const next = addDays(d, 1);
    const perDay = gpPerMonth(contractOn(vertraege, isoDay(d))) / new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (!perDay) continue;
    const from = Math.max(d.getTime(), p.start.getTime());
    const to = Math.min(next.getTime(), stop);
    const perMs = perDay / (next - d); // echte Tageslänge, auch bei Zeitumstellung
    if (g !== "hour") {
      const k = bucketKey(d, g);
      out.set(k, (out.get(k) ?? 0) + perMs * (to - from));
      continue;
    }
    for (let t = from; t < to; t += 36e5) out.set(t, (out.get(t) ?? 0) + perMs * (Math.min(t + 36e5, to) - t));
  }
  return out;
}

const readingDate = (iso) => {
  const [dd, t] = iso.split("T");
  const [yy, mm, day] = dd.split("-").map(Number);
  const [h, mi] = (t || "00:00").split(":").map(Number);
  return new Date(yy, mm - 1, day, h, mi);
};

const STYLE = `
  :host { display: block; }
  ha-card { padding: 16px; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .title { font-size: 1.2em; font-weight: 500; }
  button { font: inherit; cursor: pointer; border-radius: 8px; border: none; padding: 6px 12px; }
  .primary { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .plain { background: transparent; color: var(--primary-color); }
  .danger { background: var(--error-color, #db4437); color: #fff; }
  .icon { background: transparent; color: var(--secondary-text-color); padding: 4px; }
  .icon:hover { color: var(--primary-text-color); }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.95em; }
  th { text-align: left; font-weight: 500; color: var(--secondary-text-color); padding: 6px 8px; border-bottom: 1px solid var(--divider-color); white-space: nowrap; }
  td { padding: 8px; border-bottom: 1px solid var(--divider-color); vertical-align: top; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  td.nowrap { white-space: nowrap; }
  td.note { color: var(--secondary-text-color); max-width: 260px; white-space: pre-wrap; }
  tr.active td { background: rgba(var(--rgb-primary-color, 3,169,244), 0.08); }
  tr.total td { font-weight: 500; }
  .chip { display: inline-block; font-size: 0.75em; padding: 1px 6px; border-radius: 8px; margin-left: 6px; vertical-align: middle; }
  .chip.ok { background: var(--success-color, #43a047); color: #fff; }
  .chip.warn { background: var(--warning-color, #ffa600); color: #000; }
  .hint { margin-top: 12px; padding: 8px 12px; border-radius: 8px; background: rgba(255,166,0,0.15); font-size: 0.9em; }
  .status { margin-top: 10px; font-size: 0.85em; color: var(--secondary-text-color); }
  .empty { color: var(--secondary-text-color); padding: 12px 0; }
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 10; }
  .dialog { background: var(--card-background-color, #fff); color: var(--primary-text-color); border-radius: 16px; padding: 20px; width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
  .dialog h3 { margin: 0 0 16px; font-weight: 500; }
  label { display: block; font-size: 0.85em; color: var(--secondary-text-color); margin: 10px 0 4px; }
  input, textarea { box-sizing: border-box; width: 100%; font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--secondary-background-color, transparent); color: var(--primary-text-color); }
  textarea { min-height: 70px; resize: vertical; }
  .row { display: flex; gap: 12px; }
  .row > div { flex: 1; }
  .unit { font-size: 0.8em; color: var(--secondary-text-color); }
  .err { color: var(--error-color, #db4437); margin-top: 10px; font-size: 0.9em; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
  .actions .left { margin-right: auto; }
  select { box-sizing: border-box; width: 100%; font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--secondary-background-color, transparent); color: var(--primary-text-color); }
  .sub { font-size: 0.8em; color: var(--secondary-text-color); }
  .seg { display: inline-flex; border: 1px solid var(--divider-color); border-radius: 8px; overflow: hidden; }
  .seg button { border-radius: 0; background: transparent; color: var(--secondary-text-color); padding: 4px 12px; }
  .seg button.on { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .controls { display: flex; gap: 8px 12px; flex-wrap: wrap; align-items: center; }
  label.tgl { display: inline-flex; align-items: center; gap: 6px; margin: 0; font-size: 0.9em; color: var(--primary-text-color); cursor: pointer; white-space: nowrap; }
  label.tgl input { width: auto; margin: 0; padding: 0; accent-color: var(--primary-color); cursor: pointer; }
  .chart { position: relative; }
  .chart svg { display: block; width: 100%; height: auto; overflow: visible; }
  .chart .gridline { stroke: var(--divider-color); stroke-width: 1; }
  .chart .axis { fill: var(--secondary-text-color); font-size: 11px; }
  .chart .hit { fill: transparent; cursor: default; }
  .chart .hit:hover { fill: var(--primary-text-color); fill-opacity: 0.05; }
  .tip { position: absolute; pointer-events: none; background: var(--card-background-color, #fff); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 8px; padding: 8px 10px; font-size: 0.85em; box-shadow: 0 4px 16px rgba(0,0,0,0.25); min-width: 170px; z-index: 2; }
  .tip .t { font-weight: 500; margin-bottom: 4px; }
  .tip .r { display: flex; justify-content: space-between; gap: 12px; }
  .tip .tot { border-top: 1px solid var(--divider-color); margin-top: 4px; padding-top: 4px; font-weight: 500; }
  .period { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
  .seg.kinds button { padding: 4px 10px; }
  /* von rechts: Datum ‹ › immer außen rechts (Pfeile direkt nebeneinander), „Heute“ links daneben oder bei Platzmangel darunter */
  .pnav { display: flex; flex-direction: row-reverse; flex-wrap: wrap; align-items: center; gap: 2px; margin-left: auto; }
  .psel { display: flex; align-items: center; gap: 2px; }
  /* feste Breite, damit „Heute“ und die Klickfläche beim Blättern nicht springen */
  .plabel { background: transparent; color: var(--primary-text-color); padding: 4px 8px; display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; font-weight: 500; width: 14.5em; max-width: 100%; box-sizing: border-box; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .plabel .pl { overflow: hidden; text-overflow: ellipsis; }
  .nav[disabled] { opacity: 0.3; cursor: default; }
  .small { padding: 4px 8px; font-size: 0.9em; }
  .picker { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; margin: 0 0 10px; padding: 10px; border: 1px solid var(--divider-color); border-radius: 8px; }
  .picker > div { flex: 1; min-width: 130px; }
  .picker label { margin-top: 0; }
  .picker .err { flex-basis: 100%; margin-top: 0; }
  .split { display: flex; flex-wrap: wrap; gap: 16px 24px; align-items: center; margin-top: 16px; }
  .split .pie { flex: none; margin: 0 auto; overflow: visible; }
  .split .scroll { flex: 1; min-width: 260px; }
  .pie .ptot { fill: var(--primary-text-color); font-size: 15px; font-weight: 500; }
  .pie .psub { fill: var(--secondary-text-color); font-size: 11px; }
  .pie .slice { stroke: var(--card-background-color, var(--ha-card-background, #fff)); stroke-width: 2; stroke-linejoin: round; }
  .split [data-k] { transition: opacity 0.15s; }
  .split .dim { opacity: 0.35; }
  table.share td, table.share th { padding: 5px 8px; }
  table.share tr.srow { cursor: pointer; }
  table.share tr.srow:hover td { background: rgba(127, 127, 127, 0.08); }
  table.share tr.off td { color: var(--secondary-text-color); }
  table.share tr.off .lg { text-decoration: line-through; opacity: 0.6; }
  table.share tr.off .sw { background: transparent !important; box-shadow: inset 0 0 0 1.5px var(--secondary-text-color); }
  table.share .lg { background: transparent; color: inherit; padding: 0; text-align: left; font: inherit; }
  table.share .sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 8px; vertical-align: -1px; }
  table.share tfoot td { font-weight: 500; border-bottom: none; }
  table.share .pct { color: var(--secondary-text-color); }
  .all { background: transparent; color: var(--primary-color); padding: 0; font-size: 0.95em; font-weight: 400; }
`;
class StromTarifeCard extends HTMLElement {
  setConfig(config) {
    this._config = { ansicht: "vertraege", ...config };
    this._data = null;
    this._costs = null;
    this._dialog = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  static getStubConfig() {
    return { ansicht: "vertraege" };
  }

  getCardSize() {
    return 5;
  }

  getGridOptions() {
    return { columns: "full" };
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._load();
  }

  connectedCallback() {
    this._onUpdated = () => this._load();
    window.addEventListener(EVENT, this._onUpdated);
    this._timer = setInterval(() => this._load(), 5 * 60 * 1000);
    this._observeSize();
    if (this._hass) this._load();
  }

  _observeSize() {
    if (this._ro || this._config.ansicht !== "diagramm") return;
    let lastWidth = 0;
    this._ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (Math.abs(w - lastWidth) > 20 && this._chart) {
        lastWidth = w;
        this._render();
      }
    });
    this._ro.observe(this);
  }

  disconnectedCallback() {
    this._ro?.disconnect();
    this._ro = null;
    window.removeEventListener(EVENT, this._onUpdated);
    clearInterval(this._timer);
    clearTimeout(this._poll);
  }

  get _isAdmin() {
    return !!this._hass?.user?.is_admin;
  }

  async _load() {
    if (!this._hass) return;
    try {
      this._data = await this._hass.callWS({ type: `${DOMAIN}/data` });
      this._error = null;
      if (this._config.ansicht === "kosten") await this._loadCosts();
      if (this._config.ansicht === "diagramm") await this._loadChart();
    } catch (err) {
      this._error = err.message || String(err);
    }
    this._render();
    if (this._data?.berechnung?.laeuft) this._pollUntilDone();
  }

  _pollUntilDone() {
    clearTimeout(this._poll);
    this._poll = setTimeout(async () => {
      const before = this._data?.berechnung?.laeuft;
      await this._load();
      if (before && !this._data?.berechnung?.laeuft) window.dispatchEvent(new Event(EVENT));
    }, 2500);
  }

  async _loadCosts() {
    const periods = [
      ["monat", { period: "month" }],
      ["jahr", { period: "year" }],
      ["vorjahr", { period: "year", offset: -1 }],
    ];
    const costs = {};
    await Promise.all(
      this._data.reihen.flatMap((r) =>
        periods.map(async ([key, calendar]) => {
          try {
            const res = await this._hass.callWS({
              type: "recorder/statistic_during_period",
              statistic_id: r.statistic_id,
              types: ["change"],
              calendar,
            });
            (costs[r.id] ??= {})[key] = res.change;
          } catch (e) {
            (costs[r.id] ??= {})[key] = null;
          }
        })
      )
    );
    this._costs = costs;
  }

  // ------------------------------------------------------------------ Diagramm

  get _hidden() {
    if (!this.__hidden) {
      let saved = [];
      try {
        saved = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]");
      } catch (e) {}
      this.__hidden = new Set(Array.isArray(saved) ? saved : []);
    }
    return this.__hidden;
  }

  _toggleSeries(key) {
    const hidden = this._hidden;
    hidden.has(key) ? hidden.delete(key) : hidden.add(key);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
    } catch (e) {}
    this._render();
  }

  get _chartMode() {
    return this.__chartMode ?? this._config.einheit ?? "eur";
  }

  // Grundpreis im €-Diagramm: Startwert aus `grundpreis: true|false`, danach merkt sich der Browser den Schalter
  get _withBase() {
    if (this.__withBase === undefined) {
      let saved = null;
      try {
        saved = localStorage.getItem(BASE_KEY);
      } catch (e) {}
      this.__withBase = saved === null ? this._config.grundpreis !== false : saved === "1";
    }
    return this.__withBase;
  }

  _setWithBase(on) {
    this.__withBase = on;
    try {
      localStorage.setItem(BASE_KEY, on ? "1" : "0");
    } catch (e) {}
    this._render();
  }

  _firstYear() {
    const first = this._data?.ablesungen?.[this._data.ablesungen.length - 1];
    return first ? Number(first.zeitpunkt.slice(0, 4)) : new Date().getFullYear();
  }

  get _period() {
    if (!this.__period) this.__period = periodFor(normKind(this._config.zeitraum), new Date(), this._firstYear());
    return this.__period;
  }

  async _setPeriod(p) {
    this.__period = p;
    this.__picker = false;
    this._chart = null;
    this._render();
    await this._loadChart();
    this._render();
  }

  _shiftPeriod(dir) {
    const p = this._period;
    if (p.art === "gesamt") return;
    if (p.art === "eigener") {
      const span = Math.round((p.end - p.start) / 864e5);
      return this._setPeriod({ art: "eigener", start: addDays(p.start, dir * span), end: addDays(p.end, dir * span) });
    }
    return this._setPeriod(periodFor(p.art, dir > 0 ? p.end : addDays(p.start, -1), this._firstYear()));
  }

  async _loadChart() {
    const token = (this._chartToken = (this._chartToken || 0) + 1);
    const p = this._period;
    const g = granularity(p);
    const kwh = this._chartMode === "kwh";
    const total = this._data.reihen.find((r) => r.id === "gesamt");
    const devices = this._data.reihen.filter((r) => r.id !== "gesamt");
    const idOf = (r) => (kwh ? r.source : r.statistic_id);
    // Der Zähler hat nur Tageswerte – bei Stundenbalken kommt „Nicht erfasst“ aus den Tagessummen
    const totalPeriod = g === "hour" ? "day" : g;
    const req = (ids, period) =>
      ids.length
        ? this._hass.callWS({
            type: "recorder/statistics_during_period",
            start_time: p.start.toISOString(),
            end_time: p.end.toISOString(),
            statistic_ids: ids,
            period,
            types: ["change"],
            units: { energy: "kWh" },
          })
        : Promise.resolve({});
    const [res, resTot] = await Promise.all([req(devices.map(idOf), g), req(total ? [idOf(total)] : [], totalPeriod)]);
    if (token !== this._chartToken) return;
    const toMap = (rows, gg) => {
      const m = new Map();
      for (const row of rows || []) {
        const k = bucketKey(new Date(row.start), gg);
        m.set(k, (m.get(k) ?? 0) + (row.change ?? 0));
      }
      return m;
    };
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const devMaps = devices.map((d) => toMap(res[idOf(d)], g));
    const totMap = total ? toMap(resTot[idOf(total)], totalPeriod) : new Map();
    const starts = bucketsFor(p, g);
    const baseMap = kwh ? new Map() : basePrice(this._data.vertraege, p, g, starts);
    const buckets = starts.map((b) => {
      const k = b.getTime();
      const values = devMaps.map((m) => Math.max(0, m.get(k) ?? 0));
      const untracked = g !== "hour" && totMap.has(k) ? Math.max(0, totMap.get(k) - sum(values)) : 0;
      return { start: b, values, untracked, base: baseMap.get(k) ?? 0 };
    });
    const totals = devices.map((_, i) => sum(buckets.map((b) => b.values[i])));
    const untrackedTotal =
      g === "hour" ? (totMap.size ? Math.max(0, sum([...totMap.values()]) - sum(totals)) : 0) : sum(buckets.map((b) => b.untracked));
    const baseTotal = sum(buckets.map((b) => b.base));
    this._chart = { kwh, g, period: p, series: devices.map((d) => d.name), buckets, totals, untrackedTotal, untrackedKnown: totMap.size > 0, baseTotal };
  }

  _renderPeriodBar() {
    const p = this._period;
    const now = new Date();
    const current = p.start <= now && now < p.end;
    const kinds = KINDS.map(([k, label]) => `<button data-kind="${k}" class="${p.art === k ? "on" : ""}">${label}</button>`).join("");
    const nav =
      p.art === "gesamt"
        ? ""
        : `<button class="icon nav" data-shift="-1" title="Zurück" aria-label="Zurück"><ha-icon icon="mdi:chevron-left"></ha-icon></button>`;
    const navNext =
      p.art === "gesamt"
        ? ""
        : `<button class="icon nav" data-shift="1" title="Weiter" aria-label="Weiter"${p.end > now ? " disabled" : ""}><ha-icon icon="mdi:chevron-right"></ha-icon></button>`;
    const today = !current && p.art !== "gesamt" ? `<button class="plain small" id="p-today">Heute</button>` : "";
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const picker = this.__picker
      ? `<div class="picker">
          <div><label>Von</label><input type="date" id="p-von" value="${iso(p.start)}"></div>
          <div><label>Bis</label><input type="date" id="p-bis" value="${iso(addDays(p.end, -1))}"></div>
          <button class="primary" id="p-apply">Anzeigen</button>
          ${this.__pickerError ? `<div class="err">${esc(this.__pickerError)}</div>` : ""}
        </div>`
      : "";
    return `<div class="period">
        <div class="seg kinds">${kinds}</div>
        <div class="pnav"><div class="psel"><button class="plabel" id="p-open" title="Zeitraum frei wählen"><span class="pl">${esc(periodLabel(p))}</span></button>${nav}${navNext}</div>${today}</div>
      </div>${picker}`;
  }

  _renderChart() {
    const c = this._chart;
    const kwhMode = this._chartMode === "kwh";
    const title = this._config.title ?? (kwhMode ? "Verbrauch" : "Kosten");
    const modeSeg = `<div class="seg">${[
      ["kwh", "kWh"],
      ["eur", "€"],
    ]
      .map(([v, label]) => `<button data-mode="${v}" class="${this._chartMode === v ? "on" : ""}">${label}</button>`)
      .join("")}</div>`;
    const baseToggle = kwhMode
      ? ""
      : `<label class="tgl" title="Grundpreis anteilig je Monat einrechnen"><input type="checkbox" id="base-toggle"${this._withBase ? " checked" : ""}>mit Grundpreis</label>`;
    const head = `<div class="head"><div class="title">${esc(title)}</div><div class="controls">${baseToggle}${modeSeg}</div></div>${this._renderPeriodBar()}`;
    if (!c) return head + `<div class="empty">Lädt …</div>`;

    const dark = !!this._hass?.themes?.darkMode;
    const palette = dark
      ? ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]
      : ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
    const grey = dark ? "#6f6e69" : "#b4b2a9";
    const baseColor = dark ? "#a8a69d" : "#5f5e5a";
    const showBase = !c.kwh && this._withBase;
    // Mehr als 8 Geräte: Rest in „Weitere Geräte“ zusammenfassen (keine erfundenen Farben)
    let names = [...c.series];
    let buckets = c.buckets.map((b) => ({ ...b, values: [...b.values] }));
    let totals = [...c.totals];
    if (names.length > 8) {
      const fold = (arr) => [...arr.slice(0, 7), arr.slice(7).reduce((a, v) => a + v, 0)];
      names = [...names.slice(0, 7), "Weitere Geräte"];
      buckets = buckets.map((b) => ({ ...b, values: fold(b.values) }));
      totals = fold(totals);
    }
    const colors = names.map((_, i) => palette[i]);
    // Ausgeblendete Reihen zählen nicht mit – Farben bleiben am Gerät, Anteile beziehen sich auf das Angezeigte
    const hidden = this._hidden;
    const series = [
      ...names.map((n, i) => ({ key: n, name: n, color: colors[i], total: totals[i], idx: i })),
      { key: UNTRACKED, name: "Nicht erfasst", color: grey, total: c.untrackedTotal, idx: -1, unknown: !c.untrackedKnown },
    ].map((s) => ({ ...s, on: !hidden.has(s.key) }));
    // Grundpreis: Zeile und Schalter setzen dieselbe globale Einstellung (nicht die Ausblend-Liste der Geräte)
    if (!c.kwh) series.push({ key: BASE, name: "Grundpreis", color: baseColor, total: c.baseTotal, idx: -2, on: showBase, base: true });
    const showDev = names.map((n) => !hidden.has(n));
    const showUn = !hidden.has(UNTRACKED);
    buckets = buckets.map((b) => ({
      ...b,
      values: b.values.map((v, k) => (showDev[k] ? v : 0)),
      untracked: showUn ? b.untracked : 0,
      base: showBase ? b.base : 0,
    }));
    const visibleTotal = series.filter((s) => s.on).reduce((a, s) => a + s.total, 0);
    const anyHidden = series.some((s) => !s.on && !s.base);

    const fmt = (v) =>
      c.kwh ? `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: v < 10 ? 2 : v < 100 ? 1 : 0 }).format(v)} kWh` : eur.format(v);
    const pct = (v, of) => (of > 0 ? `${pct1.format((v / of) * 100)} %` : "–");

    // ---------------- Balken
    const W = Math.max(300, Math.round((this.getBoundingClientRect().width || 832) - 32));
    const H = W < 500 ? 200 : 260, L = 56, R = 4, T = 10, B = 26;
    const max = Math.max(...buckets.map((b) => b.values.reduce((a, v) => a + v, 0) + b.untracked + b.base), 0);
    const niceTop = max > 0 ? max : c.kwh ? 1 : 1;
    const step = (() => {
      const raw = niceTop / 4;
      const p10 = 10 ** Math.floor(Math.log10(raw));
      return [1, 2, 2.5, 5, 10].map((m) => m * p10).find((v) => v >= raw);
    })();
    const top = Math.ceil(niceTop / step) * step;
    const y = (v) => T + (H - T - B) * (1 - v / top);
    const band = (W - L - R) / buckets.length;
    const bw = Math.max(2, Math.min(24, band * 0.7));
    const every = Math.max(1, Math.ceil(buckets.length / Math.max(1, Math.floor((W - L - R) / (c.g === "month" ? 34 : 30)))));
    const axisNum = (v) => (c.kwh ? new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(v) : eur.format(v).replace(",00", ""));
    let svg = "";
    for (let v = 0; v <= top + 1e-9; v += step) {
      svg += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
      svg += `<text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${axisNum(v)}</text>`;
    }
    const roundedTop = (x, yTop, w, h, r) => {
      r = Math.min(r, h, w / 2);
      return `M${x},${yTop + h}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yTop + h}Z`;
    };
    buckets.forEach((b, i) => {
      const x = L + band * i + (band - bw) / 2;
      // Grundpreis als Sockel unten, darüber Geräte und „Nicht erfasst“
      const parts = [[b.base, baseColor, BASE], ...b.values.map((v, k) => [v, colors[k], names[k]]), [b.untracked, grey, UNTRACKED]].filter(
        ([v]) => v > 0
      );
      let acc = 0;
      parts.forEach(([v, color, key], k) => {
        const y0 = y(acc), y1 = y(acc + v);
        acc += v;
        const gap = k > 0 ? 2 : 0;
        const h = Math.max(0, y0 - y1 - gap);
        if (h <= 0) return;
        svg +=
          k === parts.length - 1
            ? `<path data-k="${esc(key)}" d="${roundedTop(x, y1, bw, h, 4)}" fill="${color}"/>`
            : `<rect data-k="${esc(key)}" x="${x}" y="${y1}" width="${bw}" height="${h}" fill="${color}"/>`;
      });
      if (i % every === 0) svg += `<text class="axis" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(bucketLabel(b.start, c.g, c.period))}</text>`;
      svg += `<rect class="hit" data-i="${i}" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}"/>`;
    });
    const bars = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)} ${esc(periodLabel(c.period))}">${svg}</svg><div class="tip" hidden></div></div>`;

    // ---------------- Kreis (Donut) + Tabelle mit Anteilen
    const S = W < 500 ? 150 : 176, rO = S / 2, rI = rO * 0.62, cx = S / 2, cy = S / 2;
    const slices = series.filter((s) => s.on && s.total > 0);
    const pt = (r, a) => `${(cx + r * Math.sin(a)).toFixed(2)},${(cy - r * Math.cos(a)).toFixed(2)}`;
    let pie = "";
    if (visibleTotal > 0) {
      let a0 = 0;
      for (const s of slices) {
        const a1 = a0 + (s.total / visibleTotal) * 2 * Math.PI;
        const tip = `${s.name}: ${fmt(s.total)} (${pct(s.total, visibleTotal)})`;
        if (slices.length === 1) {
          pie += `<circle data-k="${esc(s.key)}" cx="${cx}" cy="${cy}" r="${(rO + rI) / 2}" fill="none" stroke="${s.color}" stroke-width="${rO - rI}"><title>${esc(tip)}</title></circle>`;
        } else {
          const large = a1 - a0 > Math.PI ? 1 : 0;
          pie += `<path data-k="${esc(s.key)}" class="slice" fill="${s.color}" d="M${pt(rO, a0)}A${rO},${rO} 0 ${large} 1 ${pt(rO, a1)}L${pt(rI, a1)}A${rI},${rI} 0 ${large} 0 ${pt(rI, a0)}Z"><title>${esc(tip)}</title></path>`;
        }
        a0 = a1;
      }
      pie += `<text class="ptot" x="${cx}" y="${cy + 2}" text-anchor="middle">${esc(fmt(visibleTotal))}</text>`;
      pie += `<text class="psub" x="${cx}" y="${cy + 18}" text-anchor="middle">${anyHidden ? "angezeigt" : "gesamt"}</text>`;
    } else {
      pie = `<circle cx="${cx}" cy="${cy}" r="${(rO + rI) / 2}" fill="none" stroke="var(--divider-color)" stroke-width="${rO - rI}"/><text class="psub" x="${cx}" y="${cy + 4}" text-anchor="middle">keine Daten</text>`;
    }
    const rows = series
      .map(
        (s) => `<tr class="srow${s.on ? "" : " off"}" ${s.base ? "data-base-row" : `data-series="${esc(s.key)}"`} data-k="${esc(s.key)}">
          <td><button class="lg" aria-pressed="${s.on}" title="${s.base ? (s.on ? "Ohne Grundpreis rechnen" : "Mit Grundpreis rechnen") : s.on ? "Ausblenden" : "Einblenden"}"><span class="sw" style="background:${s.color}"></span>${esc(s.name)}</button></td>
          <td class="num">${s.unknown ? '<span class="sub">keine Zählerwerte</span>' : fmt(s.total)}</td>
          <td class="num pct">${s.on && !s.unknown ? pct(s.total, visibleTotal) : "–"}</td>
        </tr>`
      )
      .join("");
    const table = `<table class="share">
        <thead><tr><th>${anyHidden ? `<button class="all" data-series-all>Alle anzeigen</button>` : ""}</th><th class="num">${c.kwh ? "Verbrauch" : "Kosten"}</th><th class="num">Anteil</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>${anyHidden ? "Summe (angezeigt)" : "Summe"}</td><td class="num">${fmt(visibleTotal)}</td><td class="num pct">${visibleTotal > 0 ? "100 %" : "–"}</td></tr></tfoot>
      </table>`;
    const split = `<div class="split"><svg class="pie" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" role="img" aria-label="Aufteilung ${esc(periodLabel(c.period))}">${pie}</svg><div class="scroll">${table}</div></div>`;

    // ---------------- Hinweise
    const last = this._data.ablesungen[0];
    const notes = ["Anteile beziehen sich auf die angezeigten Reihen im gewählten Zeitraum. „Nicht erfasst“ = Zähler minus Geräte."];
    if (last && c.period.end > readingDate(last.zeitpunkt))
      notes.push(`Zählerwerte gibt es bis zur letzten Ablesung (${fmtTime(last.zeitpunkt)}); danach fehlt „Nicht erfasst“.`);
    if (c.g === "hour") notes.push("Der Zähler liefert Tageswerte: „Nicht erfasst“ steht in der Aufteilung, aber nicht in den Stundenbalken.");
    if (!c.kwh)
      notes.push(
        showBase
          ? "Grundpreis: je Monat 1/12 des Jahrespreises (bzw. der Monatspreis) des jeweils gültigen Vertrags, anteilig bis heute."
          : "Kosten ohne Grundpreis."
      );

    this._chartView = { buckets, names, colors, grey, baseColor, fmt, pct, anyHidden, g: c.g };
    return `${head}${bars}${split}<div class="status">${notes.join(" ")}</div>`;
  }

  _bindChart() {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (this.__chartMode === b.dataset.mode) return;
        this.__chartMode = b.dataset.mode;
        this._chart = null;
        this._render();
        await this._loadChart();
        this._render();
      })
    );
    root.querySelector("#base-toggle")?.addEventListener("change", (e) => this._setWithBase(e.target.checked));
    root.querySelector("[data-base-row]")?.addEventListener("click", () => this._setWithBase(!this._withBase));
    root.querySelectorAll("[data-kind]").forEach((b) =>
      b.addEventListener("click", () => {
        const p = this._period;
        // Bezugstag behalten (z. B. vom gewählten Monat in dessen Jahr wechseln), außer der Zeitraum enthält heute
        const now = new Date();
        const ref = p.start <= now && now < p.end ? now : p.start;
        this._setPeriod(periodFor(b.dataset.kind, ref, this._firstYear()));
      })
    );
    root.querySelectorAll("[data-shift]").forEach((b) => b.addEventListener("click", () => this._shiftPeriod(Number(b.dataset.shift))));
    root.querySelector("#p-today")?.addEventListener("click", () => {
      const art = this._period.art === "eigener" ? "monat" : this._period.art;
      this._setPeriod(periodFor(art, new Date(), this._firstYear()));
    });
    root.querySelector("#p-open")?.addEventListener("click", () => {
      this.__picker = !this.__picker;
      this.__pickerError = null;
      this._render();
    });
    root.querySelector("#p-apply")?.addEventListener("click", () => {
      const von = root.querySelector("#p-von").value;
      const bis = root.querySelector("#p-bis").value;
      const parse = (s) => {
        const [yy, mm, dd] = s.split("-").map(Number);
        return new Date(yy, mm - 1, dd);
      };
      if (!von || !bis) {
        this.__pickerError = "Bitte beide Daten angeben.";
        return this._render();
      }
      const start = parse(von), end = addDays(parse(bis), 1);
      if (end <= start) {
        this.__pickerError = "„Bis“ liegt vor „Von“.";
        return this._render();
      }
      this.__pickerError = null;
      this._setPeriod({ art: "eigener", start, end });
    });
    root.querySelectorAll("[data-series]").forEach((b) => b.addEventListener("click", () => this._toggleSeries(b.dataset.series)));
    root.querySelector("[data-series-all]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.__hidden = new Set();
      try {
        localStorage.removeItem(HIDDEN_KEY);
      } catch (e2) {}
      this._render();
    });
    // Hervorheben: Kreissegment <-> Tabellenzeile
    const highlight = (key) =>
      root.querySelectorAll(".split [data-k]").forEach((el) => el.classList.toggle("dim", key !== null && el.dataset.k !== key));
    root.querySelectorAll(".split [data-k]").forEach((el) => {
      el.addEventListener("mouseenter", () => highlight(el.dataset.k));
      el.addEventListener("mouseleave", () => highlight(null));
    });

    const tip = root.querySelector(".tip");
    const chart = root.querySelector(".chart");
    if (!tip || !this._chartView || !this._chart) return;
    const v = this._chartView;
    root.querySelectorAll(".hit").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        const b = v.buckets[+el.dataset.i];
        const sum = b.values.reduce((a, x) => a + x, 0) + b.untracked + b.base;
        const rows = [["Grundpreis", b.base, v.baseColor], ...b.values.map((val, k) => [v.names[k], val, v.colors[k]]), ["Nicht erfasst", b.untracked, v.grey]]
          .filter(([, val]) => val > 0)
          .reverse()
          .map(
            ([n, val, col]) =>
              `<div class="r"><span><span class="sw" style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${col}"></span>${esc(n)}</span><span>${v.fmt(val)} <span class="sub">${v.pct(val, sum)}</span></span></div>`
          )
          .join("");
        tip.innerHTML = `<div class="t">${esc(bucketTitle(b.start, v.g))}</div>${rows || '<div class="sub">keine Daten</div>'}<div class="r tot"><span>${v.anyHidden ? "Summe (angezeigt)" : "Summe"}</span><span>${v.fmt(sum)}</span></div>`;
        tip.hidden = false;
        const box = chart.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        let left = r.left - box.left + r.width / 2 + 12;
        if (left + 230 > box.width) left = r.left - box.left + r.width / 2 - 242;
        tip.style.left = `${Math.max(0, left)}px`;
        tip.style.top = `8px`;
      });
      el.addEventListener("mouseleave", () => (tip.hidden = true));
    });
  }

  // ------------------------------------------------------------------ Darstellung

  _render() {
    const root = this.shadowRoot;
    if (!root) return;
    let body;
    if (this._error) body = `<div class="err">${esc(this._error)}</div>`;
    else if (!this._data) body = `<div class="empty">Lädt …</div>`;
    else if (this._config.ansicht === "kosten") body = this._renderCosts();
    else if (this._config.ansicht === "zaehler") body = this._renderReadings();
    else if (this._config.ansicht === "diagramm") body = this._renderChart();
    else body = this._renderContracts();
    root.innerHTML = `<style>${STYLE}</style><ha-card>${body}</ha-card>${this._renderDialog()}`;
    this._bind();
  }

  _status() {
    const b = this._data.berechnung;
    if (b.laeuft) return `<div class="status">Kosten werden neu berechnet …</div>`;
    let text = "";
    if (b.zuletzt) {
      const d = new Date(b.zuletzt);
      text = `Zuletzt berechnet: ${d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}`;
    }
    if (b.fehler) text += `<div class="err">Fehler: ${esc(b.fehler)}</div>`;
    return text ? `<div class="status">${text}</div>` : "";
  }

  _renderContracts() {
    const title = this._config.title ?? "Stromverträge";
    const rows = this._data.vertraege
      .map((v) => {
        const chips =
          (v.aktiv ? `<span class="chip ok">aktuell</span>` : "") +
          (v.ueberschneidet.length ? `<span class="chip warn" title="Überschneidet sich mit einem anderen Vertrag – es gilt der mit dem späteren Beginn">überschneidet</span>` : "");
        const actions = this._isAdmin
          ? `<td class="nowrap"><button class="icon" data-edit="${v.id}" title="Bearbeiten"><ha-icon icon="mdi:pencil"></ha-icon></button></td>`
          : "";
        return `<tr class="${v.aktiv ? "active" : ""}">
          <td>${esc(v.anbieter)}${chips}</td>
          <td class="nowrap">${fmtDate(v.von)} – ${v.bis ? fmtDate(v.bis) : "offen"}</td>
          <td class="num">${num2.format(v.arbeitspreis_ct)} ct/kWh</td>
          <td class="num">${gpText(v)}</td>
          <td class="note">${esc(v.notiz)}</td>
          ${actions}
        </tr>`;
      })
      .join("");
    const table = this._data.vertraege.length
      ? `<div class="scroll"><table>
          <thead><tr><th>Anbieter</th><th>Gültig</th><th class="num">Arbeitspreis</th><th class="num">Grundpreis</th><th>Notiz</th>${this._isAdmin ? "<th></th>" : ""}</tr></thead>
          <tbody>${rows}</tbody></table></div>`
      : `<div class="empty">Noch kein Vertrag angelegt.</div>`;
    const gaps = this._data.luecken.length
      ? `<div class="hint"><b>Ohne Vertrag</b> (wird mit 0 € berechnet):<br>${this._data.luecken
          .map((l) => `${fmtDate(l.von)} – ${fmtDate(l.bis)}`)
          .join("<br>")}</div>`
      : "";
    const add = this._isAdmin ? `<button class="primary" id="add">+ Vertrag</button>` : "";
    return `<div class="head"><div class="title">${esc(title)}</div>${add}</div>${table}${gaps}${this._status()}`;
  }

  _renderReadings() {
    const title = this._config.title ?? "Zählerstände";
    const list = this._data.ablesungen;
    const rows = list
      .map((a) => {
        const actions = this._isAdmin
          ? `<td class="nowrap"><button class="icon" data-edit-reading="${a.id}" title="Bearbeiten"><ha-icon icon="mdi:pencil"></ha-icon></button></td>`
          : "";
        const verbrauch = a.verbrauch === undefined ? "" : `${num1.format(a.verbrauch)} kWh`;
        const proTag = a.pro_tag === undefined || a.pro_tag === null ? "" : `${num2.format(a.pro_tag)} kWh`;
        return `<tr>
          <td class="nowrap">${fmtTime(a.zeitpunkt)}</td>
          <td class="num">${num1.format(a.stand)} kWh</td>
          <td class="num">${verbrauch}</td>
          <td class="num">${proTag}</td>
          <td class="note">${esc(a.notiz)}</td>
          ${actions}
        </tr>`;
      })
      .join("");
    const table = list.length
      ? `<div class="scroll"><table>
          <thead><tr><th>Abgelesen</th><th class="num">Zählerstand</th><th class="num">Verbrauch seit davor</th><th class="num">Ø pro Tag</th><th>Notiz</th>${this._isAdmin ? "<th></th>" : ""}</tr></thead>
          <tbody>${rows}</tbody></table></div>`
      : `<div class="empty">Noch keine Ablesung eingetragen.</div>`;
    const add = this._isAdmin ? `<button class="primary" id="add-reading">+ Ablesung</button>` : "";
    return `<div class="head"><div class="title">${esc(title)}</div>${add}</div>${table}
      <div class="status">Zwischen zwei Ablesungen wird der Verbrauch gleichmäßig verteilt. Nach der letzten Ablesung erscheint noch nichts – erst mit der nächsten.</div>
      ${this._status()}`;
  }

  _renderCosts() {
    const title = this._config.title ?? "Stromkosten";
    const val = (id, key) => {
      const v = this._costs?.[id]?.[key];
      return v === null || v === undefined ? "–" : eur.format(v);
    };
    const now = new Date();
    const month = now.toLocaleString("de-DE", { month: "long" });
    const rows = this._data.reihen
      .map(
        (r) => `<tr class="${r.id === "gesamt" ? "total" : ""}">
          <td>${esc(r.name)}</td>
          <td class="num">${val(r.id, "monat")}</td>
          <td class="num">${val(r.id, "jahr")}</td>
          <td class="num">${val(r.id, "vorjahr")}</td>
        </tr>`
      )
      .join("");
    return `<div class="head"><div class="title">${esc(title)}</div></div>
      <div class="scroll"><table>
        <thead><tr><th></th><th class="num">${esc(month)}</th><th class="num">${now.getFullYear()}</th><th class="num">${now.getFullYear() - 1}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="status">Nur Arbeitspreis (ohne Grundpreis). Geräte zählen, seit ihre Steckdose misst.</div>
      ${this._data.berechnung.laeuft ? `<div class="status">Kosten werden neu berechnet …</div>` : ""}`;
  }

  _renderDialog() {
    const d = this._dialog;
    if (!d) return "";
    if (d.kind === "ablesung") return this._renderReadingDialog(d);
    const v = d.vertrag;
    if (d.confirmDelete) {
      return `<div class="overlay"><div class="dialog">
        <h3>Vertrag löschen?</h3>
        <div>${esc(v.anbieter)} (${fmtDate(v.von)} – ${v.bis ? fmtDate(v.bis) : "offen"}) wird gelöscht. Die Kosten werden danach neu berechnet.</div>
        ${d.error ? `<div class="err">${esc(d.error)}</div>` : ""}
        <div class="actions"><button class="plain" id="cancel">Abbrechen</button><button class="danger" id="confirm-delete">Löschen</button></div>
      </div></div>`;
    }
    const n = (x) => (x === null || x === undefined || x === "" ? "" : num2.format(x));
    return `<div class="overlay"><div class="dialog">
      <h3>${v.id ? "Vertrag bearbeiten" : "Neuer Vertrag"}</h3>
      <label>Anbieter</label><input id="f-anbieter" value="${esc(v.anbieter)}">
      <div class="row">
        <div><label>Gültig von</label><input id="f-von" type="date" value="${esc(v.von)}"></div>
        <div><label>Gültig bis <span class="unit">(leer = offen)</span></label><input id="f-bis" type="date" value="${esc(v.bis)}"></div>
      </div>
      <div class="row">
        <div><label>Arbeitspreis <span class="unit">ct/kWh</span></label><input id="f-ap" inputmode="decimal" value="${esc(n(v.arbeitspreis_ct))}" placeholder="z. B. 31,87"></div>
        <div><label>Grundpreis <span class="unit">€</span></label><input id="f-gp" inputmode="decimal" value="${esc(n(v.grundpreis_eur))}" placeholder="z. B. 156,38"></div>
        <div><label>pro</label><select id="f-gpe"><option value="jahr"${v.grundpreis_einheit !== "monat" ? " selected" : ""}>Jahr</option><option value="monat"${v.grundpreis_einheit === "monat" ? " selected" : ""}>Monat</option></select></div>
      </div>
      <label>Notiz</label><textarea id="f-notiz">${esc(v.notiz)}</textarea>
      ${d.error ? `<div class="err">${esc(d.error)}</div>` : ""}
      <div class="actions">
        ${v.id ? `<button class="plain left" id="delete" style="color:var(--error-color,#db4437)">Löschen</button>` : ""}
        <button class="plain" id="cancel">Abbrechen</button>
        <button class="primary" id="save">Speichern</button>
      </div>
    </div></div>`;
  }

  _renderReadingDialog(d) {
    const a = d.ablesung;
    if (d.confirmDelete) {
      return `<div class="overlay"><div class="dialog">
        <h3>Ablesung löschen?</h3>
        <div>${fmtTime(a.zeitpunkt)}: ${num1.format(a.stand)} kWh wird gelöscht. Verbrauch und Kosten werden danach neu berechnet.</div>
        ${d.error ? `<div class="err">${esc(d.error)}</div>` : ""}
        <div class="actions"><button class="plain" id="cancel">Abbrechen</button><button class="danger" id="confirm-delete">Löschen</button></div>
      </div></div>`;
    }
    const stand = a.stand === "" || a.stand === undefined ? "" : String(a.stand).replace(".", ",");
    return `<div class="overlay"><div class="dialog">
      <h3>${a.id ? "Ablesung bearbeiten" : "Neue Ablesung"}</h3>
      <label>Abgelesen am</label><input id="r-zeit" type="datetime-local" value="${esc(a.zeitpunkt)}">
      <label>Zählerstand <span class="unit">kWh</span></label><input id="r-stand" inputmode="decimal" value="${esc(stand)}" placeholder="z. B. 25362,0">
      <label>Notiz</label><textarea id="r-notiz">${esc(a.notiz)}</textarea>
      ${d.error ? `<div class="err">${esc(d.error)}</div>` : ""}
      <div class="actions">
        ${a.id ? `<button class="plain left" id="delete" style="color:var(--error-color,#db4437)">Löschen</button>` : ""}
        <button class="plain" id="cancel">Abbrechen</button>
        <button class="primary" id="save">Speichern</button>
      </div>
    </div></div>`;
  }

  _bind() {
    const $ = (sel) => this.shadowRoot.querySelector(sel);
    if (this._config.ansicht === "diagramm") this._bindChart();
    $("#add-reading")?.addEventListener("click", () => {
      this._dialog = { kind: "ablesung", ablesung: { zeitpunkt: localNow(), stand: "", notiz: "" } };
      this._render();
    });
    this.shadowRoot.querySelectorAll("[data-edit-reading]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const a = this._data.ablesungen.find((x) => x.id === btn.dataset.editReading);
        this._dialog = { kind: "ablesung", ablesung: { id: a.id, zeitpunkt: a.zeitpunkt, stand: a.stand, notiz: a.notiz } };
        this._render();
      })
    );
    $("#add")?.addEventListener("click", () => {
      const last = this._data.vertraege[0];
      this._dialog = {
        vertrag: { anbieter: last?.anbieter ?? "", von: "", bis: "", arbeitspreis_ct: "", grundpreis_eur: "", grundpreis_einheit: "jahr", notiz: "" },
      };
      this._render();
    });
    this.shadowRoot.querySelectorAll("[data-edit]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const v = this._data.vertraege.find((x) => x.id === btn.dataset.edit);
        this._dialog = { vertrag: { ...v, bis: v.bis ?? "" } };
        this._render();
      })
    );
    $("#cancel")?.addEventListener("click", () => {
      this._dialog = null;
      this._render();
    });
    $(".overlay")?.addEventListener("click", (e) => {
      if (e.target.classList.contains("overlay")) {
        this._dialog = null;
        this._render();
      }
    });
    $("#save")?.addEventListener("click", () => this._save());
    $("#delete")?.addEventListener("click", () => {
      if (this._dialog.kind === "ablesung") this._dialog = { ...this._dialog, ablesung: this._readReadingForm(), confirmDelete: true, error: null };
      else this._dialog = { ...this._dialog, vertrag: this._readForm(), confirmDelete: true, error: null };
      this._render();
    });
    $("#confirm-delete")?.addEventListener("click", () => this._delete());
  }

  _readForm() {
    const $ = (sel) => this.shadowRoot.querySelector(sel);
    return {
      ...this._dialog.vertrag,
      anbieter: $("#f-anbieter").value.trim(),
      von: $("#f-von").value,
      bis: $("#f-bis").value || null,
      arbeitspreis_ct: $("#f-ap").value.trim(),
      grundpreis_eur: $("#f-gp").value.trim() || "0",
      grundpreis_einheit: $("#f-gpe").value,
      notiz: $("#f-notiz").value,
    };
  }

  _readReadingForm() {
    const $ = (sel) => this.shadowRoot.querySelector(sel);
    return {
      ...this._dialog.ablesung,
      zeitpunkt: $("#r-zeit").value,
      stand: $("#r-stand").value.trim(),
      notiz: $("#r-notiz").value,
    };
  }

  async _save() {
    if (this._dialog.kind === "ablesung") {
      const ablesung = this._readReadingForm();
      try {
        this._data = await this._hass.callWS({ type: `${DOMAIN}/ablesung/save`, ablesung });
        this._dialog = null;
        this._afterChange();
      } catch (err) {
        this._dialog = { kind: "ablesung", ablesung, error: err.message || String(err) };
        this._render();
      }
      return;
    }
    const vertrag = this._readForm();
    delete vertrag.aktiv;
    delete vertrag.ueberschneidet;
    try {
      this._data = await this._hass.callWS({ type: `${DOMAIN}/vertrag/save`, vertrag });
      this._dialog = null;
      this._afterChange();
    } catch (err) {
      this._dialog = { vertrag, error: err.message || String(err) };
      this._render();
    }
  }

  async _delete() {
    if (this._dialog.kind === "ablesung") {
      try {
        this._data = await this._hass.callWS({ type: `${DOMAIN}/ablesung/delete`, ablesung_id: this._dialog.ablesung.id });
        this._dialog = null;
        this._afterChange();
      } catch (err) {
        this._dialog = { ...this._dialog, error: err.message || String(err) };
        this._render();
      }
      return;
    }
    try {
      this._data = await this._hass.callWS({ type: `${DOMAIN}/vertrag/delete`, vertrag_id: this._dialog.vertrag.id });
      this._dialog = null;
      this._afterChange();
    } catch (err) {
      this._dialog = { ...this._dialog, error: err.message || String(err) };
      this._render();
    }
  }

  _afterChange() {
    this._data.berechnung.laeuft = true; // Neuberechnung startet gleich
    this._render();
    window.dispatchEvent(new Event(EVENT));
    this._pollUntilDone();
  }
}

if (!customElements.get("strom-tarife-card")) {
  customElements.define("strom-tarife-card", StromTarifeCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "strom-tarife-card",
    name: "Stromtarife",
    description: "Stromverträge (ansicht: vertraege), Zählerstände (ansicht: zaehler), Kostenübersicht (ansicht: kosten) oder Diagramm mit nicht erfasstem Verbrauch (ansicht: diagramm)",
  });
}
