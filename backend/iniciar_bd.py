"""
Inicializa una base de datos vacía (Neon, Render o local) en un solo comando:

    python iniciar_bd.py

Pasos:
  1. Aplica esquema.sql  (las 20 tablas; se omite si el esquema ya existe).
  2. Ejecuta seed.py --confirmar (catálogo base + preguntas + usuarios demo).

Usa DATABASE_URL si está definida; en caso contrario las variables DB_* del .env.
"""
import sys
from pathlib import Path

from database import obtener_conexion
import seed

AQUI = Path(__file__).resolve().parent


def esquema_ya_existe(conexion) -> bool:
    with conexion.cursor() as cursor:
        cursor.execute("SELECT to_regclass('public.usuarios') IS NOT NULL;")
        return cursor.fetchone()[0]


def aplicar_esquema():
    conexion = obtener_conexion()
    try:
        if esquema_ya_existe(conexion):
            print("Esquema: ya existe, se omite esquema.sql.")
            return
        sql = (AQUI / "esquema.sql").read_text(encoding="utf-8-sig")
        # pg_dump añade meta-comandos \restrict/\unrestrict que solo
        # entiende psql; al ejecutar con psycopg se eliminan.
        lineas = [
            linea for linea in sql.splitlines()
            if not linea.startswith("\\")
        ]
        with conexion.cursor() as cursor:
            cursor.execute("\n".join(lineas))
        conexion.commit()
        print("Esquema: aplicado (20 tablas).")
    finally:
        conexion.close()


def main():
    aplicar_esquema()
    sys.argv = [sys.argv[0], "--confirmar"]
    seed.main()
    print("Listo. Base de datos lista para producción.")


if __name__ == "__main__":
    main()
