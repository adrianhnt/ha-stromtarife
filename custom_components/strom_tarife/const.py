"""Konstanten für Stromtarife."""

from __future__ import annotations

DOMAIN = "strom_tarife"
NAME = "Stromtarife"

CONF_DEVICES = "geraete"

STORAGE_KEY = f"{DOMAIN}.vertraege"
STORAGE_VERSION = 1

# Externe Statistiken: strom_tarife:kosten_<id>
STAT_PREFIX = f"{DOMAIN}:kosten_"
TOTAL_ID = "gesamt"
METER_STAT = f"{DOMAIN}:zaehler"

# Stündliche Fortschreibung kurz nach der Stunden-Kompilierung des Recorders
UPDATE_MINUTE = 12

STATIC_URL = f"/{DOMAIN}_static"
CARD_FILE = "strom-tarife-card.js"

SIGNAL_UPDATED = f"{DOMAIN}_updated"

SERVICE_RECALCULATE = "neu_berechnen"
