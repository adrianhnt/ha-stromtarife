"""Knopf zum vollständigen Neuberechnen der Kosten."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import StromTarifeConfigEntry
from .sensor import device_info


async def async_setup_entry(
    hass: HomeAssistant,
    entry: StromTarifeConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([RecalculateButton(entry)])


class RecalculateButton(ButtonEntity):
    _attr_has_entity_name = True
    _attr_translation_key = "neu_berechnen"
    _attr_icon = "mdi:calculator-variant"

    def __init__(self, entry: StromTarifeConfigEntry) -> None:
        self.entry = entry
        self._attr_unique_id = f"{entry.entry_id}_neu_berechnen"
        self._attr_device_info = device_info(entry.entry_id)

    async def async_press(self) -> None:
        await self.entry.runtime_data.async_recalculate(full=True)
