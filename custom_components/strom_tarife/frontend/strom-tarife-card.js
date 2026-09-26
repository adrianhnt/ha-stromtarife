// Stromtarife – Dashboard-Karte (Verträge als Tabelle / Kostenübersicht)
// type: custom:strom-tarife-card
// ansicht: vertraege | kosten

const DOMAIN = "strom_tarife";
const EVENT = "strom-tarife-updated";

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const num2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const STYLE = `
  :host { display: block; }
  ha-card { padding: 16px; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
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
    if (this._hass) this._load();
  }

  disconnectedCallback() {
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

  // ------------------------------------------------------------------ Darstellung

  _render() {
    const root = this.shadowRoot;
    if (!root) return;
    let body;
    if (this._error) body = `<div class="err">${esc(this._error)}</div>`;
    else if (!this._data) body = `<div class="empty">Lädt …</div>`;
    else body = this._config.ansicht === "kosten" ? this._renderCosts() : this._renderContracts();
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
          <td class="num">${eur.format(v.grundpreis_eur)}/Monat</td>
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
        <div><label>Grundpreis <span class="unit">€/Monat</span></label><input id="f-gp" inputmode="decimal" value="${esc(n(v.grundpreis_eur))}" placeholder="z. B. 12,50"></div>
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

  _bind() {
    const $ = (sel) => this.shadowRoot.querySelector(sel);
    $("#add")?.addEventListener("click", () => {
      const last = this._data.vertraege[0];
      this._dialog = {
        vertrag: { anbieter: last?.anbieter ?? "", von: "", bis: "", arbeitspreis_ct: "", grundpreis_eur: "", notiz: "" },
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
      this._dialog = { ...this._dialog, vertrag: this._readForm(), confirmDelete: true, error: null };
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
      notiz: $("#f-notiz").value,
    };
  }

  async _save() {
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
    description: "Stromverträge als Tabelle (ansicht: vertraege) oder Kostenübersicht (ansicht: kosten)",
  });
}
