"""Stromtarife: Verträge mit Gültigkeit verwalten und Stromkosten danach berechnen."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.typing import ConfigType

from .const import CARD_FILE, DOMAIN, SERVICE_RECALCULATE, STATIC_URL, UPDATE_MINUTE
from .tarife import StromTarife
from .websocket import async_register_websocket_commands

type StromTarifeConfigEntry = ConfigEntry[StromTarife]

PLATFORMS: list[Platform] = [Platform.BUTTON, Platform.SENSOR]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

FRONTEND_DIR = Path(__file__).parent / "frontend"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Karte bereitstellen, WebSocket-Befehle und Dienst registrieren."""
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, str(FRONTEND_DIR), False)]
    )
    stat = await hass.async_add_executor_job((FRONTEND_DIR / CARD_FILE).stat)
    add_extra_js_url(hass, f"{STATIC_URL}/{CARD_FILE}?v={int(stat.st_mtime)}")

    async_register_websocket_commands(hass)

    async def _recalculate(call: ServiceCall) -> None:
        for entry in hass.config_entries.async_loaded_entries(DOMAIN):
            await entry.runtime_data.async_recalculate(full=True)

    hass.services.async_register(DOMAIN, SERVICE_RECALCULATE, _recalculate)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: StromTarifeConfigEntry) -> bool:
    manager = StromTarife(hass, entry)
    await manager.async_load()
    entry.runtime_data = manager

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    @callback
    def _hourly(_now) -> None:
        entry.async_create_background_task(
            hass, manager.async_recalculate(), f"{DOMAIN}_stuendlich"
        )

    entry.async_on_unload(
        async_track_time_change(hass, _hourly, minute=UPDATE_MINUTE, second=0)
    )
    # Nach dem Start einmal fortschreiben (holt verpasste Stunden nach)
    entry.async_on_unload(async_at_started(hass, _hourly))
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


async def _async_options_updated(hass: HomeAssistant, entry: StromTarifeConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)
    # Geräteliste kann sich geändert haben -> alles neu
    if loaded := hass.config_entries.async_get_entry(entry.entry_id):
        if hasattr(loaded, "runtime_data"):
            loaded.runtime_data.schedule_full_recalculation()


async def async_unload_entry(hass: HomeAssistant, entry: StromTarifeConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
