"""Stub-Test für tarife.py ohne Home Assistant: python3 dev/test_tarife_stub.py (muss mit OK enden)."""
import sys, types, asyncio, importlib.util, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "custom_components", "strom_tarife")
from datetime import datetime, timezone, timedelta, date
from zoneinfo import ZoneInfo
TZ = ZoneInfo("Europe/Berlin")

def mod(name, **kw):
    m = types.ModuleType(name); m.__dict__.update(kw); sys.modules[name] = m; return m

# --- Stubs
DB = {}      # statistic_id -> list of rows {start(float), sum}
IMPORTED = {}
CLEARED = []
class Inst:
    async def async_add_executor_job(self, f, *a): return f(*a)
    def async_clear_statistics(self, ids): CLEARED.extend(ids); [IMPORTED.pop(i, None) for i in ids]
    async def async_block_till_done(self): pass
inst = Inst()
def statistics_during_period(hass, start, end, ids, period, units, types_):
    out = {}
    for i in ids:
        src = DB.get(i) or IMPORTED.get(i)
        if src is None: continue
        rows = [r for r in src if r["start"] >= start.timestamp()]
        if period == "month": rows = rows[:1]
        if rows: out[i] = rows
    return out
def get_last_statistics(hass, n, sid, conv, types_):
    rows = IMPORTED.get(sid)
    return {sid: rows[-n:]} if rows else {}
def add_ext(hass, meta, stats):
    cur = {r["start"]: r for r in IMPORTED.get(meta["statistic_id"], [])}
    for s in stats: cur[s["start"].timestamp()] = {"start": s["start"].timestamp(), "sum": s["sum"]}
    IMPORTED[meta["statistic_id"]] = sorted(cur.values(), key=lambda r: r["start"])

mod("homeassistant"); mod("homeassistant.components")
mod("homeassistant.components.recorder", get_instance=lambda h: inst)
mod("homeassistant.components.recorder.models", StatisticData=dict, StatisticMeanType=types.SimpleNamespace(NONE=0), StatisticMetaData=dict)
mod("homeassistant.components.recorder.statistics", async_add_external_statistics=add_ext, get_last_statistics=get_last_statistics, statistics_during_period=statistics_during_period)
mod("homeassistant.config_entries", ConfigEntry=object)
mod("homeassistant.core", HomeAssistant=object)
mod("homeassistant.exceptions", HomeAssistantError=Exception)
mod("homeassistant.helpers")
mod("homeassistant.helpers.entity_registry", async_get=lambda h: types.SimpleNamespace(async_get=lambda e: None))
mod("homeassistant.helpers.dispatcher", async_dispatcher_send=lambda *a: None)
class Store:
    def __init__(s,*a): s.d=None
    async def async_load(s): return s.d
    async def async_save(s, d): s.d=d
mod("homeassistant.helpers.storage", Store=Store)
now = datetime(2026, 9, 26, 12, 0, tzinfo=TZ)
dtu = types.SimpleNamespace(
    now=lambda: now, utcnow=lambda: now.astimezone(timezone.utc),
    as_local=lambda d: d.astimezone(TZ), as_utc=lambda d: d.astimezone(timezone.utc), get_default_time_zone=lambda: TZ,
    utc_from_timestamp=lambda t: datetime.fromtimestamp(t, timezone.utc))
util = mod("homeassistant.util", dt=dtu, slugify=lambda s: s.lower())
mod("homeassistant.util.dt", **dtu.__dict__)
pkg = mod("strom_tarife"); pkg.__path__ = []
spec = importlib.util.spec_from_file_location("strom_tarife.const", os.path.join(ROOT, "const.py"))
c = importlib.util.module_from_spec(spec); sys.modules["strom_tarife.const"] = c; spec.loader.exec_module(c)
spec = importlib.util.spec_from_file_location("strom_tarife.tarife", os.path.join(ROOT, "tarife.py"))
t = importlib.util.module_from_spec(spec); sys.modules["strom_tarife.tarife"] = t; spec.loader.exec_module(t)

hass = types.SimpleNamespace(states=types.SimpleNamespace(get=lambda e: None))
entry = types.SimpleNamespace(data={"geraete": ["sensor.z"]}, options={}, async_create_background_task=lambda h, coro, name: asyncio.get_running_loop().create_task(coro))
m = t.StromTarife(hass, entry)

# meter: 10 kWh per hour over 2025-12-31 20:00 .. 2026-01-01 04:00 local
start = datetime(2025, 12, 31, 20, tzinfo=TZ)
DB["sensor.z"] = [{"start": (start + timedelta(hours=i)).timestamp(), "sum": 10.0 * i} for i in range(9)]

async def run():
    await m.async_save_contract({"anbieter": "A", "von": "2025-01-01", "bis": "2025-12-31", "arbeitspreis_ct": "30,00"})
    await m.async_save_contract({"anbieter": "B", "von": "2026-01-01", "arbeitspreis_ct": 40, "grundpreis_eur": "12,5"})
    await asyncio.sleep(0)
    await m.async_recalculate(full=True)
    rows = IMPORTED["strom_tarife:kosten_z"]
    print([r["sum"] for r in rows])
    # hours 21,22,23 (2025) at 0.30 -> 3 each = 9; hours 0..4 (2026) at 0.40 -> 4 each
    assert abs(rows[-1]["sum"] - (9 + 5*4)) < 1e-9, rows[-1]
    # incremental: add 2 hours
    DB["sensor.z"] += [{"start": (start + timedelta(hours=i)).timestamp(), "sum": 10.0 * i} for i in (9, 10)]
    await m.async_recalculate()
    rows = IMPORTED["strom_tarife:kosten_z"]
    assert abs(rows[-1]["sum"] - (9 + 7*4)) < 1e-9, rows[-1]
    print("incremental ok", rows[-1]["sum"], "gaps", m.gaps())
    print("current", m.current_contract()["anbieter"], "overlaps", m.overlaps())
    try:
        await m.async_save_contract({"anbieter": "X", "von": "2026-02-01", "bis": "2026-01-01", "arbeitspreis_ct": 1})
    except Exception as e: print("validation ok:", e)

async def run2():
    # Ablesungen über Zeitumstellung (29.03.2026) und Vertragswechsel
    await m.async_save_reading({"zeitpunkt": "2026-03-28T12:00", "stand": "1000,0"})
    await m.async_save_reading({"zeitpunkt": "2026-03-30T12:00", "stand": "1047"})
    try:
        await m.async_save_reading({"zeitpunkt": "2026-03-29T12:00", "stand": "1100"})
    except Exception as e: print("monoton ok:", e)
    await m.async_save_contract({"anbieter": "C", "von": "2026-03-29", "arbeitspreis_ct": "50"})
    await asyncio.sleep(0)
    rows = m.meter_rows()
    print("rows", len(rows), rows[0], rows[-1])
    assert [r["state"] for r in rows] == [1000, 1012, 1035, 1047], rows
    assert rows[-1]["sum"] == 47 and rows[-1]["state"] == 1047
    await m.async_recalculate(full=True)
    meter = IMPORTED["strom_tarife:zaehler"]; cost = IMPORTED["strom_tarife:kosten_gesamt"]
    assert len(meter) == 4 and meter[-1]["sum"] == 47
    # 1 kWh pro echter Stunde: 28.03. 12-24 Uhr = 12 h @ B 0,40 ; danach 35 h @ C 0,50
    print("kosten", cost[-1]["sum"])
    assert abs(cost[-1]["sum"] - (12*0.40 + 35*0.50)) < 1e-6
    print("readings", [ (r["zeitpunkt"], r.get("verbrauch"), r.get("pro_tag")) for r in m.sorted_readings()])
    await m.async_recalculate()  # stündlich: Gesamt bleibt
    assert IMPORTED["strom_tarife:kosten_gesamt"][-1]["sum"] == cost[-1]["sum"]
    print("zaehler ok")
asyncio.run(run()); asyncio.run(run2())

async def run3():
    st = t.StromTarife(hass, entry)
    st._store.d = {"vertraege": [{"id": "a", "anbieter": "X", "von": "2025-01-01", "bis": None, "arbeitspreis_ct": 20, "grundpreis_eur": 156.38, "notiz": ""}], "ablesungen": []}
    await st.async_load()
    assert st.contracts[0]["grundpreis_einheit"] == "jahr" and st.contracts[0]["grundpreis_eur"] == 156.38
    assert st._store.d["vertraege"][0]["grundpreis_einheit"] == "jahr"
    c = await st.async_save_contract({"anbieter": "Y", "von": "2026-01-01", "arbeitspreis_ct": 1, "grundpreis_eur": "14,02", "grundpreis_einheit": "monat"})
    assert t.grundpreis_pro_jahr(c) == 168.24, t.grundpreis_pro_jahr(c)
    assert t.grundpreis_pro_monat(c) == 14.02
    assert abs(t.grundpreis_pro_monat(st.contracts[0]) - 156.38 / 12) < 1e-9
    print("grundpreis ok")
asyncio.run(run3())
print("OK")
