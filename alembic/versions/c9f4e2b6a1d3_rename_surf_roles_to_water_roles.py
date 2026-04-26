"""rename surf role keys to water role keys

Revision ID: c9f4e2b6a1d3
Revises: b1e4a7c9d2f0
Create Date: 2026-04-24
"""

from alembic import op


revision: str = "c9f4e2b6a1d3"
down_revision = "b1e4a7c9d2f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE participants
        SET volunteer_type = CASE
            WHEN lower(trim(coalesce(volunteer_type, ''))) = 'surf_instructor' THEN 'instructor'
            WHEN lower(trim(coalesce(volunteer_type, ''))) = 'surf_buddy' THEN 'buddy'
            ELSE volunteer_type
        END
        """
    )

    op.execute(
        """
        UPDATE participants
        SET volunteer_additional_types =
            replace(
                replace(coalesce(volunteer_additional_types, '[]'), '"surf_instructor"', '"instructor"'),
                '"surf_buddy"',
                '"buddy"'
            )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE participants
        SET volunteer_type = CASE
            WHEN lower(trim(coalesce(volunteer_type, ''))) = 'instructor' THEN 'surf_instructor'
            WHEN lower(trim(coalesce(volunteer_type, ''))) = 'buddy' THEN 'surf_buddy'
            ELSE volunteer_type
        END
        """
    )

    op.execute(
        """
        UPDATE participants
        SET volunteer_additional_types =
            replace(
                replace(coalesce(volunteer_additional_types, '[]'), '"instructor"', '"surf_instructor"'),
                '"buddy"',
                '"surf_buddy"'
            )
        """
    )
