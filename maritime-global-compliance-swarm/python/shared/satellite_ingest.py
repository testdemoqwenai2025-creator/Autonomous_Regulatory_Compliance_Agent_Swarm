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
from datetime import datetime, timezone
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