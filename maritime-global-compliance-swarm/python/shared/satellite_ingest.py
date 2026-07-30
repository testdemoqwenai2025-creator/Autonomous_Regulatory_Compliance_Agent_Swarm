"""
Satellite and AIS Data Ingestion Stubs.

Provides the foundational interfaces and stub implementations for ingesting
real-time maritime data from satellite feeds, AIS (Automatic Identification
System) streams, and environmental monitoring sources. This module defines
the data contracts and processing pipeline interfaces; actual data source
connections are implemented in production deployment configurations.

Data Sources Covered:
- AIS vessel tracking (positional, voyage, static data)
- Satellite communications (Iridium, VSAT, Inmarsat)
- Weather data (NOAA GFS, ECMWF ERA5)
- Environmental monitoring (emissions, sea surface temperature, wave height)
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import time
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger("satellite_ingest")


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

class VesselClass(str, Enum):
    CARGO = "cargo"
    TANKER = "tanker"
    CONTAINER = "container"
    BULK_CARRIER = "bulk_carrier"
    PASSENGER = "passenger"
    FISHING = "fishing"
    TUG = "tug"
    OTHER = "other"


class NavigationStatus(str, Enum):
    UNDER_WAY = "under_way"
    AT_ANCHOR = "at_anchor"
    NOT_UNDER_COMMAND = "not_under_command"
    RESTRICTED_MANEUVERABILITY = "restricted_maneuverability"
    MOORED = "moored"
    AGROUND = "aground"
    FISHING = "fishing"
    SAILING = "sailing"


@dataclass
class AISPositionReport:
    """AIS Type 1/2/3 Position Report."""
    mmsi: str                          # Maritime Mobile Service Identity
    timestamp: datetime
    latitude: float                    # Decimal degrees
    longitude: float                   # Decimal degrees
    course_over_ground: float          # Degrees (0-360)
    speed_over_ground: float           # Knots
    true_heading: float                # Degrees
    navigation_status: NavigationStatus = NavigationStatus.UNDER_WAY
    imo: Optional[str] = None
    callsign: Optional[str] = None
    vessel_name: Optional[str] = None
    vessel_type: Optional[VesselClass] = None
    destination: Optional[str] = None
    eta: Optional[datetime] = None
    draft: Optional[float] = None
    data_source: str = "ais"           # ais, satellite_ais, radar


@dataclass
class WeatherObservation:
    """Marine weather observation from satellite or buoy."""
    observation_id: str
    timestamp: datetime
    latitude: float
    longitude: float
    wind_speed_knots: float = 0.0
    wind_direction_deg: float = 0.0
    wave_height_m: float = 0.0
    wave_period_s: float = 0.0
    sea_surface_temp_c: float = 0.0
    air_pressure_hpa: float = 1013.25
    visibility_nm: float = 10.0
    precipitation_mm_h: float = 0.0
    data_source: str = "noaa_gfs"      # noaa_gfs, ecmwf, buoy, satellite
    forecast_hours_ahead: int = 0      # 0 = observation, >0 = forecast


@dataclass
class EmissionsReading:
    """Vessel emissions monitoring data."""
    vessel_id: str
    timestamp: datetime
    latitude: float
    longitude: float
    co2_emissions_tonnes: float = 0.0
    sox_emissions_kg: float = 0.0
    nox_emissions_kg: float = 0.0
    fuel_consumption_tonnes: float = 0.0
    fuel_type: str = "VLSFO"           # VLSFO, LNG, Methanol, Hydrogen
    speed_knots: float = 0.0
    data_source: str = "mrv"           # MRV (EU), IMO DCS, sensor


@dataclass
class ComplianceCorrelationEvent:
    """Event produced when external data correlates with a compliance finding."""
    event_type: str                    # e.g., "weather_hold", "route_deviation", "emissions_breach"
    finding_id: Optional[str]
    vessel_id: Optional[str]
    correlation_type: str              # weather, emissions, route, port_closure
    severity_impact: str               # "upgraded", "downgraded", "no_change"
    description: str
    external_data_ref: str             # Reference to the external data source
    confidence: float = 0.0            # 0.0 - 1.0
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Abstract Data Ingesters
# ---------------------------------------------------------------------------

class DataIngester(ABC):
    """Abstract base for all data ingestion sources."""

    def __init__(self, source_name: str):
        self.source_name = source_name
        self._running = False
        self._processed_count = 0
        self._error_count = 0
        self._last_ingest: Optional[datetime] = None

    @abstractmethod
    def connect(self) -> bool:
        """Establish connection to the data source. Returns True on success."""
        ...

    @abstractmethod
    def ingest(self) -> list[Any]:
        """Ingest and return new data points. Returns empty list if no new data."""
        ...

    def disconnect(self) -> None:
        """Clean up connections."""
        self._running = False

    @property
    def stats(self) -> dict:
        return {
            "source": self.source_name,
            "running": self._running,
            "processed_count": self._processed_count,
            "error_count": self._error_count,
            "last_ingest": self._last_ingest.isoformat() if self._last_ingest else None,
        }


# ---------------------------------------------------------------------------
# Stub Implementations
# ---------------------------------------------------------------------------

class AISIngestStub(DataIngester):
    """Stub AIS data ingester for development and testing.

    In production, this connects to:
    - AIS terrestrial receivers via UDP/TCP
    - Satellite-AIS providers (exactEarth, Spire, Orbcomm)
    - National AIS networks via API
    """

    def __init__(self):
        super().__init__("ais_terrestrial")
        self._buffer: list[AISPositionReport] = []

    def connect(self) -> bool:
        self._running = True
        logger.info(f"Connected to {self.source_name}")
        return True

    def ingest(self) -> list[AISPositionReport]:
        if not self._running:
            return []

        # In production: parse AIS NMEA sentences from TCP/UDP socket
        # For development: return empty (data injected via API for testing)
        results = list(self._buffer)
        self._buffer.clear()
        self._processed_count += len(results)
        self._last_ingest = datetime.now(timezone.utc)
        return results

    def inject_test_data(self, report: AISPositionReport) -> None:
        """Inject test data into the buffer (for development/testing)."""
        self._buffer.append(report)


class WeatherIngestStub(DataIngester):
    """Stub weather data ingester for development and testing.

    In production, this connects to:
    - NOAA GFS API (15-minute polling cycle)
    - ECMWF ERA5 reanalysis
    - Commercial marine weather APIs (StormGeo, DTN)
    - Port authority weather stations
    """

    def __init__(self):
        super().__init__("noaa_gfs_marine")
        self._zone_cache: dict[str, WeatherObservation] = {}

    def connect(self) -> bool:
        self._running = True
        logger.info(f"Connected to {self.source_name}")
        return True

    def ingest(self) -> list[WeatherObservation]:
        if not self._running:
            return []

        # In production: fetch GFS data via HTTP API, parse GRIB2
        # For development: return cached zone data
        results = list(self._zone_cache.values())
        self._processed_count += len(results)
        self._last_ingest = datetime.now(timezone.utc)
        return results

    def update_zone(self, zone_id: str, observation: WeatherObservation) -> None:
        """Update weather data for a zone (for development/testing)."""
        self._zone_cache[zone_id] = observation


class EmissionsIngestStub(DataIngester):
    """Stub emissions monitoring ingester for development and testing.

    In production, this connects to:
    - EU MRV (Monitoring, Reporting, Verification) system
    - IMO DCS (Data Collection System)
    - Onboard sensor networks via IoT/MQTT
    - Third-party emissions monitoring APIs
    """

    def __init__(self):
        super().__init__("eu_mrv")

    def connect(self) -> bool:
        self._running = True
        logger.info(f"Connected to {self.source_name}")
        return True

    def ingest(self) -> list[EmissionsReading]:
        if not self._running:
            return []
        # In production: fetch MRV reports via API, parse XML/JSON
        self._last_ingest = datetime.now(timezone.utc)
        return []


# ---------------------------------------------------------------------------
# Compliance Correlation Engine
# ---------------------------------------------------------------------------

class ComplianceCorrelator:
    """Correlates external data (weather, AIS, emissions) with compliance findings.

    Produces ComplianceCorrelationEvents that can be published to the
    event bus for downstream reaction processing.
    """

    def __init__(self):
        self._correlation_rules: list[Callable] = [
            self._check_weather_hold,
            self._check_route_deviation,
            self._check_emissions_breach,
            self._check_port_closure,
        ]

    def correlate(self, finding: object, external_data: list[Any]) -> list[ComplianceCorrelationEvent]:
        """Run all correlation rules against a finding and external data."""
        events = []
        for rule in self._correlation_rules:
            try:
                result = rule(finding, external_data)
                if result:
                    events.extend(result if isinstance(result, list) else [result])
            except Exception as e:
                logger.error(f"Correlation rule error: {e}")
        return events

    def _check_weather_hold(self, finding: object, data: list[Any]) -> Optional[ComplianceCorrelationEvent]:
        """Check if active weather event warrants SLA pause."""
        weather_data = [d for d in data if isinstance(d, WeatherObservation)]
        for obs in weather_data:
            if obs.wave_height_m > 4.0 or obs.wind_speed_knots > 50:
                return ComplianceCorrelationEvent(
                    event_type="weather_hold",
                    finding_id=getattr(finding, "id", None),
                    correlation_type="weather",
                    severity_impact="downgraded",
                    description=f"Severe weather detected: wind {obs.wind_speed_knots}kn, "
                                f"waves {obs.wave_height_m}m. SLA clock paused.",
                    external_data_ref=f"weather:{obs.observation_id}",
                    confidence=0.85,
                )
        return None

    def _check_route_deviation(self, finding: object, data: list[Any]) -> Optional[ComplianceCorrelationEvent]:
        """Check if AIS data shows unexpected route deviation."""
        ais_data = [d for d in data if isinstance(d, AISPositionReport)]
        if len(ais_data) >= 2:
            latest = ais_data[-1]
            if latest.navigation_status == NavigationStatus.NOT_UNDER_COMMAND:
                return ComplianceCorrelationEvent(
                    event_type="route_deviation",
                    vessel_id=latest.mmsi,
                    correlation_type="route",
                    severity_impact="upgraded",
                    description=f"Vessel {latest.mmsi} not under command at "
                                f"({latest.latitude:.4f}, {latest.longitude:.4f}). "
                                f"Compliance risk upgraded.",
                    external_data_ref=f"ais:{latest.mmsi}",
                    confidence=0.90,
                )
        return None

    def _check_emissions_breach(self, finding: object, data: list[Any]) -> Optional[ComplianceCorrelationEvent]:
        """Check if emissions readings exceed EU ETS / IMO thresholds."""
        emissions_data = [d for d in data if isinstance(d, EmissionsReading)]
        for reading in emissions_data:
            if reading.sox_emissions_kg > 500 or reading.nox_emissions_kg > 2000:
                return ComplianceCorrelationEvent(
                    event_type="emissions_breach",
                    vessel_id=reading.vessel_id,
                    correlation_type="emissions",
                    severity_impact="upgraded",
                    description=f"Vessel {reading.vessel_id} emissions breach: "
                                f"SOx {reading.sox_emissions_kg}kg, "
                                f"NOx {reading.nox_emissions_kg}kg.",
                    external_data_ref=f"emissions:{reading.vessel_id}",
                    confidence=0.95,
                )
        return None

    def _check_port_closure(self, finding: object, data: list[Any]) -> Optional[ComplianceCorrelationEvent]:
        """Check if port closure events affect finding timelines."""
        # Port closures would come through as weather events or explicit notifications
        weather_data = [d for d in data if isinstance(d, WeatherObservation)]
        for obs in weather_data:
            if obs.visibility_nm < 0.5 and obs.wind_speed_knots > 65:
                return ComplianceCorrelationEvent(
                    event_type="port_closure",
                    finding_id=getattr(finding, "id", None),
                    correlation_type="weather",
                    severity_impact="downgraded",
                    description=f"Port closure conditions detected: visibility {obs.visibility_nm}nm, "
                                f"wind {obs.wind_speed_knots}kn. Finding SLA extended.",
                    external_data_ref=f"weather:{obs.observation_id}",
                    confidence=0.75,
                )
        return None


# ---------------------------------------------------------------------------
# Data Pipeline Orchestrator
# ---------------------------------------------------------------------------

class DataPipelineOrchestrator:
    """Orchestrates data ingestion from multiple external sources.

    In production, runs as a background service that:
    1. Polls/connects to each data source
    2. Normalises incoming data
    3. Runs compliance correlation
    4. Publishes correlation events to the event bus
    """

    def __init__(self):
        self._ingesters: dict[str, DataIngester] = {}
        self._correlator = ComplianceCorrelator()
        self._event_callback: Optional[Callable] = None
        self._running = False

    def register_ingester(self, name: str, ingester: DataIngester) -> None:
        self._ingesters[name] = ingester

    def set_event_callback(self, callback: Callable) -> None:
        """Set callback for publishing correlation events to the event bus."""
        self._event_callback = callback

    async def run_cycle(self) -> dict:
        """Execute one ingestion cycle across all sources. Returns stats."""
        if not self._running:
            return {"status": "not_running"}

        cycle_stats = {}
        all_data = []

        for name, ingester in self._ingesters.items():
            try:
                data = ingester.ingest()
                all_data.extend(data)
                cycle_stats[name] = {
                    "status": "ok",
                    "records": len(data),
                }
            except Exception as e:
                logger.error(f"Ingestion error for {name}: {e}")
                cycle_stats[name] = {
                    "status": "error",
                    "error": str(e),
                }

        return {
            "status": "completed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "sources": cycle_stats,
            "total_records": len(all_data),
        }

    def start(self) -> None:
        """Start all ingesters."""
        self._running = True
        for name, ingester in self._ingesters.items():
            ingester.connect()
        logger.info(f"Data pipeline started with {len(self._ingesters)} sources")

    def stop(self) -> None:
        """Stop all ingesters."""
        self._running = False
        for ingester in self._ingesters.values():
            ingester.disconnect()
        logger.info("Data pipeline stopped")

    @property
    def stats(self) -> dict:
        return {
            "running": self._running,
            "sources": {name: ingester.stats for name, ingester in self._ingesters.items()},
            "correlator": "active" if self._running else "stopped",
        }

# ---------------------------------------------------------------------------
# Enhanced Satellite AIS Ingestion (H1)
# ---------------------------------------------------------------------------

@dataclass
class AISMessage:
    """Lightweight AIS message for satellite-based ingestion.

    Designed for high-throughput satellite AIS feeds where messages arrive
    in NMEA VDM/VDO format or JSON payloads from provider APIs.
    """
    mmsi: str
    lat: float
    lon: float
    heading: float          # True heading in degrees (0-360)
    speed: float            # Speed over ground in knots
    timestamp: datetime
    nav_status: str = ""    # Raw navigation status from AIS
    message_type: int = 1   # AIS message type (1=position, 5=static, etc.)

    @property
    def position_hash(self) -> str:
        return hashlib.sha256(
            f"{self.mmsi}:{self.lat:.6f}:{self.lon:.6f}:{self.timestamp.isoformat()}".encode()
        ).hexdigest()[:16]


@dataclass
class AISMessageBatch:
    """Container for a batch of AIS messages from a single provider poll."
    """
    messages: list[AISMessage] = field(default_factory=list)
    provider: str = ""
    received_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    batch_id: str = field(default_factory=lambda: hashlib.sha256(
        f"{time.time_ns()}".encode()
    ).hexdigest()[:12])

    @property
    def size(self) -> int:
        return len(self.messages)

    def sort_by_timestamp(self) -> None:
        self.messages.sort(key=lambda m: m.timestamp)


@dataclass
class AISIngestionConfig:
    """Configuration for the AIS ingestion pipeline."""
    provider_name: str = "exactearth"
    api_endpoint: str = ""
    api_key: str = ""
    dedup_window_seconds: float = 300.0   # 5 minutes
    interpolation_max_gap_minutes: float = 30.0
    batch_size: int = 1000
    poll_interval_seconds: float = 60.0
    spatial_index_target: str = "postgis"  # postgis | memory


# Pre-defined provider configurations
PROVIDER_CONFIGS: dict[str, AISIngestionConfig] = {
    "exactearth": AISIngestionConfig(
        provider_name="exactearth",
        api_endpoint="https://api.exactearth.com/v2/",
        dedup_window_seconds=300.0,
        interpolation_max_gap_minutes=30.0,
        batch_size=2000,
        poll_interval_seconds=30.0,
    ),
    "spire": AISIngestionConfig(
        provider_name="spire",
        api_endpoint="https://ais.spire.com/v2/",
        dedup_window_seconds=300.0,
        interpolation_max_gap_minutes=25.0,
        batch_size=5000,
        poll_interval_seconds=15.0,
    ),
    "orbcomm": AISIngestionConfig(
        provider_name="orbcomm",
        api_endpoint="https://api.orbcomm.com/v1/ais/",
        dedup_window_seconds=300.0,
        interpolation_max_gap_minutes=30.0,
        batch_size=1500,
        poll_interval_seconds=45.0,
    ),
}


# Compliance event types generated by the AIS pipeline
AIS_COMPLIANCE_EVENT_TYPES: list[str] = [
    "ROUTE_DEVIATION",
    "AIS_GAP_DETECTED",
    "POSITIONAL_ANOMALY",
    "DARK_SHIP_SUSPECTED",
]


# ---------------------------------------------------------------------------
# AIS Pipeline Stages
# ---------------------------------------------------------------------------

def ais_decode(raw_payloads: list[dict]) -> list[AISMessage]:
    """Pipeline stage: Decode raw provider payloads into AISMessage objects.

    In production, this parses NMEA VDM sentences or provider-specific JSON.
    For development, it extracts fields from pre-parsed dicts.
    """
    messages = []
    for payload in raw_payloads:
        try:
            ts = payload.get("timestamp")
            if isinstance(ts, str):
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            elif ts is None:
                ts = datetime.now(timezone.utc)
            messages.append(AISMessage(
                mmsi=str(payload.get("mmsi", "")),
                lat=float(payload.get("latitude", 0.0)),
                lon=float(payload.get("longitude", 0.0)),
                heading=float(payload.get("heading", 0.0)),
                speed=float(payload.get("speed", 0.0)),
                timestamp=ts,
                nav_status=str(payload.get("nav_status", "")),
                message_type=int(payload.get("message_type", 1)),
            ))
        except (ValueError, TypeError) as e:
            logger.warning(f"AIS decode error: {e}")
    return messages


def ais_deduplicate(messages: list[AISMessage], window_seconds: float = 300.0) -> list[AISMessage]:
    """Pipeline stage: Remove duplicate messages within a time window.

    Duplicates are identified by same MMSI with timestamps within
    the specified window (default 300 seconds). Keeps the most
    recent message in each dedup group.
    """
    if not messages:
        return []

    messages.sort(key=lambda m: (m.mmsi, m.timestamp))
    result: list[AISMessage] = []
    seen: dict[str, datetime] = {}

    for msg in messages:
        last_ts = seen.get(msg.mmsi)
        if last_ts is None:
            seen[msg.mmsi] = msg.timestamp
            result.append(msg)
        else:
            delta = (msg.timestamp - last_ts).total_seconds()
            if delta > window_seconds:
                seen[msg.mmsi] = msg.timestamp
                result.append(msg)
            # else: duplicate within window, skip

    logger.debug(f"AIS dedup: {len(messages)} -> {len(result)} messages (window={window_seconds}s)")
    return result


def ais_temporal_interpolate(
    messages: list[AISMessage],
    max_gap_minutes: float = 30.0,
) -> list[AISMessage]:
    """Pipeline stage: Linear interpolation for gaps shorter than max_gap_minutes.

    For each MMSI, if the time gap between consecutive messages is less than
    max_gap_minutes, insert interpolated points at 5-minute intervals.
    This improves route continuity for compliance checks.
    """
    if not messages:
        return []

    max_gap_seconds = max_gap_minutes * 60.0
    interval_seconds = 300.0  # 5-minute intervals

    by_mmsi: dict[str, list[AISMessage]] = defaultdict(list)
    for msg in messages:
        by_mmsi[msg.mmsi].append(msg)

    result: list[AISMessage] = []
    for mmsi, track in by_mmsi.items():
        track.sort(key=lambda m: m.timestamp)
        result.append(track[0])
        for i in range(1, len(track)):
            prev, curr = track[i - 1], track[i]
            gap = (curr.timestamp - prev.timestamp).total_seconds()
            if 0 < gap < max_gap_seconds:
                n_points = int(gap / interval_seconds)
                for j in range(1, n_points):
                    frac = (j * interval_seconds) / gap
                    interp_lat = prev.lat + frac * (curr.lat - prev.lat)
                    interp_lon = prev.lon + frac * (curr.lon - prev.lon)
                    interp_heading = prev.heading + frac * (curr.heading - prev.heading)
                    interp_speed = prev.speed + frac * (curr.speed - prev.speed)
                    interp_ts = prev.timestamp + timedelta(seconds=j * interval_seconds)
                    result.append(AISMessage(
                        mmsi=mmsi,
                        lat=interp_lat,
                        lon=interp_lon,
                        heading=interp_heading % 360,
                        speed=max(0.0, interp_speed),
                        timestamp=interp_ts,
                        nav_status=prev.nav_status,
                        message_type=prev.message_type,
                    ))
            result.append(curr)

    logger.debug(f"AIS interpolation: {len(messages)} -> {len(result)} messages")
    return result


def ais_spatial_index(messages: list[AISMessage], target: str = "postgis") -> list[dict]:
    """Pipeline stage: Create spatial index entries.

    For PostGIS target, generates ST_MakePoint SQL expressions.
    For memory target, returns dicts with lat/lon pairs ready for
    in-memory spatial indexing (e.g., R-tree).
    """
    entries = []
    for msg in messages:
        if target == "postgis":
            entries.append({
                "mmsi": msg.mmsi,
                "timestamp": msg.timestamp.isoformat(),
                "geom_sql": f"ST_MakePoint({msg.lon}, {msg.lat}, 4326)",
                "heading": msg.heading,
                "speed": msg.speed,
            })
        else:
            entries.append({
                "mmsi": msg.mmsi,
                "timestamp": msg.timestamp.isoformat(),
                "lat": msg.lat,
                "lon": msg.lon,
                "heading": msg.heading,
                "speed": msg.speed,
            })
    return entries


def generate_compliance_finding(
    event_type: str,
    mmsi: str,
    description: str,
    severity: str = "medium",
    confidence: float = 0.8,
    evidence: Optional[dict] = None,
) -> dict:
    """Create a compliance finding dict ready for the event bus.

    This stub produces a dict conforming to the event bus schema.
    Downstream consumers (compliance engine, risk scorer) can
    process these findings immediately.
    """
    finding = {
        "event_type": event_type,
        "source": "satellite_ais_pipeline",
        "mmsi": mmsi,
        "description": description,
        "severity": severity,
        "confidence": confidence,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "evidence": evidence or {},
    }
    if event_type not in AIS_COMPLIANCE_EVENT_TYPES:
        logger.warning(f"Unknown AIS compliance event type: {event_type}")
    return finding
