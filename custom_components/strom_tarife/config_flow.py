"""Einrichtung: Zähler und Geräte auswählen."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components.sensor import SensorDeviceClass
from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.selector import EntitySelector, EntitySelectorConfig

from .const import CONF_DEVICES, CONF_METER, DOMAIN, NAME


def _schema(defaults: dict[str, Any]) -> vol.Schema:
    energy = {"domain": "sensor", "device_class": SensorDeviceClass.ENERGY}
    return vol.Schema(
        {
            vol.Required(CONF_METER, default=defaults.get(CONF_METER, vol.UNDEFINED)): EntitySelector(
                EntitySelectorConfig(filter=energy)
            ),
            vol.Optional(CONF_DEVICES, default=defaults.get(CONF_DEVICES, [])): EntitySelector(
                EntitySelectorConfig(filter=energy, multiple=True)
            ),
        }
    )


class StromTarifeConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title=NAME, data=user_input)
        return self.async_show_form(step_id="user", data_schema=_schema({}))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return StromTarifeOptionsFlow()


class StromTarifeOptionsFlow(OptionsFlow):
    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        current = {**self.config_entry.data, **self.config_entry.options}
        return self.async_show_form(step_id="init", data_schema=_schema(current))
