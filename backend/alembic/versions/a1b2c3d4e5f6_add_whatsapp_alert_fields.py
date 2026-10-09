"""add_whatsapp_alert_fields

Revision ID: a1b2c3d4e5f6
Revises: ed16877507c5
Create Date: 2026-10-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'ed16877507c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to add WhatsApp notification & sensor telemetry fields to alerts table."""
    op.execute("""
    ALTER TABLE alerts ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION;
    ALTER TABLE alerts ADD COLUMN IF NOT EXISTS humidity DOUBLE PRECISION;
    ALTER TABLE alerts ADD COLUMN IF NOT EXISTS soil_moisture DOUBLE PRECISION;
    ALTER TABLE alerts ADD COLUMN IF NOT EXISTS wind_speed DOUBLE PRECISION;
    ALTER TABLE alerts ADD COLUMN IF NOT EXISTS location VARCHAR(255);
    ALTER TABLE alerts ADD COLUMN IF NOT EXISTS whatsapp_status VARCHAR(50);
    ALTER TABLE alerts ADD COLUMN IF NOT EXISTS whatsapp_message_sid VARCHAR(255);
    ALTER TABLE alerts ADD COLUMN IF NOT EXISTS whatsapp_error TEXT;
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("""
    ALTER TABLE alerts DROP COLUMN IF EXISTS whatsapp_error;
    ALTER TABLE alerts DROP COLUMN IF EXISTS whatsapp_message_sid;
    ALTER TABLE alerts DROP COLUMN IF EXISTS whatsapp_status;
    ALTER TABLE alerts DROP COLUMN IF EXISTS location;
    ALTER TABLE alerts DROP COLUMN IF EXISTS wind_speed;
    ALTER TABLE alerts DROP COLUMN IF EXISTS soil_moisture;
    ALTER TABLE alerts DROP COLUMN IF EXISTS humidity;
    ALTER TABLE alerts DROP COLUMN IF EXISTS temperature;
    """)
