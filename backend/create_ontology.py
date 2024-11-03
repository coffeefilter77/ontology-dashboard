"""
Business data is fictional and for demonstration purposes only.
"""

import sqlite3
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

DATABASE_URL = "database.db"

@contextmanager
def get_db():
    conn = sqlite3.connect(DATABASE_URL, check_same_thread=False)
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    with get_db() as conn:
        cur = conn.cursor()
        
        # Enabling foreign key constraint enforcement
        conn.execute("PRAGMA foreign_keys = ON;")

        # Create tables
        cur.execute('''
            CREATE TABLE IF NOT EXISTS organization (
            name TEXT PRIMARY KEY,
            comment TEXT
            );
        ''')

        cur.execute('''
            CREATE TABLE IF NOT EXISTS historical_name (
            name TEXT PRIMARY KEY,
            comment TEXT,
            FOREIGN KEY (name) REFERENCES organization(name) ON DELETE CASCADE
            );
        ''')

        cur.execute('''
            CREATE TABLE IF NOT EXISTS external_organization (
            name TEXT PRIMARY KEY,
            organization_name TEXT,
            comment TEXT,
            FOREIGN KEY (name) REFERENCES organization(name) ON DELETE CASCADE
            );
        ''')

        cur.execute('''
            CREATE TABLE IF NOT EXISTS service_provider (
            name TEXT PRIMARY KEY,
            organization_name TEXT,
            country TEXT, 
            comment TEXT,
            valid_from TEXT,
            valid_until TEXT,
            is_wholesale BOOLEAN,
            FOREIGN KEY (organization_name) REFERENCES organization(name) ON DELETE CASCADE
            );
        ''')

        cur.execute('''
            CREATE TABLE IF NOT EXISTS service_consumer (
            name TEXT PRIMARY KEY,
            organization_name TEXT,
            valid_from TEXT,
            valid_until TEXT,
            comment TEXT,
            country TEXT,
            is_retail BOOLEAN,
            FOREIGN KEY (organization_name) REFERENCES organization(name) ON DELETE CASCADE
            );
        ''')

        conn.commit()
        logger.info("Database tables created successfully")

if __name__ == "__main__":
    init_db() # i think this is already done in main.py - consider removing?
