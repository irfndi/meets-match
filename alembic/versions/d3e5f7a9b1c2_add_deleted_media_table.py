"""add deleted_media table for soft delete tracking

Revision ID: d3e5f7a9b1c2
Revises: c1a9743e2452
Create Date: 2025-12-02 01:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d3e5f7a9b1c2"
down_revision: Union[str, Sequence[str], None] = "c1a9743e2452"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "deleted_media",
        sa.Column("id", sa.String(50), primary_key=True),
        sa.Column("user_id", sa.String(50), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=False, server_default=sa.func.now(), index=True),
        sa.Column("reason", sa.String(100), nullable=True),
        sa.Column("is_purged", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("deleted_media")
