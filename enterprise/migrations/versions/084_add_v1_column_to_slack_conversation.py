"""add v1 column to slack conversation table

Revision ID: 084
Revises: 083
Create Date: 2025-12-02 15:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '084'
down_revision: Union[str, None] = '083'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add v1 column
    op.add_column(
        'slack_conversation', sa.Column('v1', sa.Boolean(), nullable=True)
    )


def downgrade() -> None:
    # Drop v1 column
    op.drop_column('slack_conversation', 'v1')