"""add_email_alert_fields

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-10-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to add email notification fields to alerts table."""
    op.execute("""
    ALTER TABLE alerts ADD COLUMN IF NOT EXISTS email_status VARCHAR(50);
    ALTER TABLE alerts ADD COLUMN IF NOT EXISTS email_recipient VARCHAR(255);
    ALTER TABLE alerts ADD COLUMN IF NOT EXISTS email_error TEXT;
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("""
    ALTER TABLE alerts DROP COLUMN IF EXISTS email_error;
    ALTER TABLE alerts DROP COLUMN IF EXISTS email_recipient;
    ALTER TABLE alerts DROP COLUMN IF EXISTS email_status;
    """)
