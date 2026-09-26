"""WebSocket-Befehle für die Tabellen-Karte."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .tarife import StromTarife, ValidationError


@callback
def async_register_websocket_commands(hass: HomeAssistant) -> None:
    for command in (ws_data, ws_save, ws_delete, ws_recalculate, ws_reading_save, ws_reading_delete):
        websocket_api.async_register_command(hass, command)


def _manager(hass: HomeAssistant) -> StromTarife | None:
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    return entries[0].runtime_data if entries else None


def _data(manager: StromTarife) -> dict[str, Any]:
    current = manager.current_contract()
    overlaps = manager.overlaps()
    return {
        "vertraege": [
            {**c, "aktiv": bool(current and c["id"] == current["id"]), "ueberschneidet": overlaps.get(c["id"], [])}
            for c in manager.sorted_contracts()
        ],
        "luecken": manager.gaps(),
        "ablesungen": manager.sorted_readings(),
        "reihen": manager.series(),
        "berechnung": {
            "laeuft": manager.busy,
            "zuletzt": manager.last_run.isoformat() if manager.last_run else None,
            "fehler": manager.last_error,
        },
    }


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/data"})
@callback
def ws_data(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if (manager := _manager(hass)) is None:
        connection.send_error(msg["id"], "not_loaded", "Stromtarife ist nicht eingerichtet")
        return
    connection.send_result(msg["id"], _data(manager))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/vertrag/save", vol.Required("vertrag"): dict}
)
@websocket_api.async_response
async def ws_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if (manager := _manager(hass)) is None:
        connection.send_error(msg["id"], "not_loaded", "Stromtarife ist nicht eingerichtet")
        return
    try:
        contract = await manager.async_save_contract(msg["vertrag"])
    except ValidationError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], {"vertrag": contract, **_data(manager)})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/vertrag/delete", vol.Required("vertrag_id"): str}
)
@websocket_api.async_response
async def ws_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if (manager := _manager(hass)) is None:
        connection.send_error(msg["id"], "not_loaded", "Stromtarife ist nicht eingerichtet")
        return
    try:
        await manager.async_delete_contract(msg["vertrag_id"])
    except ValidationError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], _data(manager))


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/neu_berechnen"})
@websocket_api.async_response
async def ws_recalculate(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if (manager := _manager(hass)) is None:
        connection.send_error(msg["id"], "not_loaded", "Stromtarife ist nicht eingerichtet")
        return
    await manager.async_recalculate(full=True)
    connection.send_result(msg["id"], _data(manager))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/ablesung/save", vol.Required("ablesung"): dict}
)
@websocket_api.async_response
async def ws_reading_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if (manager := _manager(hass)) is None:
        connection.send_error(msg["id"], "not_loaded", "Stromtarife ist nicht eingerichtet")
        return
    try:
        reading = await manager.async_save_reading(msg["ablesung"])
    except ValidationError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], {"ablesung": reading, **_data(manager)})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/ablesung/delete", vol.Required("ablesung_id"): str}
)
@websocket_api.async_response
async def ws_reading_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if (manager := _manager(hass)) is None:
        connection.send_error(msg["id"], "not_loaded", "Stromtarife ist nicht eingerichtet")
        return
    try:
        await manager.async_delete_reading(msg["ablesung_id"])
    except ValidationError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], _data(manager))
