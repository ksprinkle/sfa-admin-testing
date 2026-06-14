"""add automation foundation tables

Revision ID: p4a4f1d8c2b7
Revises: z1f4c7a9b2d6
Create Date: 2026-06-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "p4a4f1d8c2b7"
down_revision: Union[str, Sequence[str], None] = "z1f4c7a9b2d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "automation_workflows" not in existing_tables:
        op.create_table(
            "automation_workflows",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("workflow_key", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("trigger_type", sa.String(), nullable=False, server_default="manual"),
            sa.Column("target_domain", sa.String(), nullable=False),
            sa.Column("action", sa.String(), nullable=False),
            sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("config", sa.JSON(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("workflow_key", name="uq_automation_workflows_workflow_key"),
        )

    inspector = sa.inspect(bind)
    if "automation_workflows" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "automation_workflows")
        if "ix_automation_workflows_workflow_key" not in indexes:
            op.create_index("ix_automation_workflows_workflow_key", "automation_workflows", ["workflow_key"], unique=True)
        if "ix_automation_workflows_trigger_type" not in indexes:
            op.create_index("ix_automation_workflows_trigger_type", "automation_workflows", ["trigger_type"], unique=False)
        if "ix_automation_workflows_target_domain" not in indexes:
            op.create_index("ix_automation_workflows_target_domain", "automation_workflows", ["target_domain"], unique=False)
        if "ix_automation_workflows_action" not in indexes:
            op.create_index("ix_automation_workflows_action", "automation_workflows", ["action"], unique=False)

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "automation_runs" not in existing_tables:
        op.create_table(
            "automation_runs",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("workflow_id", sa.UUID(), nullable=False),
            sa.Column("trigger_source", sa.String(), nullable=False, server_default="manual_api"),
            sa.Column("status", sa.String(), nullable=False, server_default="pending"),
            sa.Column("trigger_payload", sa.JSON(), nullable=True),
            sa.Column("result_payload", sa.JSON(), nullable=True),
            sa.Column("error_message", sa.String(), nullable=True),
            sa.Column("initiated_by_user_id", sa.String(), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["initiated_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["workflow_id"], ["automation_workflows.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if "automation_runs" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "automation_runs")
        if "ix_automation_runs_workflow_id" not in indexes:
            op.create_index("ix_automation_runs_workflow_id", "automation_runs", ["workflow_id"], unique=False)
        if "ix_automation_runs_status" not in indexes:
            op.create_index("ix_automation_runs_status", "automation_runs", ["status"], unique=False)
        if "ix_automation_runs_created_at" not in indexes:
            op.create_index("ix_automation_runs_created_at", "automation_runs", ["created_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "automation_runs" in existing_tables:
        indexes = _index_names(inspector, "automation_runs")
        if "ix_automation_runs_created_at" in indexes:
            op.drop_index("ix_automation_runs_created_at", table_name="automation_runs")
        if "ix_automation_runs_status" in indexes:
            op.drop_index("ix_automation_runs_status", table_name="automation_runs")
        if "ix_automation_runs_workflow_id" in indexes:
            op.drop_index("ix_automation_runs_workflow_id", table_name="automation_runs")
        op.drop_table("automation_runs")

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "automation_workflows" in existing_tables:
        indexes = _index_names(inspector, "automation_workflows")
        if "ix_automation_workflows_action" in indexes:
            op.drop_index("ix_automation_workflows_action", table_name="automation_workflows")
        if "ix_automation_workflows_target_domain" in indexes:
            op.drop_index("ix_automation_workflows_target_domain", table_name="automation_workflows")
        if "ix_automation_workflows_trigger_type" in indexes:
            op.drop_index("ix_automation_workflows_trigger_type", table_name="automation_workflows")
        if "ix_automation_workflows_workflow_key" in indexes:
            op.drop_index("ix_automation_workflows_workflow_key", table_name="automation_workflows")
        op.drop_table("automation_workflows")