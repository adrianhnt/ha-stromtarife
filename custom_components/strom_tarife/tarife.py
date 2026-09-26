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
    CONF_METER,
    DOMAIN,
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


class StromTarife:
    """Verträge und Kostenberechnung."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.contracts: list[dict[str, Any]] = []
        self._lock = asyncio.Lock()
        self._pending_full: asyncio.Task | None = None
        self.running = False
        self.last_run: datetime | None = None
        self.last_error: str | None = None
        self._first_day: date | None = None

    # ------------------------------------------------------------------ Speicher

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.contracts = data.get("vertraege", [])

    async def _async_save(self) -> None:
        await self._store.async_save({"vertraege": self.contracts})

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

    def _changed(self) -> None:
        async_dispatcher_send(self.hass, SIGNAL_UPDATED)
        self.schedule_full_recalculation()

    # ------------------------------------------------------------------ Reihen

    def series(self) -> list[dict[str, str]]:
        """Kostenreihen: Gesamt (Zähler) und je Gerät."""
        registry = er.async_get(self.hass)
        options = {**self.entry.data, **self.entry.options}
        result = []
        meter = options.get(CONF_METER)
        if meter:
            result.append(
                {"id": TOTAL_ID, "name": "Gesamt", "source": meter, "statistic_id": STAT_PREFIX + TOTAL_ID}
            )
        for entity_id in options.get(CONF_DEVICES, []):
            name = None
            if entry := registry.async_get(entity_id):
                name = entry.name or entry.original_name
            if state := self.hass.states.get(entity_id):
                name = name or state.name
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

    def schedule_full_recalculation(self) -> None:
        """Komplett neu rechnen (entprellt, falls mehrere Änderungen kurz nacheinander)."""
        if self._pending_full and not self._pending_full.done():
            self._pending_full.cancel()

        async def _delayed() -> None:
            await asyncio.sleep(3)
            await self.async_recalculate(full=True)

        self._pending_full = self.entry.async_create_background_task(
            self.hass, _delayed(), f"{DOMAIN}_neu_berechnen"
        )

    async def async_recalculate(self, full: bool = False) -> None:
        async with self._lock:
            self.running = True
            async_dispatcher_send(self.hass, SIGNAL_UPDATED)
            errors = []
            try:
                for serie in self.series():
                    try:
                        await self._async_update_series(serie, full)
                    except Exception as err:  # noqa: BLE001
                        _LOGGER.exception("Berechnung für %s fehlgeschlagen", serie["statistic_id"])
                        errors.append(f"{serie['name']}: {err}")
                await self._async_first_day()
                try:
                    await asyncio.wait_for(get_instance(self.hass).async_block_till_done(), 60)
                except TimeoutError:
                    pass
            finally:
                self.running = False
                self.last_run = dt_util.utcnow()
                self.last_error = "; ".join(errors) or None
                async_dispatcher_send(self.hass, SIGNAL_UPDATED)

    async def _async_first_day(self) -> None:
        sources = {s["source"] for s in self.series()}
        if not sources:
            return
        instance = get_instance(self.hass)
        result = await instance.async_add_executor_job(
            statistics_during_period, self.hass, _EPOCH, None, sources, "month", None, {"sum"}
        )
        starts = [rows[0]["start"] for rows in result.values() if rows]
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

        cost = 0.0
        prev_sum: float | None = None
        if not full:
            if not rows or rows[0]["start"] != last["start"]:
                # Anker fehlt (z. B. Quelle neu importiert) -> komplett neu
                await self._async_update_series(serie, True)
                return
            cost = last["sum"]
            prev_sum = rows[0]["sum"]
            rows = rows[1:]

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
