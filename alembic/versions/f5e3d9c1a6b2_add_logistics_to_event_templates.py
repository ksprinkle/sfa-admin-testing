"""add logistics to event templates

Revision ID: f5e3d9c1a6b2
Revises: e6c1f4b2a9d8
Create Date: 2026-04-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f5e3d9c1a6b2"
down_revision: Union[str, Sequence[str], None] = "e6c1f4b2a9d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    
    # Get existing columns in event_templates
    existing_columns = set(col['name'] for col in inspector.get_columns('event_templates'))
    
    # Add columns only if they don't exist
    if 'volunteer_capacity' not in existing_columns:
        op.add_column('event_templates', sa.Column('volunteer_capacity', sa.Integer(), nullable=True))
    
    if 'featured_image' not in existing_columns:
        op.add_column('event_templates', sa.Column('featured_image', sa.String(), nullable=True))
    
    if 'city' not in existing_columns:
        op.add_column('event_templates', sa.Column('city', sa.String(), nullable=True))
    
    if 'state' not in existing_columns:
        op.add_column('event_templates', sa.Column('state', sa.String(), nullable=True))
    
    if 'latitude' not in existing_columns:
        op.add_column('event_templates', sa.Column('latitude', sa.Float(), nullable=True))
    
    if 'longitude' not in existing_columns:
        op.add_column('event_templates', sa.Column('longitude', sa.Float(), nullable=True))
    
    if 'beach_accessibility' not in existing_columns:
        op.add_column('event_templates', sa.Column('beach_accessibility', sa.Boolean(), nullable=False, server_default='true'))
    
    if 'beach_access_notes' not in existing_columns:
        op.add_column('event_templates', sa.Column('beach_access_notes', sa.Text(), nullable=True))
    
    if 'directions' not in existing_columns:
        op.add_column('event_templates', sa.Column('directions', sa.Text(), nullable=True))
    
    if 'parking_info' not in existing_columns:
        op.add_column('event_templates', sa.Column('parking_info', sa.Text(), nullable=True))
    
    if 'lodging_info' not in existing_columns:
        op.add_column('event_templates', sa.Column('lodging_info', sa.Text(), nullable=True))
    
    if 'weather_report_url' not in existing_columns:
        op.add_column('event_templates', sa.Column('weather_report_url', sa.String(), nullable=True))
    
    if 'surf_report_url' not in existing_columns:
        op.add_column('event_templates', sa.Column('surf_report_url', sa.String(), nullable=True))
    
    if 'internal_notes' not in existing_columns:
        op.add_column('event_templates', sa.Column('internal_notes', sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    
    # Get existing columns in event_templates
    existing_columns = set(col['name'] for col in inspector.get_columns('event_templates'))
    
    # Drop columns only if they exist
    if 'internal_notes' in existing_columns:
        op.drop_column('event_templates', 'internal_notes')
    
    if 'surf_report_url' in existing_columns:
        op.drop_column('event_templates', 'surf_report_url')
    
    if 'weather_report_url' in existing_columns:
        op.drop_column('event_templates', 'weather_report_url')
    
    if 'lodging_info' in existing_columns:
        op.drop_column('event_templates', 'lodging_info')
    
    if 'parking_info' in existing_columns:
        op.drop_column('event_templates', 'parking_info')
    
    if 'directions' in existing_columns:
        op.drop_column('event_templates', 'directions')
    
    if 'beach_access_notes' in existing_columns:
        op.drop_column('event_templates', 'beach_access_notes')
    
    if 'beach_accessibility' in existing_columns:
        op.drop_column('event_templates', 'beach_accessibility')
    
    if 'longitude' in existing_columns:
        op.drop_column('event_templates', 'longitude')
    
    if 'latitude' in existing_columns:
        op.drop_column('event_templates', 'latitude')
    
    if 'state' in existing_columns:
        op.drop_column('event_templates', 'state')
    
    if 'city' in existing_columns:
        op.drop_column('event_templates', 'city')
    
    if 'featured_image' in existing_columns:
        op.drop_column('event_templates', 'featured_image')
    
    if 'volunteer_capacity' in existing_columns:
        op.drop_column('event_templates', 'volunteer_capacity')
