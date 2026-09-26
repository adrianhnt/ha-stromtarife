// Stromtarife – Dashboard-Karte (Verträge als Tabelle / Kostenübersicht)
// type: custom:strom-tarife-card
// ansicht: vertraege | zaehler | kosten | diagramm (einheit: kwh|eur, zeitraum: monate|jahre)

const DOMAIN = "strom_tarife";
const EVENT = "strom-tarife-updated";

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
  .controls { display: flex; gap: 8px; flex-wrap: wrap; }
  .chart { position: relative; }
  .chart svg { display: block; width: 100%; height: auto; overflow: visible; }
  .chart .gridline { stroke: var(--divider-color); stroke-width: 1; }
  .chart .axis { fill: var(--secondary-text-color); font-size: 11px; }
  .chart .hit { fill: transparent; cursor: default; }
  .chart .hit:hover { fill: var(--primary-text-color); fill-opacity: 0.05; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 10px; font-size: 0.85em; color: var(--secondary-text-color); }
  .legend span.sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  .tip { position: absolute; pointer-events: none; background: var(--card-background-color, #fff); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 8px; padding: 8px 10px; font-size: 0.85em; box-shadow: 0 4px 16px rgba(0,0,0,0.25); min-width: 170px; z-index: 2; }
  .tip .t { font-weight: 500; margin-bottom: 4px; }
  .tip .r { display: flex; justify-content: space-between; gap: 12px; }
  .tip .tot { border-top: 1px solid var(--divider-color); margin-top: 4px; padding-top: 4px; font-weight: 500; }
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

  get _chartMode() {
    return this.__chartMode ?? this._config.einheit ?? "eur";
  }

  get _chartRange() {
    return this.__chartRange ?? this._config.zeitraum ?? "monate";
  }

  async _loadChart() {
    const kwh = this._chartMode === "kwh";
    const monthly = this._chartRange === "monate";
    const now = new Date();
    const buckets = [];
    if (monthly) {
      for (let i = 11; i >= 0; i--) buckets.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    } else {
      const firstReading = this._data.ablesungen[this._data.ablesungen.length - 1];
      const firstYear = firstReading ? Number(firstReading.zeitpunkt.slice(0, 4)) : now.getFullYear();
      for (let y = firstYear; y <= now.getFullYear(); y++) buckets.push(new Date(y, 0, 1));
    }
    const total = this._data.reihen.find((r) => r.id === "gesamt");
    const devices = this._data.reihen.filter((r) => r.id !== "gesamt");
    const idOf = (r) => (kwh ? r.source : r.statistic_id);
    const ids = [idOf(total), ...devices.map(idOf)];
    const res = await this._hass.callWS({
      type: "recorder/statistics_during_period",
      start_time: buckets[0].toISOString(),
      statistic_ids: ids,
      period: monthly ? "month" : "year",
      types: ["change"],
      units: { energy: "kWh" },
    });
    const byStart = (id) => {
      const m = new Map();
      for (const row of res[id] || []) m.set(new Date(row.start).getTime(), row.change);
      return m;
    };
    const totalMap = byStart(idOf(total));
    const devMaps = devices.map((d) => byStart(idOf(d)));
    this._chart = {
      kwh,
      monthly,
      series: devices.map((d) => d.name),
      buckets: buckets.map((b) => {
        const key = b.getTime();
        const values = devMaps.map((m) => Math.max(0, m.get(key) ?? 0));
        const tot = totalMap.has(key) ? totalMap.get(key) : null;
        const sumDev = values.reduce((a, v) => a + v, 0);
        return { start: b, values, total: tot, untracked: tot === null ? 0 : Math.max(0, tot - sumDev) };
      }),
    };
  }

  _renderChart() {
    const c = this._chart;
    const title = this._config.title ?? (c?.kwh ? "Verbrauch" : "Kosten");
    const seg = (key, opts) =>
      `<div class="seg">${opts
        .map(([v, label]) => `<button data-${key}="${v}" class="${(key === "mode" ? this._chartMode : this._chartRange) === v ? "on" : ""}">${label}</button>`)
        .join("")}</div>`;
    const head = `<div class="head"><div class="title">${esc(title)}</div><div class="controls">${seg("mode", [
      ["kwh", "kWh"],
      ["eur", "€"],
    ])}${seg("range", [
      ["monate", "12 Monate"],
      ["jahre", "Jahre"],
    ])}</div></div>`;
    if (!c) return head + `<div class="empty">Lädt …</div>`;

    const dark = !!this._hass?.themes?.darkMode;
    const palette = dark
      ? ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]
      : ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
    const grey = dark ? "#6f6e69" : "#b4b2a9";
    // Mehr als 8 Geräte: Rest in „Weitere Geräte“ zusammenfassen (keine erfundenen Farben)
    let names = [...c.series];
    let buckets = c.buckets.map((b) => ({ ...b, values: [...b.values] }));
    if (names.length > 8) {
      names = [...names.slice(0, 7), "Weitere Geräte"];
      buckets = buckets.map((b) => ({ ...b, values: [...b.values.slice(0, 7), b.values.slice(7).reduce((a, v) => a + v, 0)] }));
    }
    const colors = names.map((_, i) => palette[i]);
    const fmt = (v) => (c.kwh ? `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v)} kWh` : eur.format(v));
    const label = (d) =>
      c.monthly ? d.toLocaleString("de-DE", { month: "short" }).replace(".", "") + (d.getMonth() === 0 ? ` ${String(d.getFullYear()).slice(2)}` : "") : String(d.getFullYear());

    // Zeichenfläche in echter Pixelbreite, damit die Schrift auch auf dem Handy lesbar bleibt
    const W = Math.max(300, Math.round((this.getBoundingClientRect().width || 832) - 32));
    const H = W < 500 ? 220 : 280, L = 56, R = 4, T = 10, B = 26;
    const max = Math.max(1, ...buckets.map((b) => b.values.reduce((a, v) => a + v, 0) + b.untracked));
    const step = (() => {
      const raw = max / 4;
      const p = 10 ** Math.floor(Math.log10(raw));
      return [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= raw);
    })();
    const top = Math.ceil(max / step) * step;
    const y = (v) => T + (H - T - B) * (1 - v / top);
    const band = (W - L - R) / buckets.length;
    const bw = Math.min(46, band * 0.62);
    let svg = "";
    for (let v = 0; v <= top + 1e-9; v += step) {
      svg += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
      svg += `<text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${c.kwh ? new Intl.NumberFormat("de-DE").format(v) : eur.format(v).replace(",00", "")}</text>`;
    }
    const roundedTop = (x, yTop, w, h, r) => {
      r = Math.min(r, h, w / 2);
      return `M${x},${yTop + h}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yTop + h}Z`;
    };
    buckets.forEach((b, i) => {
      const x = L + band * i + (band - bw) / 2;
      const parts = [...b.values.map((v, k) => [v, colors[k]]), [b.untracked, grey]].filter(([v]) => v > 0);
      let acc = 0;
      parts.forEach(([v, color], k) => {
        const y0 = y(acc), y1 = y(acc + v);
        acc += v;
        const gap = k > 0 ? 2 : 0;
        const h = Math.max(0, y0 - y1 - gap);
        if (h <= 0) return;
        svg += k === parts.length - 1
          ? `<path d="${roundedTop(x, y1, bw, h, 4)}" fill="${color}"/>`
          : `<rect x="${x}" y="${y1}" width="${bw}" height="${h}" fill="${color}"/>`;
      });
      if (band >= 34 || (buckets.length - 1 - i) % 2 === 0)
        svg += `<text class="axis" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(label(b.start))}</text>`;
      svg += `<rect class="hit" data-i="${i}" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}"/>`;
    });
    const legend = [...names.map((n, i) => [n, colors[i]]), ["Nicht erfasst", grey]]
      .map(([n, col]) => `<span><span class="sw" style="background:${col}"></span>${esc(n)}</span>`)
      .join("");
    this._chartView = { buckets, names, colors, grey, fmt, label };
    const last = this._data.ablesungen[0];
    const hint = last
      ? `<div class="status">„Nicht erfasst“ = Zähler minus Geräte. Den Zählerverbrauch gibt es bis zur letzten Ablesung (${fmtTime(last.zeitpunkt)}); danach zeigt das Diagramm nur die Geräte.${c.kwh ? "" : " Kosten ohne Grundpreis."}</div>`
      : "";
    return `${head}<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)} je ${c.monthly ? "Monat" : "Jahr"}">${svg}</svg><div class="tip" hidden></div></div><div class="legend">${legend}</div>${hint}`;
  }

  _bindChart() {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", async () => {
        this.__chartMode = b.dataset.mode;
        this._chart = null;
        this._render();
        await this._loadChart();
        this._render();
      })
    );
    root.querySelectorAll("[data-range]").forEach((b) =>
      b.addEventListener("click", async () => {
        this.__chartRange = b.dataset.range;
        this._chart = null;
        this._render();
        await this._loadChart();
        this._render();
      })
    );
    const tip = root.querySelector(".tip");
    const chart = root.querySelector(".chart");
    if (!tip || !this._chartView) return;
    const v = this._chartView;
    root.querySelectorAll(".hit").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        const b = v.buckets[+el.dataset.i];
        const rows = [...b.values.map((val, k) => [v.names[k], val, v.colors[k]]), ["Nicht erfasst", b.untracked, v.grey]]
          .filter(([, val]) => val > 0)
          .reverse()
          .map(([n, val, col]) => `<div class="r"><span><span class="sw" style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${col}"></span>${esc(n)}</span><span>${v.fmt(val)}</span></div>`)
          .join("");
        const sum = b.values.reduce((a, x) => a + x, 0) + b.untracked;
        const period = this._chart.monthly
          ? b.start.toLocaleString("de-DE", { month: "long", year: "numeric" })
          : String(b.start.getFullYear());
        tip.innerHTML = `<div class="t">${esc(period)}</div>${rows || '<div class="sub">keine Daten</div>'}<div class="r tot"><span>Gesamt</span><span>${v.fmt(sum)}</span></div>`;
        tip.hidden = false;
        const box = chart.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        let left = r.left - box.left + r.width / 2 + 12;
        if (left + 190 > box.width) left = r.left - box.left + r.width / 2 - 202;
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
