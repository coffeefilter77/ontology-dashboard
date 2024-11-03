from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
from pydantic import BaseModel
import logging
from contextlib import contextmanager
from create_ontology import get_db, init_db
from load_ontology import load_ontology_data
from ontology_metadata import ONTOLOGY_METADATA
import csv
import os
from openai import OpenAI
import json
import subprocess
import io
import sys
from contextlib import redirect_stdout

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Enable CORS
app.add_middleware(
    # removed
)

# Initialize the database and load ontology data
init_db()
load_ontology_data()

class TableData(BaseModel):
    table_name: str
    data: dict

@app.get("/tables")
def get_tables():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
    return [table[0] for table in tables if table[0] != 'sqlite_sequence']

@app.get("/table/{table_name}")
def get_table_data(table_name: str):
    with get_db() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(f"SELECT * FROM {table_name}")
            columns = [description[0] for description in cursor.description]
            rows = cursor.fetchall()
            return {"columns": columns, "rows": rows}
        except sqlite3.OperationalError:
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

@app.post("/table/{table_name}")
def create_table_entry(table_name: str, data: TableData):
    with get_db() as conn:
        cursor = conn.cursor()
        columns = ', '.join(data.data.keys())
        placeholders = ', '.join(['?' for _ in data.data])
        values = tuple(data.data.values())
        
        try:
            cursor.execute(f"INSERT INTO {table_name} ({columns}) VALUES ({placeholders})", values)
            conn.commit()
            new_id = cursor.lastrowid
            logger.info(f"Created new entry in {table_name} with id {new_id}")
            return {"id": new_id, **data.data}
        except sqlite3.OperationalError as e:
            raise HTTPException(status_code=400, detail=str(e))

@app.get("/")
async def root():
    logger.info("Root endpoint accessed")
    return {"message": "Backend is running"}

@app.get("/ontology-structure")
def get_ontology_structure():
    return {
        "classes": list(ONTOLOGY_METADATA["classes"].keys()),
        "object_properties": list(ONTOLOGY_METADATA["object_properties"].keys()),
        "data_properties": list(ONTOLOGY_METADATA["data_properties"].keys())
    }

@app.get("/entity-metadata/{entity_type}/{entity_name}")
def get_entity_metadata(entity_type: str, entity_name: str):
    if entity_type not in ONTOLOGY_METADATA or entity_name not in ONTOLOGY_METADATA[entity_type]:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_name}' not found in {entity_type}")
    
    metadata = ONTOLOGY_METADATA[entity_type][entity_name]
    
    # Add is_defined_by to the base return dictionary
    result = {
        "is_defined_by": metadata.get("is_defined_by"),
        "description": metadata.get("description")
    }
    
    if entity_type == 'classes':
        result.update({
            "parent": metadata.get("parent"),
            "children": metadata.get("children"),
            "primary_key": metadata.get("primary_key")
        })
    elif entity_type == 'object_properties':
        result.update({
            "related_classes": metadata.get("related_classes")
        })
    elif entity_type == 'data_properties':
        result.update({
            "domain": metadata.get("domain"),
            "range": metadata.get("range")
        })
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    
    return result

@app.post("/add-entry/{entity_type}/{entity_name}")
async def add_entry(entity_type: str, entity_name: str, data: dict):
    if entity_type not in ONTOLOGY_METADATA or entity_name not in ONTOLOGY_METADATA[entity_type]:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_name}' not found in {entity_type}")
    
    entity_metadata = ONTOLOGY_METADATA[entity_type][entity_name]
    csv_file_path = f"input/direct_import/seed_{entity_name}.csv"
    
    # Ensure all required columns are present
    for column in entity_metadata['columns']:
        if column not in data:
            raise HTTPException(status_code=400, detail=f"Missing required column: {column}")
    
    # Write to CSV file
    try:
        with open(csv_file_path, 'a', newline='') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=entity_metadata['columns'])
            if os.stat(csv_file_path).st_size == 0:
                writer.writeheader()
            writer.writerow(data)
    except IOError:
        raise HTTPException(status_code=500, detail="Error writing to CSV file")
    
    # Refresh the table
    load_ontology_data()
    
    return {"message": "Entry added successfully"}

@app.get("/pt_dashboard")
def get_pt_dashboard():
    with get_db() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT * FROM pt_dashboard")
            columns = [description[0] for description in cursor.description]
            rows = cursor.fetchall()
            return [dict(zip(columns, row)) for row in rows]
        except sqlite3.OperationalError:
            raise HTTPException(status_code=404, detail="PT Dashboard data not found")

class Question(BaseModel):
    question: str
    api_key: str

def get_isp_operators():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT name FROM entity")
        operators = [row[0] for row in cursor.fetchall()]
    return operators

def get_network_operators():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT name FROM entity")
        operators = [row[0] for row in cursor.fetchall()]
    return operators

@app.post("/ask")
async def ask_question(question_data: Question):
    try:
        client = OpenAI(api_key=question_data.api_key)
        
        # Get lists of operators and join them with explicit string handling
        isp_list = " ".join(get_isp_operators())
        network_list = " ".join(get_network_operators())
        
        # First stage prompt - SQL query detection and generation
        outer_system_message = f"""You are an AI assistant with detailed knowledge about the Common Telecoms Ontology (CTO). 
        Your task is to determine if the user's question requires querying the database.
        
        If the question requires database access:
        1. Respond with a valid SQL query in the format: "SQL: <your query here>"
        2. The query must be executable against our SQLite database
        3. Only include the SQL query, nothing else
        
        If the question does NOT require database access:
        1. Provide a direct answer using the ontology metadata and operator lists below
        2. Do not include any SQL
        
        Available metadata and data:
        
        {json.dumps(ONTOLOGY_METADATA, indent=2)}
        
        ISP operators:
        {isp_list}
        
        Network Operators:
        {network_list}
        """
        
        # First stage - Get SQL query or direct answer
        outer_response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": outer_system_message},
                {"role": "user", "content": question_data.question}
            ],
            temperature=0.7,
            max_tokens=2000
        )
        
        first_response = outer_response.choices[0].message.content
        response_data = {
            "model": "gpt-4",
            "first_response": first_response,
            "sql_query": None,
            "query_results": None
        }
        
        # Check if response contains SQL query
        if first_response.strip().upper().startswith("SQL:"):
            # Extract and execute SQL query
            sql_query = first_response.strip()[4:].strip()  # Remove "SQL:" prefix
            response_data["sql_query"] = sql_query
            
            try:
                with get_db() as conn:
                    cursor = conn.cursor()
                    cursor.execute(sql_query)
                    columns = [description[0] for description in cursor.description]
                    rows = cursor.fetchall()
                    results = [dict(zip(columns, row)) for row in rows]
                    response_data["query_results"] = results
                
                # Second stage prompt - Format query results
                inner_system_message = f"""You are an AI assistant that formats and explains database query results.
                Format the following query results in a clear, human-readable way.

                The query is related to the Common Telecoms Ontology (CTO).
                Here is some context on the ontology:
                {json.dumps(ONTOLOGY_METADATA, indent=2)}

                Explain what the data shows and its significance to the original question.
                
                Original question: {question_data.question}
                SQL Query used: {sql_query}
                
                Query results:
                {json.dumps(results, indent=2)}
                """
                
                inner_response = client.chat.completions.create(
                    model="gpt-4",
                    messages=[
                        {"role": "system", "content": inner_system_message},
                        {"role": "user", "content": "Please format and explain these results."}
                    ],
                    temperature=0.7,
                    max_tokens=2000
                )
                
                response_data["response"] = inner_response.choices[0].message.content
                return response_data
            
            except sqlite3.Error as e:
                logger.error(f"SQL Error: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        
        else:
            # Return the direct answer from the first stage
            response_data["response"] = first_response
            return response_data
    
    except Exception as e:
        logger.error(f"Error in ask_question: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/test-integrity")
async def test_integrity():
    # Capture stdout
    f = io.StringIO()
    try:
        with redirect_stdout(f):
            # Initialize the database with schema
            init_db()
            print("\nSchema created successfully. Starting data load with foreign keys ON...\n")
            # Load data with foreign key enforcement
            load_ontology_data(enforce_foreign_keys=True)
            
        # Get the captured output
        output = f.getvalue()
        return {"output": output}
    except Exception as e:
        # Get the captured output up to the point of failure
        output = f.getvalue()
        error_message = f"Error during integrity test: {str(e)}"
        return {"output": output + "\n" + error_message}

@app.post("/execute-query")
async def execute_query(query_data: dict):
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(query_data["query"])
            
            if cursor.description:  # If the query returns data
                columns = [description[0] for description in cursor.description]
                rows = cursor.fetchall()
                return {
                    "columns": columns,
                    "rows": rows
                }
            else:  # For INSERT, UPDATE, DELETE queries
                conn.commit()
                return {"message": f"Query executed successfully. Rows affected: {cursor.rowcount}"}
                
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
