"""create_sensor_predictions_and_models

Revision ID: ed16877507c5
Revises: 
Create Date: 2026-09-30 23:52:32.432600

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ed16877507c5'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Ensure sensor_predictions table structure
    op.execute("""
    CREATE TABLE IF NOT EXISTS sensor_predictions (
        id SERIAL PRIMARY KEY,
        temperature DOUBLE PRECISION NOT NULL,
        humidity DOUBLE PRECISION NOT NULL,
        soil_moisture DOUBLE PRECISION NOT NULL,
        wind_speed DOUBLE PRECISION NOT NULL,
        wind_direction DOUBLE PRECISION,
        precipitation DOUBLE PRECISION,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        zone_name VARCHAR,
        fire_risk VARCHAR NOT NULL,
        confidence DOUBLE PRECISION NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS ix_sensor_predictions_id ON sensor_predictions (id);
    """)

    # Ensure users table structure
    op.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR NOT NULL UNIQUE,
        email VARCHAR NOT NULL UNIQUE,
        full_name VARCHAR,
        hashed_password VARCHAR NOT NULL,
        role VARCHAR DEFAULT 'officer',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS ix_users_id ON users (id);
    CREATE INDEX IF NOT EXISTS ix_users_username ON users (username);
    CREATE INDEX IF NOT EXISTS ix_users_email ON users (email);
    """)

    # Ensure alerts table structure
    op.execute("""
    CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        prediction_id INTEGER,
        alert_type VARCHAR NOT NULL,
        risk_level VARCHAR NOT NULL,
        zone_name VARCHAR,
        message VARCHAR NOT NULL,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        is_acknowledged BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS ix_alerts_id ON alerts (id);
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('alerts')
    op.drop_table('users')
    op.drop_table('sensor_predictions')
