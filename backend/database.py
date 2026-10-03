import os

import psycopg
from dotenv import load_dotenv

load_dotenv()


def obtener_conexion():
    """
    Devuelve una conexión a PostgreSQL.

    - Producción (Render/Neon): definir DATABASE_URL=postgresql://user:pass@host/db
    - Local: definir DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT en .env
    """
    url = os.getenv("DATABASE_URL")

    if url:
        return psycopg.connect(url)

    return psycopg.connect(
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
    )
