"""add map_url field to events and event_templates

Revision ID: g7e2d4f8b9c3a
Revises: f5e3d9c1a6b2
Create Date: 2026-04-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g7e2d4f8b9c3a"
down_revision: Union[str, Sequence[str], None] = "f5e3d9c1a6b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    
    # Add map_url to events table
    events_columns = set(col['name'] for col in inspector.get_columns('events'))
    if 'map_url' not in events_columns:
        op.add_column('events', sa.Column('map_url', sa.String(), nullable=True))
    
    # Add map_url to event_templates table
    templates_columns = set(col['name'] for col in inspector.get_columns('event_templates'))
    if 'map_url' not in templates_columns:
        op.add_column('event_templates', sa.Column('map_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('event_templates', 'map_url')
    op.drop_column('events', 'map_url')
