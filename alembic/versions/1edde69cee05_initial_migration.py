"""Initial migration

Revision ID: 1edde69cee05
Revises:
Create Date: 2025-11-27 07:52:07.367112

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1edde69cee05"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create users table
    op.create_table(
        "users",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column("username", sa.String(255), nullable=True),
        sa.Column("first_name", sa.String(255), nullable=False),
        sa.Column("last_name", sa.String(255), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("gender", sa.String(50), nullable=True),
        sa.Column("interests", sa.JSON(), nullable=True, server_default=sa.text("'[]'")),
        sa.Column("photos", sa.JSON(), nullable=True, server_default=sa.text("'[]'")),
        sa.Column("location", sa.JSON(), nullable=True),
        sa.Column("preferences", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_profile_complete", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_active", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )

    # Create matches table
    op.create_table(
        "matches",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column("user1_id", sa.String(255), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("user2_id", sa.String(255), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("user1_action", sa.String(50), nullable=True),
        sa.Column("user2_action", sa.String(50), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("compatibility_score", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )

    # Create indexes
    op.create_index("idx_users_is_active", "users", ["is_active"])
    op.create_index("idx_users_last_active", "users", ["last_active"])
    op.create_index("idx_matches_user1_id", "matches", ["user1_id"])
    op.create_index("idx_matches_user2_id", "matches", ["user2_id"])
    op.create_index("idx_matches_status", "matches", ["status"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("idx_matches_status", table_name="matches")
    op.drop_index("idx_matches_user2_id", table_name="matches")
    op.drop_index("idx_matches_user1_id", table_name="matches")
    op.drop_index("idx_users_last_active", table_name="users")
    op.drop_index("idx_users_is_active", table_name="users")
    op.drop_table("matches")
    op.drop_table("users")
