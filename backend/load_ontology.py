"""
Business data is fictional and for demonstration purposes only.
"""

import csv
import os
from create_ontology import get_db

# Get the directory of the current script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def load_csv(file_name):
    file_path = os.path.join(SCRIPT_DIR, 'input', 'direct_import', f'{file_name}')
    with open(file_path, 'r') as file:
        return list(csv.DictReader(file))

def load_ontology_data(enforce_foreign_keys=False):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Set foreign key enforcement based on parameter
        cursor.execute(f"PRAGMA foreign_keys = {'ON' if enforce_foreign_keys else 'OFF'}")
        print(f"Foreign key enforcement set to: {'ON' if enforce_foreign_keys else 'OFF'}")

        # Load organizations
        for row in load_csv('table.csv'):
            cursor.execute("""
                INSERT OR IGNORE INTO organization (name, comment)
                VALUES (?, ?)
            """, (row['name'], row['comment']))
        print("organization populated successfully")

        # Load Historical Names
        for row in load_csv('table.csv'):
            cursor.execute("""
                INSERT OR IGNORE INTO organization (name, comment)
                VALUES (?, ?)
            """, (row['name'], row['comment']))
            cursor.execute("""
                INSERT OR IGNORE INTO historical_name (name, comment)
                VALUES (?, ?)
            """, (row['name'], row['comment']))
        print("historical_name populated successfully")

        # Load External Organizations
        for row in load_csv('table.csv'):
            cursor.execute("""
                INSERT OR IGNORE INTO organization (name, comment)
                VALUES (?, ?)
            """, (row['organization_name'], row['comment']))
            cursor.execute("""
                INSERT OR IGNORE INTO external_organization (name, organization_name, comment)
                VALUES (?, ?, ?)
            """, (row['name'], row['organization_name'], row['comment']))
        print("external_organization populated successfully")

        # Load Service Consumers
        for row in load_csv('table.csv'):
            cursor.execute("""
                INSERT OR IGNORE INTO organization (name, comment)
                VALUES (?, ?)
            """, (row['organization_name'], row['comment']))
            cursor.execute("""
                INSERT OR IGNORE INTO service_consumer (name, organization_name, comment, is_retail, valid_from, valid_until, country)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (row['name'], row['organization_name'], row['comment'], row['is_retail'], row['valid_from'], row['valid_until'], row['country']))
        print("service_consumer populated successfully")

        

        conn.commit()
        print("All data loaded successfully. Database commit complete.")


