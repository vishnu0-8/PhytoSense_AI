"""
Database layer for PlantAI farmer accounts, detection history and AI chat history.

Production: PostgreSQL when DATABASE_URL is set (for example Neon).
Local development: SQLite when DATABASE_URL is not set.

The public database function signatures are retained so the API/authentication
layers do not need to change for this database-provider switch.
"""

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

DATABASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
USE_POSTGRES = bool(DATABASE_URL)
DATABASE_PATH = None

if not USE_POSTGRES:
    DATABASE_PATH = Path(
        os.getenv("DATABASE_PATH", str(DATABASE_DIR / "detection_history.db"))
    ).expanduser()
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)


class _ConnectionAdapter:
    """Small adapter preserving the existing sqlite-style execute API."""
    def __init__(self, connection, postgres=False):
        self._connection = connection
        self._postgres = postgres

    def execute(self, sql, params=()):
        if self._postgres:
            # Existing SQL uses SQLite qmark placeholders. The queries in this
            # module contain no question marks inside string literals.
            sql = sql.replace("?", "%s")
        return self._connection.execute(sql, params)

    def commit(self):
        self._connection.commit()

    def rollback(self):
        self._connection.rollback()


@contextmanager
def get_connection():
    """Yield a database connection and reliably commit/rollback and close it."""
    if USE_POSTGRES:
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise RuntimeError(
                "DATABASE_URL is set but psycopg is not installed. "
                "Install the psycopg[binary] dependency."
            ) from exc
        raw_connection = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        connection = _ConnectionAdapter(raw_connection, postgres=True)
    else:
        raw_connection = sqlite3.connect(DATABASE_PATH)
        raw_connection.row_factory = sqlite3.Row
        raw_connection.execute("PRAGMA foreign_keys = ON")
        connection = _ConnectionAdapter(raw_connection, postgres=False)

    try:
        yield connection
        raw_connection.commit()
    except Exception:
        raw_connection.rollback()
        raise
    finally:
        raw_connection.close()


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _table_columns(connection, table_name):
    if USE_POSTGRES:
        rows = connection.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = current_schema() AND table_name = ?",
            (table_name,),
        ).fetchall()
        return {row["column_name"] for row in rows}
    return {
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    }


def _inserted_id(cursor):
    if USE_POSTGRES:
        row = cursor.fetchone()
        return row["id"]
    return cursor.lastrowid


def _row_values(row):
    # psycopg dict_row and sqlite3.Row both preserve selected-column order.
    return tuple(row.values()) if isinstance(row, dict) else tuple(row)


def initialize_database():
    """Create tables and apply additive, non-destructive schema migrations."""
    with get_connection() as connection:
        if USE_POSTGRES:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id BIGSERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE,
                    mobile TEXT UNIQUE,
                    password_hash TEXT NOT NULL,
                    village TEXT,
                    district TEXT,
                    state TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    is_active SMALLINT NOT NULL DEFAULT 1,
                    CHECK (email IS NOT NULL OR mobile IS NOT NULL)
                )
            """)
            connection.execute("""
                CREATE TABLE IF NOT EXISTS detections (
                    id BIGSERIAL PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    crop TEXT NOT NULL,
                    disease TEXT NOT NULL,
                    confidence DOUBLE PRECISION NOT NULL,
                    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            connection.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id BIGSERIAL PRIMARY KEY,
                    crop TEXT NOT NULL,
                    disease TEXT NOT NULL,
                    confidence DOUBLE PRECISION NOT NULL,
                    language TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            connection.execute("""
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id BIGSERIAL PRIMARY KEY,
                    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                    role TEXT NOT NULL,
                    message TEXT NOT NULL,
                    timestamp TEXT NOT NULL
                )
            """)
            # Add ownership columns for databases created by an earlier schema.
            connection.execute(
                "ALTER TABLE detections ADD COLUMN IF NOT EXISTS "
                "user_id BIGINT REFERENCES users(id) ON DELETE CASCADE"
            )
            connection.execute(
                "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS "
                "user_id BIGINT REFERENCES users(id) ON DELETE CASCADE"
            )
        else:
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
            connection.execute("""
                CREATE TABLE IF NOT EXISTS detections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    crop TEXT NOT NULL,
                    disease TEXT NOT NULL,
                    confidence REAL NOT NULL
                )
            """)
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
                        REFERENCES conversations(id) ON DELETE CASCADE
                )
            """)
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

        connection.execute("CREATE INDEX IF NOT EXISTS idx_chat_conversation ON chat_messages(conversation_id)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_detections_user_timestamp ON detections(user_id, timestamp)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile)")


# Farmer account functions

def create_user(name, password_hash, email=None, mobile=None, village=None, district=None, state=None):
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
        sql = """
            INSERT INTO users
                (name, email, mobile, password_hash, village, district, state, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        if USE_POSTGRES:
            sql += " RETURNING id"
        cursor = connection.execute(sql, (
            name, email, mobile, password_hash,
            (village or "").strip() or None,
            (district or "").strip() or None,
            (state or "").strip() or None,
            timestamp, timestamp,
        ))
        return _inserted_id(cursor)


def get_user_by_id(user_id):
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None


def get_user_by_email(email):
    email = (email or "").strip().lower()
    if not email:
        return None
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM users WHERE LOWER(email) = ?", (email,)).fetchone()
        return dict(row) if row else None


def get_user_by_mobile(mobile):
    mobile = (mobile or "").strip()
    if not mobile:
        return None
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM users WHERE mobile = ?", (mobile,)).fetchone()
        return dict(row) if row else None


def update_user_profile(user_id, name, village=None, district=None, state=None):
    name = (name or "").strip()
    if not name:
        raise ValueError("Name is required.")
    with get_connection() as connection:
        cursor = connection.execute("""
            UPDATE users SET name = ?, village = ?, district = ?, state = ?, updated_at = ? WHERE id = ?
        """, (name, (village or "").strip() or None, (district or "").strip() or None,
              (state or "").strip() or None, _now(), user_id))
        return cursor.rowcount > 0


def update_user_password_hash(user_id, password_hash):
    if not password_hash:
        raise ValueError("Password hash is required.")
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (password_hash, _now(), user_id),
        )
        return cursor.rowcount > 0


def set_user_active(user_id, is_active):
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?",
            (1 if is_active else 0, _now(), user_id),
        )
        return cursor.rowcount > 0


# Detection history functions

def save_detection(crop, disease, confidence, user_id=None):
    timestamp = _now()
    sql = "INSERT INTO detections (timestamp, crop, disease, confidence, user_id) VALUES (?, ?, ?, ?, ?)"
    if USE_POSTGRES:
        sql += " RETURNING id"
    with get_connection() as connection:
        cursor = connection.execute(sql, (timestamp, crop, disease, confidence, user_id))
        return _inserted_id(cursor)


def get_recent_detections(limit=20, user_id=None):
    with get_connection() as connection:
        if user_id is None:
            records = connection.execute(
                "SELECT timestamp, crop, disease, confidence FROM detections ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        else:
            records = connection.execute(
                "SELECT timestamp, crop, disease, confidence FROM detections WHERE user_id = ? ORDER BY id DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
        return [_row_values(record) for record in records]


def clear_history(user_id=None):
    with get_connection() as connection:
        if user_id is None:
            connection.execute("DELETE FROM detections")
        else:
            connection.execute("DELETE FROM detections WHERE user_id = ?", (user_id,))


# AI conversation functions

def create_conversation(crop, disease, confidence, language="English", user_id=None):
    timestamp = _now()
    sql = """
        INSERT INTO conversations (crop, disease, confidence, language, created_at, updated_at, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    if USE_POSTGRES:
        sql += " RETURNING id"
    with get_connection() as connection:
        cursor = connection.execute(sql, (crop, disease, confidence, language, timestamp, timestamp, user_id))
        return _inserted_id(cursor)


def save_chat_message(conversation_id, role, message):
    timestamp = _now()
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO chat_messages (conversation_id, role, message, timestamp) VALUES (?, ?, ?, ?)",
            (conversation_id, role, message, timestamp),
        )
        connection.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (timestamp, conversation_id))


def get_chat_messages(conversation_id):
    with get_connection() as connection:
        records = connection.execute(
            "SELECT role, message, timestamp FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC",
            (conversation_id,),
        ).fetchall()
        return [dict(record) for record in records]


def get_conversations(limit=50, user_id=None):
    with get_connection() as connection:
        if user_id is None:
            records = connection.execute("""
                SELECT id, crop, disease, confidence, language, created_at, updated_at
                FROM conversations ORDER BY updated_at DESC, id DESC LIMIT ?
            """, (limit,)).fetchall()
        else:
            records = connection.execute("""
                SELECT id, crop, disease, confidence, language, created_at, updated_at
                FROM conversations WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?
            """, (user_id, limit)).fetchall()
        return [dict(record) for record in records]


def get_conversation(conversation_id, user_id=None):
    with get_connection() as connection:
        if user_id is None:
            row = connection.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
        else:
            row = connection.execute(
                "SELECT * FROM conversations WHERE id = ? AND user_id = ?", (conversation_id, user_id)
            ).fetchone()
        return dict(row) if row else None


def update_conversation_language(conversation_id, language):
    with get_connection() as connection:
        connection.execute(
            "UPDATE conversations SET language = ?, updated_at = ? WHERE id = ?",
            (language, _now(), conversation_id),
        )


def delete_conversation(conversation_id, user_id=None):
    with get_connection() as connection:
        if user_id is None:
            connection.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
        else:
            connection.execute(
                "DELETE FROM conversations WHERE id = ? AND user_id = ?", (conversation_id, user_id)
            )


def clear_conversation_history(user_id=None):
    with get_connection() as connection:
        if user_id is None:
            connection.execute("DELETE FROM chat_messages")
            connection.execute("DELETE FROM conversations")
        else:
            connection.execute("""
                DELETE FROM chat_messages
                WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)
            """, (user_id,))
            connection.execute("DELETE FROM conversations WHERE user_id = ?", (user_id,))


# Initialize schema when the database module is imported.
initialize_database()
