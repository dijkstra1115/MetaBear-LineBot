"""Initial migration - create users, user_settings, and chat_history tables

Revision ID: 001
Revises: 
Create Date: 2026-01-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('line_user_id', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('line_user_id')
    )
    op.create_index(op.f('ix_users_line_user_id'), 'users', ['line_user_id'], unique=False)
    
    # Create user_settings table
    op.create_table(
        'user_settings',
        sa.Column('line_user_id', sa.String(length=100), nullable=False),
        sa.Column('llm_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['line_user_id'], ['users.line_user_id'], ),
        sa.PrimaryKeyConstraint('line_user_id')
    )
    
    # Create chat_history table
    op.create_table(
        'chat_history',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('line_user_id', sa.String(length=100), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['line_user_id'], ['users.line_user_id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_chat_history_line_user_id'), 'chat_history', ['line_user_id'], unique=False)
    op.create_index(op.f('ix_chat_history_created_at'), 'chat_history', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_chat_history_created_at'), table_name='chat_history')
    op.drop_index(op.f('ix_chat_history_line_user_id'), table_name='chat_history')
    op.drop_table('chat_history')
    op.drop_table('user_settings')
    op.drop_index(op.f('ix_users_line_user_id'), table_name='users')
    op.drop_table('users')

