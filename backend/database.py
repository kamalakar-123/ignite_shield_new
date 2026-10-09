import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from config import settings

logger = logging.getLogger("ignite_shield.database")

def create_configured_engine(url: str):
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    try:
        return create_engine(url, connect_args=connect_args)
    except Exception as exc:
        logger.warning("Failed to initialize database engine for %s: %s. Falling back to local SQLite.", url, exc)
        return create_engine("sqlite:///./ignite_shield.db", connect_args={"check_same_thread": False})

engine = create_configured_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

