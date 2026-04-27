"""add template schedule rule fields

Revision ID: c4d21f09a6be
Revises: e6c1f4b2a9d8
Create Date: 2026-04-26 00:00:00.000000

"""

from typing import Sequence, Union
import re

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d21f09a6be'
down_revision: Union[str, Sequence[str], None] = 'e6c1f4b2a9d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    template_columns = {col["name"] for col in inspector.get_columns("event_templates")}
    if "schedule_rule_type" not in template_columns:
        op.add_column(
            "event_templates",
            sa.Column("schedule_rule_type", sa.String(), nullable=False, server_default="nth_weekday"),
        )
    if "schedule_months" not in template_columns:
        op.add_column(
            "event_templates",
            sa.Column("schedule_months", sa.JSON(), nullable=False, server_default=sa.text("'[5,6,7,8,9]'")),
        )
    if "schedule_weekday" not in template_columns:
        op.add_column(
            "event_templates",
            sa.Column("schedule_weekday", sa.Integer(), nullable=False, server_default="5"),
        )
    if "schedule_week_numbers" not in template_columns:
        op.add_column(
            "event_templates",
            sa.Column("schedule_week_numbers", sa.JSON(), nullable=False, server_default=sa.text("'[2,3]'")),
        )

    event_columns = {col["name"] for col in inspector.get_columns("events")}
    if "template_id" not in event_columns:
        op.add_column("events", sa.Column("template_id", sa.Uuid(), nullable=True))

    index_names = {idx["name"] for idx in inspector.get_indexes("events")}
    if "ix_events_template_id" not in index_names:
        op.create_index(op.f("ix_events_template_id"), "events", ["template_id"], unique=False)

    # Backfill template_id for existing events without overwriting existing assignments.
    def _normalize(value):
        text = str(value or "").strip().lower()
        return re.sub(r"\s+", " ", text)

    def _slugify(value):
        text = _normalize(value)
        text = re.sub(r"[^a-z0-9\s-]", "", text)
        text = re.sub(r"[-\s]+", "-", text).strip("-")
        return text

    event_templates = sa.table(
        "event_templates",
        sa.column("id", sa.Uuid()),
        sa.column("name", sa.String()),
        sa.column("location", sa.String()),
    )
    events = sa.table(
        "events",
        sa.column("id", sa.Uuid()),
        sa.column("template_id", sa.Uuid()),
        sa.column("title", sa.String()),
        sa.column("city", sa.String()),
    )

    template_rows = bind.execute(
        sa.select(
            event_templates.c.id,
            event_templates.c.name,
            event_templates.c.location,
        )
    ).all()

    templates = [
        {
            "id": row.id,
            "name": row.name,
            "name_norm": _normalize(row.name),
            "name_slug": _slugify(row.name),
            "city_norm": _normalize(row.location),
        }
        for row in template_rows
    ]

    event_rows = bind.execute(
        sa.select(
            events.c.id,
            events.c.title,
            events.c.city,
        ).where(events.c.template_id.is_(None))
    ).all()

    for event in event_rows:
        event_title_norm = _normalize(event.title)
        event_city_norm = _normalize(event.city)
        event_slug = _slugify(event.title)

        # 1) STRICT MATCH: normalized title contains template name + exact city match
        strict_matches = [
            t
            for t in templates
            if t["city_norm"] == event_city_norm
            and t["name_norm"]
            and t["name_norm"] in event_title_norm
        ]
        if len(strict_matches) == 1:
            bind.execute(
                sa.update(events)
                .where(events.c.id == event.id, events.c.template_id.is_(None))
                .values(template_id=strict_matches[0]["id"])
            )
            print(f"Assigned via strict match: event={event.id} template={strict_matches[0]['id']}")
            continue

        # 2) SEMI-STRICT MATCH: slug similarity or partial title match + exact city match
        semi_matches = []
        for t in templates:
            if t["city_norm"] != event_city_norm:
                continue
            slug_similar = bool(t["name_slug"] and event_slug and (t["name_slug"] in event_slug or event_slug in t["name_slug"]))
            partial_title = bool(t["name_norm"] and event_title_norm and (t["name_norm"] in event_title_norm or event_title_norm in t["name_norm"]))
            if slug_similar or partial_title:
                semi_matches.append(t)

        if len(semi_matches) == 1:
            bind.execute(
                sa.update(events)
                .where(events.c.id == event.id, events.c.template_id.is_(None))
                .values(template_id=semi_matches[0]["id"])
            )
            print(f"Assigned via semi-strict match: event={event.id} template={semi_matches[0]['id']}")
            continue

        # 3) LOCATION-ONLY MATCH: only if exactly one template exists for the city
        city_matches = [t for t in templates if t["city_norm"] == event_city_norm]
        if len(city_matches) == 1:
            bind.execute(
                sa.update(events)
                .where(events.c.id == event.id, events.c.template_id.is_(None))
                .values(template_id=city_matches[0]["id"])
            )
            print(f"Assigned via location-only fallback: event={event.id} template={city_matches[0]['id']}")
        else:
            print(f"Skipped - ambiguous match: event={event.id} city={event_city_norm or 'unknown'}")

def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    index_names = {idx["name"] for idx in inspector.get_indexes("events")}
    if "ix_events_template_id" in index_names:
        op.drop_index(op.f("ix_events_template_id"), table_name="events")

    event_columns = {col["name"] for col in inspector.get_columns("events")}
    if "template_id" in event_columns:
        with op.batch_alter_table("events", schema=None) as batch_op:
            batch_op.drop_column("template_id")

    template_columns = {col["name"] for col in inspector.get_columns("event_templates")}
    for column_name in ("schedule_week_numbers", "schedule_weekday", "schedule_months", "schedule_rule_type"):
        if column_name in template_columns:
            with op.batch_alter_table("event_templates", schema=None) as batch_op:
                batch_op.drop_column(column_name)
