"""
SQLite database for Plant Disease Detection, farmer accounts and AI chat history.

Authentication foundation:
- Adds a users table.
- Adds nullable user_id ownership columns to existing detections and conversations.
- Keeps existing records intact (legacy rows retain user_id = NULL).
- Does not store plaintext passwords; authentication code must store password hashes.
"""

import os
import sqlite3
from datetime import datetime
from pathlib import Path

DATABASE_DIR = Path(__file__).resolve().parent
# Render persistent disk can set DATABASE_PATH=/var/data/detection_history.db.
# Local development continues to use database/detection_history.db.
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(DATABASE_DIR / "detection_history.db"))).expanduser()
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def get_connection():
    """Create a SQLite connection with row access and foreign keys enabled."""
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _table_columns(connection, table_name):
    """Return existing column names for a table."""
    return {
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    }


def initialize_database():
    """Create tables and apply additive, non-destructive schema migrations."""
    with get_connection() as connection:
        # Farmer accounts. At least one login identifier is required.
        connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT COLLATE NOCASE UNIQUE,
                mobile TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                village TEXT,
                district TEXT,
                state TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                CHECK (email IS NOT NULL OR mobile IS NOT NULL)
            )
        """)

        # Existing detection table — keep its original columns unchanged.
        connection.execute("""
            CREATE TABLE IF NOT EXISTS detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                crop TEXT NOT NULL,
                disease TEXT NOT NULL,
                confidence REAL NOT NULL
            )
        """)

        # Existing conversation table — keep its original columns unchanged.
        connection.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crop TEXT NOT NULL,
                disease TEXT NOT NULL,
                confidence REAL NOT NULL,
                language TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (conversation_id)
                    REFERENCES conversations(id)
                    ON DELETE CASCADE
            )
        """)

        # Add ownership columns only if missing. Existing records are preserved
        # and remain unassigned until an explicit migration/claiming decision.
        detection_columns = _table_columns(connection, "detections")
        if "user_id" not in detection_columns:
            connection.execute("""
                ALTER TABLE detections
                ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            """)

        conversation_columns = _table_columns(connection, "conversations")
        if "user_id" not in conversation_columns:
            connection.execute("""
                ALTER TABLE conversations
                ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_chat_conversation
            ON chat_messages(conversation_id)
        """)
        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_detections_user_timestamp
            ON detections(user_id, timestamp)
        """)
        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
            ON conversations(user_id, updated_at)
        """)
        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_users_email
            ON users(email)
        """)
        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_users_mobile
            ON users(mobile)
        """)

        connection.commit()


# ---------------------------------------------------------------------------
# Farmer account functions (database layer only; API validation comes later)
# --------------------------------------------------------------------------------------

def create_user(
    name,
    password_hash,
    email=None,
    mobile=None,
    village=None,
    district=None,
    state=None,
):
    """Create a farmer account. Caller must pass a securely generated hash."""
    name = (name or "").strip()
    email = (email or "").strip().lower() or None
    mobile = (mobile or "").strip() or None

    if not name:
        raise ValueError("Name is required.")
    if not password_hash:
        raise ValueError("Password hash is required.")
    if not email and not mobile:
        raise ValueError("Provide an email address or mobile number.")

    timestamp = _now()
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO users
                (name, email, mobile, password_hash, village, district, state,
                 created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                name, email, mobile, password_hash,
                (village or "").strip() or None,
                (district or "").strip() or None,
                (state or "").strip() or None,
                timestamp, timestamp,
            ),
        )
        return cursor.lastrowid


def get_user_by_id(user_id):
    """Get a user record by ID. Do not return this raw record from public APIs."""
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None


def get_user_by_email(email):
    """Find a user by case-insensitive email."""
    email = (email or "").strip().lower()
    if not email:
        return None
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        return dict(row) if row else None


def get_user_by_mobile(mobile):
    """Find a user by mobile number."""
    mobile = (mobile or "").strip()
    if not mobile:
        return None
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM users WHERE mobile = ?",
            (mobile,),
        ).fetchone()
        return dict(row) if row else None


def update_user_profile(user_id, name, village=None, district=None, state=None):
    """Update farmer profile fields without changing login credentials."""
    name = (name or "").strip()
    if not name:
        raise ValueError("Name is required.")
    with get_connection() as connection:
        cursor = connection.execute(
            """
            UPDATE users
            SET name = ?, village = ?, district = ?, state = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                name,
                (village or "").strip() or None,
                (district or "").strip() or None,
                (state or "").strip() or None,
                _now(),
                user_id,
            ),
        )
        return cursor.rowcount > 0


def update_user_password_hash(user_id, password_hash):
    """Update a user's password hash; plaintext passwords must never be stored."""
    if not password_hash:
        raise ValueError("Password hash is required.")
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (password_hash, _now(), user_id),
        )
        return cursor.rowcount > 0


def set_user_active(user_id, is_active):
    """Enable or disable a user account."""
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?",
            (1 if is_active else 0, _now(), user_id),
        )
        return cursor.rowcount > 0


# ---------------------------------------------------------------------------
# Detection history functions
# ---------------------------------------------------------------------------

def save_detection(crop, disease, confidence, user_id=None):
    """Save a detection; user_id is optional for backward compatibility."""
    timestamp = _now()
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO detections (timestamp, crop, disease, confidence, user_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            (timestamp, crop, disease, confidence, user_id),
        )
        return cursor.lastrowid


def get_recent_detections(limit=20, user_id=None):
    """Return recent detections; when user_id is supplied, scope to that user."""
    with get_connection() as connection:
        if user_id is None:
            records = connection.execute(
                """
                SELECT timestamp, crop, disease, confidence
                FROM detections ORDER BY id DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        else:
            records = connection.execute(
                """
                SELECT timestamp, crop, disease, confidence
                FROM detections WHERE user_id = ?
                ORDER BY id DESC LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        return [tuple(record) for record in records]


def clear_history(user_id=None):
    """Clear detections globally (legacy admin use) or for one user."""
    with get_connection() as connection:
        if user_id is None:
            connection.execute("DELETE FROM detections")
        else:
            connection.execute("DELETE FROM detections WHERE user_id = ?", (user_id,))


# ---------------------------------------------------------------------------
# AI conversation functions
# ---------------------------------------------------------------------------

def create_conversation(crop, disease, confidence, language="English", user_id=None):
    """Create a conversation, optionally owned by a farmer account."""
    timestamp = _now()
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO conversations
                (crop, disease, confidence, language, created_at, updated_at, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (crop, disease, confidence, language, timestamp, timestamp, user_id),
        )
        return cursor.lastrowid


def save_chat_message(conversation_id, role, message):
    """Save a user or AI message and update the conversation timestamp."""
    timestamp = _now()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO chat_messages (conversation_id, role, message, timestamp)
            VALUES (?, ?, ?, ?)
            """,
            (conversation_id, role, message, timestamp),
        )
        connection.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (timestamp, conversation_id),
        )


def get_chat_messages(conversation_id):
    """Retrieve all messages from one conversation."""
    with get_connection() as connection:
        records = connection.execute(
            """
            SELECT role, message, timestamp
            FROM chat_messages
            WHERE conversation_id = ?
            ORDER BY id ASC
            """,
            (conversation_id,),
        ).fetchall()
        return [dict(record) for record in records]


def get_conversations(limit=50, user_id=None):
    """Retrieve conversations, optionally scoped to one farmer."""
    with get_connection() as connection:
        if user_id is None:
            records = connection.execute(
                """
                SELECT id, crop, disease, confidence, language, created_at, updated_at
                FROM conversations
                ORDER BY updated_at DESC, id DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        else:
            records = connection.execute(
                """
                SELECT id, crop, disease, confidence, language, created_at, updated_at
                FROM conversations
                WHERE user_id = ?
                ORDER BY updated_at DESC, id DESC LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        return [dict(record) for record in records]


def get_conversation(conversation_id, user_id=None):
    """Retrieve one conversation; optionally enforce its owner."""
    with get_connection() as connection:
        if user_id is None:
            row = connection.execute(
                "SELECT * FROM conversations WHERE id = ?",
                (conversation_id,),
            ).fetchone()
        else:
            row = connection.execute(
                "SELECT * FROM conversations WHERE id = ? AND user_id = ?",
                (conversation_id, user_id),
            ).fetchone()
        return dict(row) if row else None


def update_conversation_language(conversation_id, language):
    """Update the selected conversation language."""
    with get_connection() as connection:
        connection.execute(
            "UPDATE conversations SET language = ?, updated_at = ? WHERE id = ?",
            (language, _now(), conversation_id),
        )


def delete_conversation(conversation_id, user_id=None):
    """Delete one conversation; optionally enforce its owner."""
    with get_connection() as connection:
        if user_id is None:
            connection.execute(
                "DELETE FROM conversations WHERE id = ?",
                (conversation_id,),
            )
        else:
            connection.execute(
                "DELETE FROM conversations WHERE id = ? AND user_id = ?",
                (conversation_id, user_id),
            )


def clear_conversation_history(user_id=None):
    """Delete all conversations, or only those belonging to one farmer."""
    with get_connection() as connection:
        if user_id is None:
            connection.execute("DELETE FROM chat_messages")
            connection.execute("DELETE FROM conversations")
        else:
            connection.execute(
                """
                DELETE FROM chat_messages
                WHERE conversation_id IN (
                    SELECT id FROM conversations WHERE user_id = ?
                )
                """,
                (user_id,),
            )
            connection.execute(
                "DELETE FROM conversations WHERE user_id = ?",
                (user_id,),
            )


# Initialize database when module is loaded.
initialize_database()
