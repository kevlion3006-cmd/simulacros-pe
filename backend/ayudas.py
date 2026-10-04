"""
Ayudantes compartidos por main.py y rutas_admin.py.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import Header, HTTPException

from database import obtener_conexion


COLUMNAS_USUARIO = """
    id, nombre, email, rol, plan, plan_hasta, activo,
    ref_code, referido_por, meta_uni, meta_fecha, tema,
    universidad, facultad, escuela, telefono, fecha_registro
"""


def utcnow() -> datetime:
    """Ahora mismo en UTC, sin zona horaria.

    Todo el backend trabaja en UTC. Con datetime.now() (hora local del
    servidor) las fechas se guardaban corridas y, al marcarlas con 'Z',
    el navegador las leia con horas de menos.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso_utc(valor):
    """Devuelve el timestamp en ISO-8601 con Z (UTC).

    El servidor guarda y envia las fechas sin zona horaria. Si se mandan
    asi, el navegador las lee como HORA LOCAL de cada dispositivo y un
    celular en Lima (UTC-5) ve 5 horas mas que un PC en UTC: por eso un
    plan de 1 dia aparecia como "2 dias" y uno de 7 como "8 dias".
    Al marcar la Z, todos los relojes muestran exactamente lo mismo.
    """
    if valor is None:
        return None
    if isinstance(valor, datetime):
        aware = valor if valor.tzinfo else valor.replace(tzinfo=timezone.utc)
        return aware.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(valor)


def datos_usuario(fila) -> dict:
    """Convierte una fila de usuarios en la respuesta pública (sin password)."""
    ahora = datetime.now()
    if fila[5] and fila[4]:
        estado = "active" if fila[5] > ahora else "expired"
    else:
        estado = "none"
    return {
        "id": fila[0],
        "nombre": fila[1],
        "email": fila[2],
        "rol": fila[3],
        "plan": fila[4],
        "plan_hasta": iso_utc(fila[5]),
        "estado": estado,
        "activo": fila[6],
        "ref_code": fila[7],
        "referido_por": fila[8],
        "meta_uni": fila[9],
        "meta_fecha": fila[10],
        "tema": fila[11],
        "universidad": fila[12],
        "facultad": fila[13],
        "escuela": fila[14],
        "telefono": fila[15],
        "fecha_registro": iso_utc(fila[16]),
    }


def cargar_usuario(usuario_id: int) -> Optional[dict]:
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute(
                f"SELECT {COLUMNAS_USUARIO} FROM usuarios WHERE id = %s AND activo = true;",
                (usuario_id,),
            )
            fila = cursor.fetchone()
            return datos_usuario(fila) if fila else None
    finally:
        conexion.close()


def usuario_actual(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token no proporcionado")
    usuario_id = leer_token_seguro(authorization[7:])
    if usuario_id is None:
        raise HTTPException(status_code=401, detail="Token inválido o vencido")
    usuario = cargar_usuario(usuario_id)
    if not usuario:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return usuario


def admin_actual(authorization: Optional[str] = Header(None)) -> dict:
    usuario = usuario_actual(authorization)
    if usuario["rol"] != "admin":
        raise HTTPException(status_code=403, detail="Se requiere rol de administrador")
    return usuario


def es_admin(authorization: Optional[str]) -> bool:
    """Comprueba el rol sin lanzar error (para endpoints opcionales)."""
    if not authorization or not authorization.startswith("Bearer "):
        return False
    usuario_id = leer_token_seguro(authorization[7:])
    if usuario_id is None:
        return False
    usuario = cargar_usuario(usuario_id)
    return bool(usuario and usuario["rol"] == "admin")


def leer_token_seguro(token: str):
    from auth import leer_token
    return leer_token(token)


def auditar(conexion, quien: str, accion: str, detalle: str):
    with conexion.cursor() as cursor:
        cursor.execute(
            "INSERT INTO auditoria (quien, accion, detalle) VALUES (%s, %s, %s);",
            (quien, accion, detalle),
        )


def obtener_ajustes(conexion) -> dict:
    """Devuelve los ajustes del sitio fusionados con los valores por defecto."""
    limites = {
        "minPerQ": 2, "maxQ": 50,
        "showCountArea": True, "showCountCurso": True,
        "showCountTema": True, "showCountDif": True,
        "showQuestionSlider": True, "eta": "",
        "maxPerDay": 10, "referralDays": 1,
        "metaSemana": 5, "practicaQ": 10,
        "scoreMax": 20,
    }
    planes = [
        {"id": "dia", "name": "Día", "price": 1, "unit": "/día", "ms": 864e5,
         "text": "Acceso por 24 horas", "per": "S/ 1.00 por día", "save": ""},
        {"id": "semana", "name": "Semana", "price": 5, "unit": "/sem", "ms": 7 * 864e5,
         "text": "Acceso por 7 días", "per": "S/ 0.71 por día",
         "save": "Ahorras 30 % frente al plan Día", "best": True},
        {"id": "mes", "name": "Mes", "price": 15, "unit": "/mes", "ms": 30 * 864e5,
         "text": "Acceso por 30 días", "per": "S/ 0.50 por día",
         "save": "Ahorras 50 % frente al plan Día"},
    ]
    yape = {"number": "999 999 999", "name": "Simulacros PE", "qr": ""}
    resultado = {"limites": limites, "planes": planes, "yape": yape}

    with conexion.cursor() as cursor:
        cursor.execute("SELECT clave, valor FROM ajustes;")
        for clave, valor in cursor.fetchall():
            if clave in resultado and isinstance(valor, dict):
                resultado[clave].update(valor)
            elif clave in ("planes",) and isinstance(valor, list):
                resultado[clave] = valor
            else:
                resultado[clave] = valor
    return resultado


def generar_ref_code(conexion, nombre: str) -> str:
    import random
    import re

    base = re.sub(r"[^A-Z]", "", nombre.upper())[:6] or "USU"
    for _ in range(10000):
        codigo = f"{base}-{random.randint(1000, 9999)}"
        with conexion.cursor() as cursor:
            cursor.execute("SELECT 1 FROM usuarios WHERE ref_code = %s;", (codigo,))
            if not cursor.fetchone():
                return codigo
    return base
