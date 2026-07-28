"""Database session management for the Maritime Compliance Swarm.

Provides engine creation, session factories, and schema migration helpers.
Supports SQLite (development) and PostgreSQL (production) via config.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from .config import SwarmConfig
from .models import Base

logger = logging.getLogger(__name__)


def _enable_sqlite_wal(dbapi_conn, connection_record):
    """Enable WAL mode for better SQLite concurrency."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_engine_from_config(config: SwarmConfig):
    """Create a SQLAlchemy engine based on the swarm configuration.

    Automatically applies driver-specific pragmas and pool settings.
    """
    db_config = config.database
    url = db_config.connection_string

    kwargs = {
        "echo": config.log_level == "DEBUG",
        "pool_pre_ping": True,
    }

    if db_config.driver == "sqlite":
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        kwargs["pool_size"] = 10
        kwargs["max_overflow"] = 20
        kwargs["pool_recycle"] = 3600

    engine = create_engine(url, **kwargs)

    if db_config.driver == "sqlite":
        event.listen(engine, "connect", _enable_sqlite_wal)

    logger.info("Database engine created: driver=%s", db_config.driver)
    return engine


def init_schema(engine) -> None:
    """Create all tables if they do not exist."""
    Base.metadata.create_all(engine)
    logger.info("Database schema initialised")


def get_session_factory(engine) -> sessionmaker[Session]:
    """Return a configured sessionmaker bound to the given engine."""
    return sessionmaker(bind=engine, expire_on_commit=False)


def get_session(session_factory: sessionmaker[Session]) -> Generator[Session, None, None]:
    """FastAPI/CLI dependency that yields a session and ensures cleanup."""
    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
