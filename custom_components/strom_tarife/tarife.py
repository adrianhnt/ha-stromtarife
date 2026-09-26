"""Verträge speichern und Kosten-Statistiken daraus berechnen."""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, timedelta
import logging
from typing import Any
import uuid

from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.models import (
    StatisticData,
    StatisticMeanType,
    StatisticMetaData,
)
from homeassistant.components.recorder.statistics import (
    async_add_external_statistics,
    get_last_statistics,
    statistics_during_period,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util, slugify

from .const import (
    CONF_DEVICES,
    DOMAIN,
    METER_STAT,
    SIGNAL_UPDATED,
    STAT_PREFIX,
    STORAGE_KEY,
    STORAGE_VERSION,
    TOTAL_ID,
)

_LOGGER = logging.getLogger(__name__)

_EPOCH = datetime(2000, 1, 1, tzinfo=UTC)


class ValidationError(HomeAssistantError):
    """Ungültige Eingabe in einem Vertrag."""


def _parse_date(value: Any, field: str, required: bool) -> date | None:
    if value in (None, ""):
        if required:
            raise ValidationError(f"{field} fehlt")
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError as err:
        raise ValidationError(f"{field}: ungültiges Datum") from err


def _parse_number(value: Any, field: str) -> float:
    if value in (None, ""):
        raise ValidationError(f"{field} fehlt")
    try:
        number = float(str(value).replace(",", "."))
    except ValueError as err:
        raise ValidationError(f"{field}: keine Zahl") from err
    if number < 0:
        raise ValidationError(f"{field} darf nicht negativ sein")
    return round(number, 2)


def _parse_unit(value: Any) -> str:
    unit = str(value or "jahr").strip().lower()
    if unit not in ("monat", "jahr"):
        raise ValidationError("Grundpreis: Einheit muss Monat oder Jahr sein")
    return unit


def grundpreis_pro_jahr(contract: dict[str, Any]) -> float:
    value = contract.get("grundpreis_eur") or 0
    return round(value * 12, 2) if contract.get("grundpreis_einheit") == "monat" else value


class StromTarife:
    """Verträge und Kostenberechnung."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.contracts: list[dict[str, Any]] = []
        self.readings: list[dict[str, Any]] = []
        self._lock = asyncio.Lock()
        self._pending_full: asyncio.Task | None = None
        self._full_requested = False
        self._full_scope_all = False
        self.running = False
        self.last_run: datetime | None = None
        self.last_error: str | None = None
        self._first_day: date | None = None

    # ------------------------------------------------------------------ Speicher

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.contracts = data.get("vertraege", [])
        self.readings = data.get("ablesungen", [])
        # Bis v0.2.x gab es keine Einheit; Adrian hat alle Grundpreise pro Jahr eingetragen
        migrated = False
        for contract in self.contracts:
            if "grundpreis_einheit" not in contract:
                contract["grundpreis_einheit"] = "jahr"
                migrated = True
        if migrated:
            await self._async_save()

    async def _async_save(self) -> None:
        await self._store.async_save({"vertraege": self.contracts, "ablesungen": self.readings})

    # ------------------------------------------------------------------ Verträge

    def sorted_contracts(self) -> list[dict[str, Any]]:
        return sorted(self.contracts, key=lambda c: c["von"], reverse=True)

    def contract_at(self, day: date) -> dict[str, Any] | None:
        """Vertrag, der an diesem Tag gilt (bei Überschneidung der spätere Beginn)."""
        iso = day.isoformat()
        best = None
        for contract in self.contracts:
            if contract["von"] <= iso and (not contract.get("bis") or iso <= contract["bis"]):
                if best is None or contract["von"] > best["von"]:
                    best = contract
        return best

    def current_contract(self) -> dict[str, Any] | None:
        return self.contract_at(dt_util.now().date())

    def overlaps(self) -> dict[str, list[str]]:
        """Je Vertrag die IDs der Verträge, mit denen er sich überschneidet."""
        result: dict[str, list[str]] = {}
        for a in self.contracts:
            for b in self.contracts:
                if a["id"] == b["id"]:
                    continue
                a_end = a.get("bis") or "9999-12-31"
                b_end = b.get("bis") or "9999-12-31"
                if a["von"] <= b_end and b["von"] <= a_end:
                    result.setdefault(a["id"], []).append(b["id"])
        return result

    def gaps(self) -> list[dict[str, str]]:
        """Zeiträume seit Beginn der Daten ohne gültigen Vertrag."""
        if self._first_day is None:
            return []
        today = dt_util.now().date()
        gaps: list[dict[str, str]] = []
        start: date | None = None
        day = self._first_day
        while day <= today:
            if self.contract_at(day) is None:
                start = start or day
            elif start is not None:
                gaps.append({"von": start.isoformat(), "bis": (day - timedelta(days=1)).isoformat()})
                start = None
            day += timedelta(days=1)
        if start is not None:
            gaps.append({"von": start.isoformat(), "bis": today.isoformat()})
        return gaps

    async def async_save_contract(self, data: dict[str, Any]) -> dict[str, Any]:
        anbieter = str(data.get("anbieter") or "").strip()
        if not anbieter:
            raise ValidationError("Anbieter fehlt")
        von = _parse_date(data.get("von"), "Gültig von", True)
        bis = _parse_date(data.get("bis"), "Gültig bis", False)
        if bis is not None and von is not None and bis < von:
            raise ValidationError("„Gültig bis“ liegt vor „Gültig von“")
        contract = {
            "id": data.get("id") or uuid.uuid4().hex[:12],
            "anbieter": anbieter,
            "von": von.isoformat() if von else None,
            "bis": bis.isoformat() if bis else None,
            "arbeitspreis_ct": _parse_number(data.get("arbeitspreis_ct"), "Arbeitspreis"),
            "grundpreis_eur": _parse_number(data.get("grundpreis_eur", 0) or 0, "Grundpreis"),
            "grundpreis_einheit": _parse_unit(data.get("grundpreis_einheit")),
            "notiz": str(data.get("notiz") or "").strip(),
        }
        for index, existing in enumerate(self.contracts):
            if existing["id"] == contract["id"]:
                self.contracts[index] = contract
                break
        else:
            self.contracts.append(contract)
        await self._async_save()
        self._changed()
        return contract

    async def async_delete_contract(self, contract_id: str) -> None:
        before = len(self.contracts)
        self.contracts = [c for c in self.contracts if c["id"] != contract_id]
        if len(self.contracts) == before:
            raise ValidationError("Vertrag nicht gefunden")
        await self._async_save()
        self._changed()

    # ------------------------------------------------------------------ Zählerstände

    def sorted_readings(self) -> list[dict[str, Any]]:
        """Ablesungen, neueste zuerst, mit Verbrauch seit der vorherigen."""
        ordered = sorted(self.readings, key=lambda r: r["zeitpunkt"])
        result = []
        prev = None
        for reading in ordered:
            item = dict(reading)
            if prev is not None:
                days = (_reading_time(reading) - _reading_time(prev)).total_seconds() / 86400
                item["verbrauch"] = round(reading["stand"] - prev["stand"], 3)
                item["tage"] = round(days, 2)
                item["pro_tag"] = round(item["verbrauch"] / days, 3) if days > 0 else None
            result.append(item)
            prev = reading
        return list(reversed(result))

    def last_reading(self) -> dict[str, Any] | None:
        return max(self.readings, key=lambda r: r["zeitpunkt"]) if self.readings else None

    async def async_save_reading(self, data: dict[str, Any]) -> dict[str, Any]:
        raw_time = str(data.get("zeitpunkt") or "").strip()
        try:
            when = datetime.fromisoformat(raw_time)
        except ValueError as err:
            raise ValidationError("Zeitpunkt: ungültige Angabe") from err
        if when.tzinfo is not None:
            when = dt_util.as_local(when).replace(tzinfo=None)
        if when.replace(tzinfo=dt_util.get_default_time_zone()) > dt_util.now() + timedelta(minutes=5):
            raise ValidationError("Zeitpunkt liegt in der Zukunft")
        if data.get("stand") in (None, ""):
            raise ValidationError("Zählerstand fehlt")
        try:
            stand = round(float(str(data["stand"]).replace(",", ".")), 3)
        except ValueError as err:
            raise ValidationError("Zählerstand: keine Zahl") from err
        if stand < 0:
            raise ValidationError("Zählerstand darf nicht negativ sein")
        reading = {
            "id": data.get("id") or uuid.uuid4().hex[:12],
            "zeitpunkt": when.strftime("%Y-%m-%dT%H:%M"),
            "stand": stand,
            "notiz": str(data.get("notiz") or "").strip(),
        }
        others = [r for r in self.readings if r["id"] != reading["id"]]
        for other in others:
            if other["zeitpunkt"] == reading["zeitpunkt"]:
                raise ValidationError("Zu diesem Zeitpunkt gibt es schon eine Ablesung")
            if other["zeitpunkt"] < reading["zeitpunkt"] and other["stand"] > stand:
                raise ValidationError(
                    f"Stand ist kleiner als am {_fmt_time(other['zeitpunkt'])} ({other['stand']:.1f} kWh)"
                )
            if other["zeitpunkt"] > reading["zeitpunkt"] and other["stand"] < stand:
                raise ValidationError(
                    f"Stand ist größer als am {_fmt_time(other['zeitpunkt'])} ({other['stand']:.1f} kWh)"
                )
        self.readings = [*others, reading]
        await self._async_save()
        self._changed(nur_zaehler=True)
        return reading

    async def async_delete_reading(self, reading_id: str) -> None:
        before = len(self.readings)
        self.readings = [r for r in self.readings if r["id"] != reading_id]
        if len(self.readings) == before:
            raise ValidationError("Ablesung nicht gefunden")
        await self._async_save()
        self._changed(nur_zaehler=True)

    def meter_rows(self) -> list[dict[str, float]]:
        """Zählerwerte je Tag, zwischen zwei Ablesungen linear verteilt.

        Eine Zeile je Tageswechsel (Beginn 23 Uhr, Stand um Mitternacht) und je Ablesung.
        So gehört der Verbrauch eines Tages zu einer Zeile, deren Beginn auf diesem Tag
        liegt – damit greift beim Vertragswechsel der richtige Preis. Stündliche Werte
        gibt es aus Ablesungen ohnehin nicht, und die Datenbank bleibt klein.
        """
        points = sorted(((_reading_time(r), r["stand"]) for r in self.readings), key=lambda p: p[0])
        if not points:
            return []
        base = points[0][1]
        first, last = points[0][0], points[-1][0]

        def value_at(at: datetime) -> float:
            for (t0, v0), (t1, v1) in zip(points, points[1:]):
                if t0 <= at <= t1:
                    if t1 == t0:
                        return v1
                    return v0 + (v1 - v0) * (at - t0).total_seconds() / (t1 - t0).total_seconds()
            return points[-1][1] if at >= last else points[0][1]

        rows: dict[float, float] = {}
        for when, value in points:
            start = when.replace(minute=0, second=0, microsecond=0)
            rows[start.timestamp()] = value
        tz = dt_util.get_default_time_zone()
        day = dt_util.as_local(first).date() + timedelta(days=1)
        while True:
            midnight = dt_util.as_utc(datetime(day.year, day.month, day.day, tzinfo=tz))
            if midnight > last:
                break
            # Tageswechsel hat Vorrang, falls eine Ablesung in derselben Stunde liegt
            rows[(midnight - timedelta(hours=1)).timestamp()] = value_at(midnight)
            day += timedelta(days=1)
        return [
            {"start": start, "sum": round(value - base, 6), "state": round(value, 6)}
            for start, value in sorted(rows.items())
        ]

    def _changed(self, nur_zaehler: bool = False) -> None:
        async_dispatcher_send(self.hass, SIGNAL_UPDATED)
        self.schedule_full_recalculation(nur_zaehler=nur_zaehler)

    # ------------------------------------------------------------------ Reihen

    def series(self) -> list[dict[str, str]]:
        """Kostenreihen: Gesamt (Zähler) und je Gerät."""
        registry = er.async_get(self.hass)
        options = {**self.entry.data, **self.entry.options}
        result = []
        result.append(
            {"id": TOTAL_ID, "name": "Gesamt", "source": METER_STAT, "statistic_id": STAT_PREFIX + TOTAL_ID}
        )
        for entity_id in options.get(CONF_DEVICES, []):
            name = None
            if state := self.hass.states.get(entity_id):
                name = state.name  # Anzeigename inkl. Gerätename
            if not name and (entry := registry.async_get(entity_id)):
                name = entry.name or entry.original_name
            name = name or entity_id
            for suffix in (" Energie", " Energy", " energie"):
                if name.endswith(suffix):
                    name = name[: -len(suffix)]
            key = slugify(entity_id.split(".", 1)[1])
            result.append(
                {"id": key, "name": name, "source": entity_id, "statistic_id": STAT_PREFIX + key}
            )
        return result

    # ------------------------------------------------------------------ Berechnung

    @property
    def busy(self) -> bool:
        """Berechnung läuft oder ist eingeplant."""
        return self.running or bool(self._pending_full and not self._pending_full.done())

    def schedule_full_recalculation(self, nur_zaehler: bool = False) -> None:
        """Komplett neu rechnen – entprellt; eine laufende Berechnung wird nie abgebrochen.

        nur_zaehler: nur Zählerstatistik und Gesamtkosten (Ablesungen geändert).
        """
        if not nur_zaehler:
            self._full_scope_all = True
        self._full_requested = True
        if self._pending_full and not self._pending_full.done():
            return  # der laufende Auftrag rechnet danach noch einmal

        async def _worker() -> None:
            while self._full_requested:
                await asyncio.sleep(3)  # weitere Änderungen kurz sammeln
                self._full_requested = False
                only_meter = not self._full_scope_all
                self._full_scope_all = False
                await self.async_recalculate(full=True, nur_zaehler=only_meter)

        self._pending_full = self.entry.async_create_background_task(
            self.hass, _worker(), f"{DOMAIN}_neu_berechnen"
        )

    async def async_recalculate(self, full: bool = False, nur_zaehler: bool = False) -> None:
        async with self._lock:
            self.running = True
            async_dispatcher_send(self.hass, SIGNAL_UPDATED)
            errors = []
            try:
                if full:
                    try:
                        self._write_meter()
                    except Exception as err:  # noqa: BLE001
                        _LOGGER.exception("Zählerstatistik fehlgeschlagen")
                        errors.append(f"Zähler: {err}")
                for serie in self.series():
                    if nur_zaehler and serie["id"] != TOTAL_ID:
                        continue
                    try:
                        await self._async_update_series(serie, full)
                    except Exception as err:  # noqa: BLE001
                        _LOGGER.exception("Berechnung für %s fehlgeschlagen", serie["statistic_id"])
                        errors.append(f"{serie['name']}: {err}")
                await self._async_first_day()
                try:
                    await asyncio.wait_for(get_instance(self.hass).async_block_till_done(), 20)
                except TimeoutError:
                    pass
            finally:
                self.running = False
                self.last_run = dt_util.utcnow()
                self.last_error = "; ".join(errors) or None
                async_dispatcher_send(self.hass, SIGNAL_UPDATED)

    async def _async_first_day(self) -> None:
        sources = {s["source"] for s in self.series() if s["id"] != TOTAL_ID}
        starts = [_reading_time(r).timestamp() for r in self.readings]
        if sources:
            instance = get_instance(self.hass)
            result = await instance.async_add_executor_job(
                statistics_during_period, self.hass, _EPOCH, None, sources, "month", None, {"sum"}
            )
            starts += [rows[0]["start"] for rows in result.values() if rows]
        if starts:
            self._first_day = dt_util.as_local(dt_util.utc_from_timestamp(min(starts))).date()

    def _price_at(self, start: datetime) -> float:
        contract = self.contract_at(dt_util.as_local(start).date())
        return contract["arbeitspreis_ct"] / 100 if contract else 0.0

    async def _async_update_series(self, serie: dict[str, str], full: bool) -> None:
        hass = self.hass
        instance = get_instance(hass)
        stat_id = serie["statistic_id"]
        source = serie["source"]

        if serie["id"] == TOTAL_ID:
            # Zähler ändert sich nur durch Ablesungen -> nur bei kompletter Neuberechnung
            if not full:
                return
            await self._async_write_cost(serie, self.meter_rows(), full=True)
            return

        last = None
        if not full:
            res = await instance.async_add_executor_job(
                get_last_statistics, hass, 1, stat_id, False, {"sum"}
            )
            rows = res.get(stat_id) or []
            last = rows[0] if rows else None
            if last is None or last.get("sum") is None:
                full = True

        start = _EPOCH if full else dt_util.utc_from_timestamp(last["start"])
        res = await instance.async_add_executor_job(
            statistics_during_period, hass, start, None, {source}, "hour", None, {"sum"}
        )
        rows = [r for r in res.get(source, []) if r.get("sum") is not None]

        if not full:
            if not rows or rows[0]["start"] != last["start"]:
                # Anker fehlt (z. B. Quelle neu importiert) -> komplett neu
                await self._async_update_series(serie, True)
                return
            await self._async_write_cost(
                serie, rows[1:], full=False, cost=last["sum"], prev_sum=rows[0]["sum"]
            )
            return
        await self._async_write_cost(serie, rows, full=True)

    async def _async_write_cost(
        self,
        serie: dict[str, str],
        rows: list,
        *,
        full: bool,
        cost: float = 0.0,
        prev_sum: float | None = None,
    ) -> None:
        hass = self.hass
        instance = get_instance(hass)
        stat_id = serie["statistic_id"]
        out: list[StatisticData] = []
        for row in rows:
            value = row["sum"]
            delta = value - prev_sum if prev_sum is not None else value
            prev_sum = value
            start_dt = dt_util.utc_from_timestamp(row["start"])
            cost += delta * self._price_at(start_dt)
            rounded = round(cost, 6)
            out.append(StatisticData(start=start_dt, state=rounded, sum=rounded))

        metadata = StatisticMetaData(
            source=DOMAIN,
            statistic_id=stat_id,
            name=f"Stromkosten {serie['name']}",
            unit_of_measurement="EUR",
            unit_class=None,
            has_sum=True,
            mean_type=StatisticMeanType.NONE,
        )
        if full:
            instance.async_clear_statistics([stat_id])
        if out:
            async_add_external_statistics(hass, metadata, out)
        _LOGGER.debug("%s: %s Stunden %s", stat_id, len(out), "neu berechnet" if full else "ergänzt")

    def _write_meter(self) -> None:
        """Zählerstatistik aus den Ablesungen komplett neu schreiben."""
        instance = get_instance(self.hass)
        instance.async_clear_statistics([METER_STAT])
        rows = self.meter_rows()
        if not rows:
            return
        metadata = StatisticMetaData(
            source=DOMAIN,
            statistic_id=METER_STAT,
            name="Stromzähler",
            unit_of_measurement="kWh",
            unit_class="energy",
            has_sum=True,
            mean_type=StatisticMeanType.NONE,
        )
        async_add_external_statistics(
            self.hass,
            metadata,
            [
                StatisticData(start=dt_util.utc_from_timestamp(r["start"]), state=r["state"], sum=r["sum"])
                for r in rows
            ],
        )


def _reading_time(reading: dict[str, Any]) -> datetime:
    # In UTC umrechnen: Differenzen mit gleicher Zeitzone rechnet Python sonst in Wanduhrzeit
    local = datetime.fromisoformat(reading["zeitpunkt"]).replace(tzinfo=dt_util.get_default_time_zone())
    return dt_util.as_utc(local)


def _fmt_time(value: str) -> str:
    when = datetime.fromisoformat(value)
    return when.strftime("%d.%m.%Y %H:%M")
