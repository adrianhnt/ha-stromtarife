"""Sensoren für den aktuell gültigen Vertrag."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.event import async_track_time_change

from . import StromTarifeConfigEntry
from .const import DOMAIN, NAME, SIGNAL_UPDATED
from .tarife import StromTarife


def device_info(entry_id: str) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, entry_id)},
        name=NAME,
        entry_type=DeviceEntryType.SERVICE,
    )


async def async_setup_entry(
    hass: HomeAssistant,
    entry: StromTarifeConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    manager = entry.runtime_data
    async_add_entities(
        [
            ArbeitspreisSensor(manager, entry.entry_id),
            GrundpreisSensor(manager, entry.entry_id),
            AnbieterSensor(manager, entry.entry_id),
            ZaehlerstandSensor(manager, entry.entry_id),
        ]
    )


class _TarifSensor(SensorEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, manager: StromTarife, entry_id: str, key: str) -> None:
        self.manager = manager
        self._attr_unique_id = f"{entry_id}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = device_info(entry_id)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_UPDATED, self.async_write_ha_state)
        )

        @callback
        def _midnight(_now) -> None:
            self.async_write_ha_state()

        self.async_on_remove(
            async_track_time_change(self.hass, _midnight, hour=0, minute=0, second=1)
        )

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        contract = self.manager.current_contract()
        if not contract:
            return {"hinweis": "Heute gilt kein Vertrag"}
        return {
            "anbieter": contract["anbieter"],
            "gueltig_von": contract["von"],
            "gueltig_bis": contract.get("bis"),
            "notiz": contract.get("notiz") or None,
        }


class ArbeitspreisSensor(_TarifSensor):
    _attr_native_unit_of_measurement = "ct/kWh"
    _attr_suggested_display_precision = 2
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:cash-clock"

    def __init__(self, manager: StromTarife, entry_id: str) -> None:
        super().__init__(manager, entry_id, "arbeitspreis")

    @property
    def native_value(self) -> float | None:
        contract = self.manager.current_contract()
        return contract["arbeitspreis_ct"] if contract else None


class GrundpreisSensor(_TarifSensor):
    _attr_native_unit_of_measurement = "€/Monat"
    _attr_suggested_display_precision = 2
    _attr_icon = "mdi:cash-multiple"

    def __init__(self, manager: StromTarife, entry_id: str) -> None:
        super().__init__(manager, entry_id, "grundpreis")

    @property
    def native_value(self) -> float | None:
        contract = self.manager.current_contract()
        return contract["grundpreis_eur"] if contract else None


class AnbieterSensor(_TarifSensor):
    _attr_icon = "mdi:domain"

    def __init__(self, manager: StromTarife, entry_id: str) -> None:
        super().__init__(manager, entry_id, "anbieter")

    @property
    def native_value(self) -> str | None:
        contract = self.manager.current_contract()
        return contract["anbieter"] if contract else None


class ZaehlerstandSensor(_TarifSensor):
    """Letzte Ablesung (ohne Statistik – die Zählerstatistik schreibt die Integration selbst)."""

    _attr_native_unit_of_measurement = "kWh"
    _attr_suggested_display_precision = 1
    _attr_icon = "mdi:meter-electric"

    def __init__(self, manager: StromTarife, entry_id: str) -> None:
        super().__init__(manager, entry_id, "zaehlerstand")

    @property
    def native_value(self) -> float | None:
        reading = self.manager.last_reading()
        return reading["stand"] if reading else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        reading = self.manager.last_reading()
        return {"abgelesen": reading["zeitpunkt"], "notiz": reading.get("notiz") or None} if reading else {}
