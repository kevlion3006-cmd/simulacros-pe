import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ayudas import (
    COLUMNAS_USUARIO,
    auditar,
    datos_usuario,
    es_admin,
    generar_ref_code,
    obtener_ajustes,
    usuario_actual,
    utcnow,
)
from ayudas import MENSAJE_SIN_ACCESO, tiene_acceso
from auth import crear_hash_password, crear_token, leer_token, verificar_password
from database import obtener_conexion
from rutas_admin import admin_router


# ============================================================
# MIGRACIÓN MÍNIMA (idempotente)
# ============================================================
# esquema.sql solo se aplica sobre una base vacía, así que las columnas
# añadidas después se crean aquí, al arrancar el servicio.
# ADD COLUMN IF NOT EXISTS no altera nada si la columna ya existe, por lo
# que se puede ejecutar en cada inicio sin riesgo (Render y local).
def migracion_minima():
    try:
        conexion = obtener_conexion()
    except Exception as error:          # sin base de datos no bloquea el arranque
        print("Migración omitida:", error)
        return
    try:
        with conexion.cursor() as cursor:
            cursor.execute(
                "ALTER TABLE public.preguntas "
                "ADD COLUMN IF NOT EXISTS universidad varchar(120);"
            )
        conexion.commit()
        print("Migración: preguntas.universidad verificada.")
    except Exception as error:
        conexion.rollback()
        print("Migración omitida:", error)
    finally:
        conexion.close()


@asynccontextmanager
async def arranque(app: FastAPI):
    migracion_minima()
    yield


app = FastAPI(title="API de Simulacros PE", lifespan=arranque)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# CACHÉ DEL NAVEGADOR
# ============================================================
# Sin Cache-Control el navegador aplica "caché heurística" y puede servir
# un JS viejo aunque el archivo ya cambió. Con no-cache siempre revalida
# (y como los archivos tienen ETag, responde 304 sin reenviar el archivo).
@app.middleware("http")
async def cachear_estaticos(peticion, responder):
    respuesta = await responder(peticion)
    ruta = peticion.url.path
    if ruta.endswith((".js", ".css", ".png", ".svg", ".ico", ".webmanifest")) or ruta in ("/", "/index.html", "/sw.js"):
        if "cache-control" not in respuesta.headers:
            respuesta.headers["cache-control"] = "no-cache"
    return respuesta


app.include_router(admin_router)


# ============================================================
# MODELOS
# ============================================================

class Registro(BaseModel):
    nombre: str
    email: str
    password: str
    universidad: Optional[str] = None
    meta_fecha: Optional[str] = None
    ref: Optional[str] = None
    facultad: Optional[str] = None
    escuela: Optional[str] = None


class Login(BaseModel):
    email: str
    password: str


class GoogleLogin(BaseModel):
    credential: str


class CrearIntento(BaseModel):
    examen_id: Optional[int] = None
    modo: str = "simulacro"          # simulacro | practica | libre
    area: Optional[str] = None       # modo práctica
    curso: Optional[str] = None      # modo práctica por curso
    preguntas: Optional[list] = None  # modo libre: ids de preguntas elegidas
    usuario_id: Optional[int] = None  # compatibilidad con el código original


class GuardarRespuesta(BaseModel):
    pregunta_id: int
    alternativa_id: int


class CrearPago(BaseModel):
    plan: str
    operacion: str
    comprobante: Optional[str] = None
    cupon: Optional[str] = None


class ValidarCupon(BaseModel):
    codigo: str


class CrearReporte(BaseModel):
    pregunta_id: int
    motivo: str
    nota: Optional[str] = None


class Evento(BaseModel):
    accion: str
    detalle: Optional[str] = None


class Perfil(BaseModel):
    nombre: Optional[str] = None
    universidad: Optional[str] = None
    meta_uni: Optional[str] = None
    meta_fecha: Optional[str] = None
    facultad: Optional[str] = None
    escuela: Optional[str] = None
    tema: Optional[str] = None
    # Credenciales (opcionales): solo se aplican si el cliente los envía
    email: Optional[str] = None
    password: Optional[str] = None
    password_actual: Optional[str] = None


# ============================================================
# INICIO
# ============================================================

@app.get("/api")
def inicio():
    return {
        "mensaje": "API de Simulacros funcionando correctamente"
    }


# ============================================================
# AUTENTICACIÓN
# ============================================================

@app.post("/auth/registro")
def registrar(datos: Registro):
    email = datos.email.strip().lower()

    if len(datos.password) < 6:
        return {"error": "La contraseña debe tener al menos 6 caracteres"}

    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT 1 FROM usuarios WHERE email = %s;", (email,))
            if cursor.fetchone():
                return {"error": "El correo ya está registrado"}

            referido_por = None
            if datos.ref:
                cursor.execute(
                    "SELECT id FROM usuarios WHERE ref_code = %s;",
                    (datos.ref.strip().upper(),),
                )
                amigo = cursor.fetchone()
                if not amigo:
                    return {"error": "No encontramos ese código de amigo"}
                referido_por = amigo[0]

            ref_code = generar_ref_code(conexion, datos.nombre)

            cursor.execute(
                """
                INSERT INTO usuarios (
                    nombre, email, password_hash, rol,
                    ref_code, referido_por, universidad,
                    meta_fecha, facultad, escuela
                )
                VALUES (%s, %s, %s, 'estudiante', %s, %s, %s, %s, %s, %s)
                RETURNING id, fecha_registro;
                """,
                (
                    datos.nombre.strip(),
                    email,
                    crear_hash_password(datos.password),
                    ref_code,
                    referido_por,
                    datos.universidad,
                    datos.meta_fecha,
                    datos.facultad,
                    datos.escuela,
                ),
            )
            usuario_id, fecha_registro = cursor.fetchone()
            conexion.commit()

            cursor.execute(
                f"SELECT {COLUMNAS_USUARIO} FROM usuarios WHERE id = %s;",
                (usuario_id,),
            )
            usuario = datos_usuario(cursor.fetchone())

        auditar(conexion, email, "Se registró", f"Usuario {usuario['nombre']}")
        conexion.commit()

        return {"token": crear_token(usuario_id), "usuario": usuario}

    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@app.post("/auth/login")
def entrar(datos: Login):
    email = datos.email.strip().lower()
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute(
                f"SELECT {COLUMNAS_USUARIO}, password_hash FROM usuarios WHERE email = %s;",
                (email,),
            )
            fila = cursor.fetchone()

        if not fila:
            return {"error": "El correo no está registrado"}
        if not verificar_password(datos.password, fila[-1]):
            return {"error": "La contraseña es incorrecta"}
        if fila[6] is False:
            return {"error": "La cuenta está desactivada"}

        usuario = datos_usuario(fila[:-1])
        return {"token": crear_token(usuario["id"]), "usuario": usuario}

    finally:
        conexion.close()


# ============================================================
# ACCESO CON GOOGLE (Google Identity Services)
# El frontend pide el Client ID para pintar el boton oficial; el
# servidor valida el ID token con Google antes de dar sesion.
# ============================================================

TOKENINFO_GOOGLE = "https://oauth2.googleapis.com/tokeninfo"

# Client ID de Google. Es un valor publico (viaja en el navegador del usuario;
# lo unico privado es el secreto, que aqui no se usa porque la validacion se
# hace contra las claves publicas de Google). Si algun dia hay que cambiarlo, se
# define GOOGLE_CLIENT_ID en las variables de entorno de Render y gana ese valor.
GOOGLE_CLIENT_ID_POR_DEFECTO = "375674276773-s9802ai5q0hiirr0t0sehob17lh7941t.apps.googleusercontent.com"


def google_client_id() -> str:
    """Client ID de Google: variable de entorno o el configurado en el codigo."""
    return (os.getenv("GOOGLE_CLIENT_ID") or GOOGLE_CLIENT_ID_POR_DEFECTO).strip()


def verificar_credential_google(credential: str, client_id: str) -> dict:
    """Valida el ID token de Google y devuelve los datos verificados."""
    if not credential or len(credential) > 4096:
        raise HTTPException(status_code=400, detail="Credencial de Google inválida.")
    consulta = TOKENINFO_GOOGLE + "?id_token=" + urllib.parse.quote(credential)
    try:
        with urllib.request.urlopen(consulta, timeout=10) as respuesta:
            info = json.loads(respuesta.read().decode("utf-8"))
    except urllib.error.HTTPError:
        raise HTTPException(
            status_code=401,
            detail="No pudimos validar tu sesión con Google. Intenta de nuevo.",
        )
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="No pudimos conectar con Google. Intenta en un momento.",
        )

    if info.get("aud") != client_id:
        raise HTTPException(
            status_code=401,
            detail="Esta sesión de Google no pertenece a esta aplicación.",
        )
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(status_code=401, detail="Sesión de Google no válida.")
    if str(info.get("email_verified", "")).lower() not in ("true", "1"):
        raise HTTPException(
            status_code=401, detail="Tu correo de Google no está verificado."
        )
    expira = info.get("exp")
    if not expira or int(expira) < utcnow().timestamp():
        raise HTTPException(status_code=401, detail="La sesión de Google expiró.")

    email = (info.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=401, detail="Google no nos devolvió un correo válido.")
    return info


@app.get("/auth/google/config")
def config_google():
    """El boton oficial de Google solo aparece si hay Client ID configurado."""
    return {"client_id": google_client_id()}


@app.post("/auth/google")
def entrar_google(datos: GoogleLogin):
    client_id = google_client_id()
    if not client_id:
        return {"error": "El acceso con Google todavía no está configurado."}

    info = verificar_credential_google(datos.credential.strip(), client_id)
    email = info["email"]
    nombre = (info.get("name") or email.split("@")[0]).strip()

    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute(
                f"SELECT {COLUMNAS_USUARIO} FROM usuarios WHERE email = %s;",
                (email,),
            )
            fila = cursor.fetchone()
            nuevo = fila is None

            if nuevo:
                ref_code = generar_ref_code(conexion, nombre)
                cursor.execute(
                    """
                    INSERT INTO usuarios (nombre, email, password_hash, rol, ref_code)
                    VALUES (%s, %s, %s, 'estudiante', %s)
                    RETURNING id;
                    """,
                    (
                        nombre,
                        email,
                        # password_hash es NOT NULL: se guarda el hash de una clave
                        # aleatoria, asi esa cuenta solo se puede abrir con Google.
                        crear_hash_password(secrets.token_urlsafe(32)),
                        ref_code,
                    ),
                )
                usuario_id = cursor.fetchone()[0]
                conexion.commit()
                cursor.execute(
                    f"SELECT {COLUMNAS_USUARIO} FROM usuarios WHERE id = %s;",
                    (usuario_id,),
                )
                fila = cursor.fetchone()
            elif fila[6] is False:
                return {"error": "La cuenta está desactivada"}

        if nuevo:
            auditar(conexion, email, "Se registró con Google", f"Usuario {nombre}")
            conexion.commit()

        usuario = datos_usuario(fila)
        # Sin plan: el usuario nuevo tiene que elegir y pagar su plan, igual
        # que registrandose con correo y contrasena.
        return {"token": crear_token(usuario["id"]), "usuario": usuario, "nuevo": nuevo}
    finally:
        conexion.close()


@app.get("/auth/me")
def mi_perfil(usuario: dict = Depends(usuario_actual)):
    return {"usuario": usuario}


@app.patch("/auth/me")
def actualizar_perfil(datos: Perfil, usuario: dict = Depends(usuario_actual)):
    """Actualiza el perfil propio (meta del examen, facultad, etc.)."""
    cambios, valores = [], []
    columnas = (
        "nombre", "universidad", "meta_uni",
        "meta_fecha", "facultad", "escuela", "tema",
    )
    for campo in columnas:
        if campo in datos.model_fields_set:
            valor = getattr(datos, campo)
            if campo == "meta_fecha":
                valor = valor or None  # cadena vacía = sin fecha
            if campo == "nombre":
                if not valor or len(valor.strip()) < 3:
                    return {"error": "El nombre debe tener al menos 3 caracteres"}
                valor = valor.strip()
            cambios.append(f"{campo} = %s")
            valores.append(valor)

    # ---- Correo nuevo (opcional): formato y unicidad ----
    if "email" in datos.model_fields_set and datos.email:
        nuevo = datos.email.strip().lower()
        if len(nuevo) < 5 or "@" not in nuevo or "." not in nuevo.rsplit("@", 1)[-1]:
            return {"error": "Ese correo no es válido"}
        if nuevo != (usuario.get("email") or "").lower():
            conn2 = obtener_conexion()
            try:
                with conn2.cursor() as cursor:
                    cursor.execute(
                        "SELECT 1 FROM usuarios WHERE email = %s AND id <> %s;",
                        (nuevo, usuario["id"]),
                    )
                    if cursor.fetchone():
                        return {"error": "Ese correo ya está registrado en otra cuenta"}
            finally:
                conn2.close()
            cambios.append("email = %s")
            valores.append(nuevo)

    # ---- Contraseña nueva (opcional): exige la actual ----
    if "password" in datos.model_fields_set and datos.password:
        if len(datos.password) < 6:
            return {"error": "La contraseña debe tener al menos 6 caracteres"}
        if not datos.password_actual:
            return {"error": "Escribe tu contraseña actual para confirmar el cambio"}
        conn2 = obtener_conexion()
        try:
            with conn2.cursor() as cursor:
                cursor.execute("SELECT password_hash FROM usuarios WHERE id = %s;", (usuario["id"],))
                fila = cursor.fetchone()
        finally:
            conn2.close()
        if not fila or not verificar_password(datos.password_actual, fila[0]):
            return {"error": "La contraseña actual no coincide"}
        cambios.append("password_hash = %s")
        valores.append(crear_hash_password(datos.password))

    if not cambios:
        return {"error": "No hay cambios para guardar"}

    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            valores.append(usuario["id"])
            cursor.execute(
                f"UPDATE usuarios SET {', '.join(cambios)} WHERE id = %s "
                f"RETURNING {COLUMNAS_USUARIO};",
                tuple(valores),
            )
            actualizado = datos_usuario(cursor.fetchone())
            conexion.commit()
        return {"usuario": actualizado}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


# ============================================================
# UNIVERSIDADES
# ============================================================

@app.get("/universidades")
def obtener_universidades():

    conexion = obtener_conexion()

    try:
        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT
                    id,
                    nombre,
                    codigo,
                    activa,
                    fecha_creacion
                FROM universidades
                ORDER BY id;
            """)

            filas = cursor.fetchall()

            return [
                {
                    "id": fila[0],
                    "nombre": fila[1],
                    "codigo": fila[2],
                    "activa": fila[3],
                    "fecha_creacion": fila[4]
                }
                for fila in filas
            ]

    finally:
        conexion.close()


# ============================================================
# EXÁMENES
# ============================================================

@app.get("/examenes")
def obtener_examenes():

    conexion = obtener_conexion()

    try:
        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT
                    e.id,
                    e.universidad_id,
                    u.nombre AS universidad,
                    u.codigo,
                    e.nombre,
                    e.duracion_segundos,
                    e.tipo,
                    e.cantidad_preguntas,
                    e.activo,
                    e.publicado,
                    e.escala,
                    COALESCE(r.puntos_correcta, 1),
                    COALESCE(r.puntos_incorrecta, 0),
                    (
                        SELECT array_agg(ep.pregunta_id ORDER BY ep.pregunta_id)
                        FROM examen_preguntas ep
                        WHERE ep.examen_id = e.id
                    ),
                    (
                        SELECT array_agg(p.clave ORDER BY ep.pregunta_id)
                        FROM examen_preguntas ep
                        JOIN preguntas p ON p.id = ep.pregunta_id
                        WHERE ep.examen_id = e.id
                    )
                FROM examenes e
                JOIN universidades u
                    ON u.id = e.universidad_id
                LEFT JOIN reglas_calificacion r
                    ON r.examen_id = e.id
                ORDER BY e.id;
            """)

            filas = cursor.fetchall()

            return [
                {
                    "id": fila[0],
                    "universidad_id": fila[1],
                    "universidad": fila[2],
                    "codigo": fila[3],
                    "nombre": fila[4],
                    "duracion_segundos": fila[5],
                    "tipo": fila[6],
                    "cantidad_preguntas": fila[7],
                    "activo": fila[8],
                    "publicado": fila[9],
                    "escala": fila[10],
                    "pc": fila[11],
                    "pw": fila[12],
                    "pool_ids": fila[13] or [],
                    "pool_claves": fila[14] or [],
                }
                for fila in filas
            ]

    finally:
        conexion.close()


# ============================================================
# PREGUNTAS GRATUITAS (prueba gratis) — debe ir antes de
# /preguntas/{examen_id} para que no lo capture como parámetro
# ============================================================

@app.get("/preguntas/gratuitas")
def obtener_preguntas_gratuitas():
    """Preguntas de la prueba gratis (no requiere plan)."""
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                SELECT id, area, curso, tema, dificultad, texto, sustento, clave, imagen, sustento_imagen, universidad
                FROM preguntas
                WHERE gratis = true AND activa = true
                ORDER BY id;
            """)
            filas = cursor.fetchall()
            resultado = []
            for fila in filas:
                cursor.execute(
                    "SELECT id, texto FROM alternativas WHERE pregunta_id = %s ORDER BY orden, id;",
                    (fila[0],),
                )
                alternativas = cursor.fetchall()
                resultado.append({
                    "id": fila[0], "area": fila[1], "curso": fila[2],
                    "tema": fila[3], "dificultad": fila[4], "texto": fila[5],
                    "sustento": fila[6], "clave": fila[7],
                    "imagen": fila[8], "sustento_imagen": fila[9],
                    "universidad": fila[10],
                    "alternativas": [{"id": a[0], "texto": a[1]} for a in alternativas],
                })
            return resultado
    finally:
        conexion.close()


# ============================================================
# PREGUNTAS DE UN EXAMEN
# ============================================================

@app.get("/preguntas/{examen_id}")
def obtener_preguntas(examen_id: int):

    conexion = obtener_conexion()

    try:
        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT
                    p.id,
                    %s AS examen_id,
                    p.area,
                    p.curso,
                    p.tema,
                    p.dificultad,
                    p.texto,
                    p.sustento,
                    p.gratis,
                    p.clave,
                    p.imagen,
                    p.sustento_imagen,
                    p.universidad
                FROM preguntas p
                JOIN examen_preguntas ep
                    ON ep.pregunta_id = p.id
                WHERE ep.examen_id = %s AND p.activa = true
                ORDER BY p.id;
            """, (examen_id, examen_id))

            preguntas = cursor.fetchall()

            resultado = []

            for pregunta in preguntas:

                cursor.execute("""
                    SELECT
                        id,
                        texto,
                        es_correcta
                    FROM alternativas
                    WHERE pregunta_id = %s
                    ORDER BY orden, id;
                """, (pregunta[0],))

                alternativas = cursor.fetchall()
                # índice de la respuesta correcta (para puntuación del cliente)
                correcta = next(
                    (i for i, a in enumerate(alternativas) if a[2]),
                    0,
                )

                resultado.append({
                    "id": pregunta[0],
                    "examen_id": pregunta[1],
                    "area": pregunta[2],
                    "curso": pregunta[3],
                    "tema": pregunta[4],
                    "dificultad": pregunta[5],
                    "texto": pregunta[6],
                    "sustento": pregunta[7],
                    "gratis": pregunta[8],
                    "clave": pregunta[9],
                    "imagen": pregunta[10],
                    "sustento_imagen": pregunta[11],
                    "universidad": pregunta[12],
                    "c": correcta,
                    "alternativas": [
                        {
                            "id": alternativa[0],
                            "texto": alternativa[1]
                        }
                        for alternativa in alternativas
                    ]
                })

            return resultado

    finally:
        conexion.close()


@app.get("/bancos")
def obtener_bancos():
    """Preguntas agrupadas por área (pestaña 'Bancos de preguntas')."""
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                SELECT
                    area,
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE dificultad = 'facil') AS facil,
                    COUNT(*) FILTER (WHERE dificultad = 'intermedio') AS intermedio,
                    COUNT(*) FILTER (WHERE dificultad = 'dificil') AS dificil
                FROM preguntas
                WHERE activa = true
                GROUP BY area
                ORDER BY area;
            """)
            return [
                {
                    "area": fila[0],
                    "total": fila[1],
                    "dificultades": {
                        "facil": fila[2],
                        "intermedio": fila[3],
                        "dificil": fila[4],
                    },
                }
                for fila in cursor.fetchall()
            ]
    finally:
        conexion.close()


@app.get("/mapa-preguntas")
def mapa_preguntas():
    """id numérico <-> clave del frontend para todas las preguntas activas."""
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT id, clave FROM preguntas WHERE activa = true ORDER BY id;")
            return [{"id": f[0], "clave": f[1]} for f in cursor.fetchall()]
    finally:
        conexion.close()


# ============================================================
# CREAR INTENTO
# ============================================================

@app.post("/intentos")
def crear_intento(
    datos: CrearIntento,
    authorization: Optional[str] = Header(None),
):

    # El usuario viene del token; se acepta usuario_id en el cuerpo por
    # compatibilidad con el código original.
    usuario_id = None
    if authorization and authorization.startswith("Bearer "):
        usuario_id = leer_token(authorization[7:])
    if usuario_id is None:
        usuario_id = datos.usuario_id

    if usuario_id is None:
        return {"error": "Tu sesión ya no es válida. Cierra sesión y vuelve a entrar."}

    modo = datos.modo if datos.modo in ("simulacro", "practica", "libre") else "simulacro"

    conexion = obtener_conexion()

    try:
        with conexion.cursor() as cursor:

            cursor.execute(
                f"SELECT {COLUMNAS_USUARIO} FROM usuarios WHERE id = %s;", (usuario_id,)
            )
            fila = cursor.fetchone()
            if not fila:
                return {"error": "El usuario no existe"}

            # Sin plan vigente no se puede practicar. La validación vive aquí y
            # no en la pantalla: si el tiempo venció, da igual que la persona no
            # haya refrescado la página, el servidor ya no le da preguntas.
            if not tiene_acceso(fila):
                return {"error": MENSAJE_SIN_ACCESO, "sin_acceso": True}

            examen_id = datos.examen_id
            fecha = date.today()

            if modo == "practica":
                # Práctica: sorteo libre de preguntas por área o por curso
                if not datos.area and not datos.curso:
                    return {"error": "Indica el área o el curso para practicar"}
                ajustes = obtener_ajustes(conexion)
                cantidad = int(ajustes["limites"].get("practicaQ", 10))
                if datos.area:
                    condicion, parametro = "p.area = %s", datos.area
                else:
                    condicion, parametro = "p.curso = %s", datos.curso
                with conexion.cursor() as cursor2:
                    cursor2.execute(f"""
                        SELECT p.id FROM preguntas p
                        WHERE {condicion} AND p.activa = true
                        ORDER BY random()
                        LIMIT %s;
                    """, (parametro, cantidad))
                    preguntas = cursor2.fetchall()
                if not preguntas:
                    return {"error": "No hay preguntas disponibles en esa área o curso"}

            elif modo == "libre":
                # Ejercitador / examen rápido: el cliente elige las preguntas
                if not datos.preguntas:
                    return {"error": "Indica las preguntas del intento"}
                pedidas = [int(x) for x in datos.preguntas][:200]
                cursor.execute(
                    "SELECT id FROM preguntas WHERE id = ANY(%s) AND activa = true;",
                    (pedidas,),
                )
                validas = {f[0] for f in cursor.fetchall()}
                elegidas = [i for i in pedidas if i in validas]
                if not elegidas:
                    return {"error": "Ninguna de las preguntas seleccionadas está disponible"}
                preguntas = [(i,) for i in elegidas]

            else:
                # Simulacro: sorteo diario determinista del pool del examen
                if examen_id is None:
                    return {"error": "Indica el examen a rendir"}

                cursor.execute("""
                    SELECT id, activo, publicado
                    FROM examenes
                    WHERE id = %s;
                """, (examen_id,))

                examen = cursor.fetchone()

                if not examen:
                    return {"error": "El examen no existe"}
                if not examen[1]:
                    return {"error": "El examen no está activo"}
                if not examen[2]:
                    return {"error": "El examen no está publicado"}

                cursor.execute("""
                    SELECT ep.pregunta_id
                    FROM examen_preguntas ep
                    JOIN preguntas p ON p.id = ep.pregunta_id AND p.activa = true
                    WHERE ep.examen_id = %s
                    ORDER BY md5(ep.pregunta_id::text || %s)
                    LIMIT COALESCE(
                        (SELECT cantidad_preguntas FROM examenes WHERE id = %s),
                        100000
                    );
                """, (examen_id, str(fecha), examen_id))

                preguntas = cursor.fetchall()

                if not preguntas:
                    return {"error": "El examen no tiene preguntas en su banco"}

            cursor.execute("""
                INSERT INTO intentos (usuario_id, examen_id, modo, fecha_sorteo)
                VALUES (%s, %s, %s, %s)
                RETURNING id, fecha_inicio;
            """, (usuario_id, examen_id, modo, fecha))

            intento = cursor.fetchone()
            intento_id = intento[0]

            for orden, pregunta in enumerate(preguntas, start=1):

                cursor.execute("""
                    INSERT INTO intento_preguntas (intento_id, pregunta_id, orden)
                    VALUES (%s, %s, %s);
                """, (intento_id, pregunta[0], orden))

            conexion.commit()

            return {
                "mensaje": "Intento creado correctamente",
                "intento_id": intento_id,
                "usuario_id": usuario_id,
                "examen_id": examen_id,
                "modo": modo,
                "fecha_inicio": intento[1],
                "cantidad_preguntas": len(preguntas)
            }

    except Exception:
        conexion.rollback()
        raise

    finally:
        conexion.close()


# ============================================================
# PREGUNTAS DEL INTENTO
# ============================================================

@app.get("/intentos/{intento_id}/preguntas")
def obtener_preguntas_intento(intento_id: int):

    conexion = obtener_conexion()

    try:
        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT
                    id,
                    usuario_id,
                    examen_id,
                    fecha_fin
                FROM intentos
                WHERE id = %s;
            """, (intento_id,))

            intento = cursor.fetchone()

            if not intento:
                return {
                    "error": "El intento no existe"
                }

            if intento[3] is not None:
                return {
                    "error": "El intento ya finalizó",
                    "mensaje": "Las preguntas del intento activo ya no están disponibles."
                }

            cursor.execute("""
                SELECT
                    ip.orden,
                    p.id,
                    p.area,
                    p.curso,
                    p.tema,
                    p.dificultad,
                    p.texto,
                    p.sustento
                FROM intento_preguntas ip
                JOIN preguntas p
                    ON p.id = ip.pregunta_id
                WHERE ip.intento_id = %s
                ORDER BY ip.orden;
            """, (intento_id,))

            preguntas = cursor.fetchall()

            resultado = []

            for pregunta in preguntas:

                cursor.execute("""
                    SELECT
                        id,
                        texto
                    FROM alternativas
                    WHERE pregunta_id = %s
                    ORDER BY orden, id;
                """, (pregunta[1],))

                alternativas = cursor.fetchall()

                resultado.append({
                    "orden": pregunta[0],
                    "pregunta_id": pregunta[1],
                    "area": pregunta[2],
                    "curso": pregunta[3],
                    "tema": pregunta[4],
                    "dificultad": pregunta[5],
                    "texto": pregunta[6],
                    "sustento": pregunta[7],
                    "alternativas": [
                        {
                            "id": alternativa[0],
                            "texto": alternativa[1]
                        }
                        for alternativa in alternativas
                    ]
                })

            return {
                "intento_id": intento_id,
                "preguntas": resultado
            }

    finally:
        conexion.close()


# ============================================================
# GUARDAR RESPUESTA
# ============================================================

@app.post("/intentos/{intento_id}/respuestas")
def guardar_respuesta(
    intento_id: int,
    datos: GuardarRespuesta
):

    pregunta_id = datos.pregunta_id
    alternativa_id = datos.alternativa_id

    conexion = obtener_conexion()

    try:
        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT
                    id,
                    fecha_fin
                FROM intentos
                WHERE id = %s;
            """, (intento_id,))

            intento = cursor.fetchone()

            if not intento:
                return {
                    "error": "El intento no existe"
                }

            if intento[1] is not None:
                return {
                    "error": "El intento ya finalizó"
                }

            cursor.execute("""
                SELECT id
                FROM intento_preguntas
                WHERE intento_id = %s
                AND pregunta_id = %s;
            """, (
                intento_id,
                pregunta_id
            ))

            pregunta_asignada = cursor.fetchone()

            if not pregunta_asignada:
                return {
                    "error": "La pregunta no pertenece a este intento"
                }

            cursor.execute("""
                SELECT id
                FROM alternativas
                WHERE id = %s
                AND pregunta_id = %s;
            """, (
                alternativa_id,
                pregunta_id
            ))

            alternativa = cursor.fetchone()

            if not alternativa:
                return {
                    "error": "La alternativa no pertenece a esta pregunta"
                }

            cursor.execute("""
                INSERT INTO respuestas (intento_id, pregunta_id, alternativa_id)
                VALUES (%s, %s, %s)
                ON CONFLICT (intento_id, pregunta_id)
                DO UPDATE SET alternativa_id = EXCLUDED.alternativa_id;
            """, (
                intento_id,
                pregunta_id,
                alternativa_id
            ))

            conexion.commit()

            return {
                "mensaje": "Respuesta guardada correctamente",
                "intento_id": intento_id,
                "pregunta_id": pregunta_id,
                "alternativa_id": alternativa_id
            }

    except Exception:
        conexion.rollback()
        raise

    finally:
        conexion.close()


# ============================================================
# FINALIZAR INTENTO
# ============================================================

@app.post("/intentos/{intento_id}/finalizar")
def finalizar_intento(intento_id: int):

    conexion = obtener_conexion()

    try:
        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT
                    usuario_id,
                    examen_id,
                    fecha_fin
                FROM intentos
                WHERE id = %s;
            """, (intento_id,))

            intento = cursor.fetchone()

            if not intento:
                return {
                    "error": "El intento no existe"
                }

            if intento[2] is not None:
                return {
                    "error": "El intento ya fue finalizado"
                }

            examen_id = intento[1]

            puntos_correcta, puntos_incorrecta, puntos_blanco = 1, 0, 0

            if examen_id is not None:
                cursor.execute("""
                    SELECT
                        puntos_correcta,
                        puntos_incorrecta,
                        puntos_blanco
                    FROM reglas_calificacion
                    WHERE examen_id = %s;
                """, (examen_id,))

                regla = cursor.fetchone()

                if not regla:
                    return {
                        "error": "El examen no tiene una regla de calificación configurada"
                    }

                puntos_correcta = regla[0]
                puntos_incorrecta = regla[1]
                puntos_blanco = regla[2]

            cursor.execute("""
                SELECT
                    COUNT(*) FILTER (
                        WHERE a.id IS NOT NULL
                        AND a.es_correcta = TRUE
                    ) AS correctas,

                    COUNT(*) FILTER (
                        WHERE a.id IS NOT NULL
                        AND a.es_correcta = FALSE
                    ) AS incorrectas,

                    COUNT(*) FILTER (
                        WHERE a.id IS NULL
                    ) AS en_blanco

                FROM intento_preguntas ip

                LEFT JOIN respuestas r
                    ON r.intento_id = ip.intento_id
                    AND r.pregunta_id = ip.pregunta_id

                LEFT JOIN alternativas a
                    ON a.id = r.alternativa_id

                WHERE ip.intento_id = %s;
            """, (intento_id,))

            resultados = cursor.fetchone()

            correctas = resultados[0] or 0
            incorrectas = resultados[1] or 0
            en_blanco = resultados[2] or 0

            puntaje = (
                correctas * puntos_correcta
                + incorrectas * puntos_incorrecta
                + en_blanco * puntos_blanco
            )

            cursor.execute("""
                UPDATE intentos
                SET
                    fecha_fin = CURRENT_TIMESTAMP,
                    puntaje = %s,
                    correctas = %s,
                    incorrectas = %s,
                    en_blanco = %s
                WHERE id = %s;
            """, (
                puntaje,
                correctas,
                incorrectas,
                en_blanco,
                intento_id
            ))

            # Estadísticas por pregunta (aciertos y veces rendida)
            cursor.execute("""
                INSERT INTO qstats (pregunta_id, n, ok)
                SELECT
                    ip.pregunta_id,
                    1,
                    CASE WHEN a.es_correcta THEN 1 ELSE 0 END
                FROM intento_preguntas ip
                LEFT JOIN respuestas r
                    ON r.intento_id = ip.intento_id
                    AND r.pregunta_id = ip.pregunta_id
                LEFT JOIN alternativas a
                    ON a.id = r.alternativa_id
                WHERE ip.intento_id = %s
                ON CONFLICT (pregunta_id)
                DO UPDATE SET
                    n = qstats.n + 1,
                    ok = qstats.ok + EXCLUDED.ok;
            """, (intento_id,))

            conexion.commit()

            return {
                "mensaje": "Intento finalizado correctamente",
                "resultado": {
                    "intento_id": intento_id,
                    "correctas": correctas,
                    "incorrectas": incorrectas,
                    "en_blanco": en_blanco,
                    "puntaje": puntaje
                }
            }

    except Exception:
        conexion.rollback()
        raise

    finally:
        conexion.close()


# ============================================================
# RESULTADO DEL INTENTO
# ============================================================

@app.get("/intentos/{intento_id}/resultado")
def obtener_resultado(intento_id: int):

    conexion = obtener_conexion()

    try:
        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT
                    i.id,
                    i.usuario_id,
                    i.examen_id,
                    e.nombre AS examen,
                    u.nombre AS universidad,
                    i.fecha_inicio,
                    i.fecha_fin,
                    i.puntaje,
                    i.correctas,
                    i.incorrectas,
                    i.en_blanco
                FROM intentos i
                JOIN examenes e
                    ON e.id = i.examen_id
                JOIN universidades u
                    ON u.id = e.universidad_id
                WHERE i.id = %s;
            """, (intento_id,))

            resultado = cursor.fetchone()

            if not resultado:
                return {
                    "error": "El intento no existe"
                }

            return {
                "intento_id": resultado[0],
                "usuario_id": resultado[1],
                "examen_id": resultado[2],
                "examen": resultado[3],
                "universidad": resultado[4],
                "fecha_inicio": resultado[5],
                "fecha_fin": resultado[6],
                "puntaje": resultado[7],
                "correctas": resultado[8],
                "incorrectas": resultado[9],
                "en_blanco": resultado[10]
            }

    finally:
        conexion.close()


# ============================================================
# DETALLE DEL INTENTO
# ============================================================

@app.get("/intentos/{intento_id}/detalle")
def obtener_detalle_intento(intento_id: int):

    conexion = obtener_conexion()

    try:
        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT
                    id,
                    fecha_fin
                FROM intentos
                WHERE id = %s;
            """, (intento_id,))

            intento = cursor.fetchone()

            if not intento:
                return {
                    "error": "El intento no existe"
                }

            if intento[1] is None:
                return {
                    "error": "El intento todavía está activo"
                }

            cursor.execute("""
                SELECT
                    ip.orden,
                    p.id,
                    p.area,
                    p.curso,
                    p.tema,
                    p.dificultad,
                    p.texto,
                    p.sustento
                FROM intento_preguntas ip
                JOIN preguntas p
                    ON p.id = ip.pregunta_id
                WHERE ip.intento_id = %s
                ORDER BY ip.orden;
            """, (intento_id,))

            preguntas = cursor.fetchall()

            resultado = []

            for pregunta in preguntas:

                pregunta_id = pregunta[1]

                cursor.execute("""
                    SELECT
                        id,
                        texto,
                        es_correcta
                    FROM alternativas
                    WHERE pregunta_id = %s
                    ORDER BY orden, id;
                """, (pregunta_id,))

                alternativas = cursor.fetchall()

                cursor.execute("""
                    SELECT alternativa_id
                    FROM respuestas
                    WHERE intento_id = %s
                    AND pregunta_id = %s;
                """, (
                    intento_id,
                    pregunta_id
                ))

                respuesta = cursor.fetchone()

                alternativa_elegida_id = (
                    respuesta[0]
                    if respuesta
                    else None
                )

                alternativa_elegida = None
                alternativa_correcta = None

                for alternativa in alternativas:

                    if alternativa[0] == alternativa_elegida_id:
                        alternativa_elegida = {
                            "id": alternativa[0],
                            "texto": alternativa[1]
                        }

                    if alternativa[2] is True:
                        alternativa_correcta = {
                            "id": alternativa[0],
                            "texto": alternativa[1]
                        }

                if alternativa_elegida_id is None:

                    estado = "en_blanco"

                elif alternativa_correcta and (
                    alternativa_elegida_id == alternativa_correcta["id"]
                ):

                    estado = "correcta"

                else:

                    estado = "incorrecta"

                resultado.append({
                    "orden": pregunta[0],
                    "pregunta_id": pregunta[1],
                    "area": pregunta[2],
                    "curso": pregunta[3],
                    "tema": pregunta[4],
                    "dificultad": pregunta[5],
                    "texto": pregunta[6],
                    "sustento": pregunta[7],
                    "alternativa_elegida": alternativa_elegida,
                    "alternativa_correcta": alternativa_correcta,
                    "estado": estado
                })

            return {
                "intento_id": intento_id,
                "preguntas": resultado
            }

    finally:
        conexion.close()


# ============================================================
# ANÁLISIS POR ÁREAS
# ============================================================

@app.get("/intentos/{intento_id}/analisis/areas")
def analizar_por_areas(intento_id: int):

    conexion = obtener_conexion()

    try:
        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT fecha_fin
                FROM intentos
                WHERE id = %s;
            """, (intento_id,))

            intento = cursor.fetchone()

            if not intento:
                return {
                    "error": "El intento no existe"
                }

            if intento[0] is None:
                return {
                    "error": "El intento todavía está activo"
                }

            cursor.execute("""
                SELECT
                    p.area,

                    COUNT(*) FILTER (
                        WHERE a.es_correcta = TRUE
                    ) AS correctas,

                    COUNT(*) FILTER (
                        WHERE a.id IS NOT NULL
                        AND a.es_correcta = FALSE
                    ) AS incorrectas,

                    COUNT(*) FILTER (
                        WHERE a.id IS NULL
                    ) AS en_blanco

                FROM intento_preguntas ip

                JOIN preguntas p
                    ON p.id = ip.pregunta_id

                LEFT JOIN respuestas r
                    ON r.intento_id = ip.intento_id
                    AND r.pregunta_id = ip.pregunta_id

                LEFT JOIN alternativas a
                    ON a.id = r.alternativa_id

                WHERE ip.intento_id = %s

                GROUP BY p.area

                ORDER BY p.area;
            """, (intento_id,))

            filas = cursor.fetchall()

            analisis = []

            for fila in filas:

                correctas = fila[1] or 0
                incorrectas = fila[2] or 0
                en_blanco = fila[3] or 0

                respondidas = correctas + incorrectas

                if respondidas > 0:
                    porcentaje = round(
                        (correctas / respondidas) * 100,
                        2
                    )
                else:
                    porcentaje = 0

                analisis.append({
                    "area": fila[0],
                    "correctas": correctas,
                    "incorrectas": incorrectas,
                    "en_blanco": en_blanco,
                    "porcentaje": porcentaje
                })

            return {
                "intento_id": intento_id,
                "analisis_por_area": analisis
            }

    finally:
        conexion.close()


# ============================================================
# ANÁLISIS POR CURSOS
# ============================================================

@app.get("/intentos/{intento_id}/analisis/cursos")
def analizar_por_cursos(intento_id: int):

    conexion = obtener_conexion()

    try:
        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT fecha_fin
                FROM intentos
                WHERE id = %s;
            """, (intento_id,))

            intento = cursor.fetchone()

            if not intento:
                return {
                    "error": "El intento no existe"
                }

            if intento[0] is None:
                return {
                    "error": "El intento todavía está activo"
                }

            cursor.execute("""
                SELECT
                    p.area,
                    p.curso,

                    COUNT(*) FILTER (
                        WHERE a.es_correcta = TRUE
                    ) AS correctas,

                    COUNT(*) FILTER (
                        WHERE a.id IS NOT NULL
                        AND a.es_correcta = FALSE
                    ) AS incorrectas,

                    COUNT(*) FILTER (
                        WHERE a.id IS NULL
                    ) AS en_blanco

                FROM intento_preguntas ip

                JOIN preguntas p
                    ON p.id = ip.pregunta_id

                LEFT JOIN respuestas r
                    ON r.intento_id = ip.intento_id
                    AND r.pregunta_id = ip.pregunta_id

                LEFT JOIN alternativas a
                    ON a.id = r.alternativa_id

                WHERE ip.intento_id = %s

                GROUP BY p.area, p.curso

                ORDER BY p.area, p.curso;
            """, (intento_id,))

            filas = cursor.fetchall()

            analisis = []

            for fila in filas:

                correctas = fila[2] or 0
                incorrectas = fila[3] or 0
                en_blanco = fila[4] or 0

                respondidas = correctas + incorrectas

                porcentaje = (
                    round((correctas / respondidas) * 100, 2)
                    if respondidas > 0
                    else 0
                )

                analisis.append({
                    "area": fila[0],
                    "curso": fila[1],
                    "correctas": correctas,
                    "incorrectas": incorrectas,
                    "en_blanco": en_blanco,
                    "porcentaje": porcentaje
                })

            return {
                "intento_id": intento_id,
                "analisis_por_curso": analisis
            }

    finally:
        conexion.close()


# ============================================================
# ANÁLISIS POR TEMAS
# ============================================================

@app.get("/intentos/{intento_id}/analisis/temas")
def analizar_por_temas(intento_id: int):

    conexion = obtener_conexion()

    try:
        with conexion.cursor() as cursor:

            cursor.execute("""
                SELECT fecha_fin
                FROM intentos
                WHERE id = %s;
            """, (intento_id,))

            intento = cursor.fetchone()

            if not intento:
                return {
                    "error": "El intento no existe"
                }

            if intento[0] is None:
                return {
                    "error": "El intento todavía está activo"
                }

            cursor.execute("""
                SELECT
                    p.area,
                    p.curso,
                    p.tema,

                    COUNT(*) FILTER (
                        WHERE a.es_correcta = TRUE
                    ) AS correctas,

                    COUNT(*) FILTER (
                        WHERE a.id IS NOT NULL
                        AND a.es_correcta = FALSE
                    ) AS incorrectas,

                    COUNT(*) FILTER (
                        WHERE a.id IS NULL
                    ) AS en_blanco

                FROM intento_preguntas ip

                JOIN preguntas p
                    ON p.id = ip.pregunta_id

                LEFT JOIN respuestas r
                    ON r.intento_id = ip.intento_id
                    AND r.pregunta_id = ip.pregunta_id

                LEFT JOIN alternativas a
                    ON a.id = r.alternativa_id

                WHERE ip.intento_id = %s

                GROUP BY
                    p.area,
                    p.curso,
                    p.tema

                ORDER BY
                    p.area,
                    p.curso,
                    p.tema;
            """, (intento_id,))

            filas = cursor.fetchall()

            analisis = []

            for fila in filas:

                correctas = fila[3] or 0
                incorrectas = fila[4] or 0
                en_blanco = fila[5] or 0

                respondidas = correctas + incorrectas

                porcentaje = (
                    round((correctas / respondidas) * 100, 2)
                    if respondidas > 0
                    else 0
                )

                analisis.append({
                    "area": fila[0],
                    "curso": fila[1],
                    "tema": fila[2],
                    "correctas": correctas,
                    "incorrectas": incorrectas,
                    "en_blanco": en_blanco,
                    "porcentaje": porcentaje
                })

            return {
                "intento_id": intento_id,
                "analisis_por_tema": analisis
            }

    finally:
        conexion.close()


# ============================================================
# RESULTADOS DEL USUARIO (historial)
# ============================================================

@app.get("/usuarios/yo/referidos")
def mis_referidos(usuario: dict = Depends(usuario_actual)):
    """Amigos invitados por el usuario (para la sección de referidos)."""
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                SELECT nombre, plan, plan_hasta, fecha_registro
                FROM usuarios
                WHERE referido_por = %s
                ORDER BY fecha_registro DESC;
            """, (usuario["id"],))
            return [
                {
                    "nombre": f[0],
                    "plan": f[1],
                    "plan_hasta": f[2],
                    "fecha": f[3],
                }
                for f in cursor.fetchall()
            ]
    finally:
        conexion.close()


@app.get("/usuarios/{usuario_id}/resultados")
def resultados_usuario(
    usuario_id: int,
    authorization: Optional[str] = Header(None),
):
    if not es_admin(authorization):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Token no proporcionado")
        if leer_token(authorization[7:]) != usuario_id:
            raise HTTPException(status_code=403, detail="Solo tus propios resultados")

    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                SELECT
                    i.id,
                    COALESCE(e.nombre, 'Práctica ' || COALESCE(
                        (SELECT MIN(p.area) FROM intento_preguntas ip
                         JOIN preguntas p ON p.id = ip.pregunta_id
                         WHERE ip.intento_id = i.id), '')) AS examen,
                    u.codigo,
                    i.fecha_inicio,
                    i.correctas,
                    i.incorrectas,
                    i.en_blanco,
                    i.modo,
                    i.segundos_usados,
                    (SELECT COUNT(*) FROM intento_preguntas ip
                     WHERE ip.intento_id = i.id) AS total
                FROM intentos i
                LEFT JOIN examenes e ON e.id = i.examen_id
                LEFT JOIN universidades u ON u.id = e.universidad_id
                WHERE i.usuario_id = %s AND i.fecha_fin IS NOT NULL
                ORDER BY i.fecha_inicio DESC;
            """, (usuario_id,))

            filas = cursor.fetchall()

            # Desglose por área / dificultad / curso / tema de cada intento
            cursor.execute("""
                SELECT
                    ip.intento_id,
                    p.area,
                    p.dificultad,
                    p.curso,
                    p.tema,
                    CASE
                        WHEN a.es_correcta THEN 'ok'
                        WHEN a.id IS NULL THEN 'blank'
                        ELSE 'bad'
                    END AS estado
                FROM intento_preguntas ip
                JOIN intentos i ON i.id = ip.intento_id
                JOIN preguntas p ON p.id = ip.pregunta_id
                LEFT JOIN respuestas r
                    ON r.intento_id = ip.intento_id
                    AND r.pregunta_id = ip.pregunta_id
                LEFT JOIN alternativas a ON a.id = r.alternativa_id
                WHERE i.usuario_id = %s AND i.fecha_fin IS NOT NULL;
            """, (usuario_id,))

            desglose = {}
            for iid, area, dif, curso, tema, estado in cursor.fetchall():
                d = desglose.setdefault(
                    iid, {"areas": {}, "difs": {}, "cursos": {}, "temas": {}}
                )
                for destino, clave in (
                    ("areas", area),
                    ("difs", dif),
                    ("cursos", curso),
                    ("temas", tema),
                ):
                    celda = d[destino].setdefault(
                        clave, {"ok": 0, "bad": 0, "blank": 0, "total": 0}
                    )
                    celda["total"] += 1
                    if estado == "ok":
                        celda["ok"] += 1
                    elif estado == "blank":
                        celda["blank"] += 1
                    else:
                        celda["bad"] += 1

            vacio = {"areas": {}, "difs": {}, "cursos": {}, "temas": {}}
            resultado = []
            for fila in filas:
                item = {
                    "id": fila[0],
                    "examen": fila[1],
                    "universidad": fila[2],
                    "fecha": fila[3],
                    "correctas": fila[4],
                    "incorrectas": fila[5],
                    "en_blanco": fila[6],
                    "practice": fila[7] == "practica",
                    "segundos": fila[8],
                    "total": fila[9],
                    "pct": round(fila[4] / fila[9] * 100) if fila[9] else 0,
                }
                item.update(desglose.get(fila[0], vacio))
                resultado.append(item)
            return resultado
    finally:
        conexion.close()


@app.get("/usuarios/{usuario_id}/meta")
def meta_semanal(
    usuario_id: int,
    authorization: Optional[str] = Header(None),
):
    """Progreso de la meta semanal (simulacros rendidos en los últimos 7 días)."""
    if not es_admin(authorization):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Token no proporcionado")
        if leer_token(authorization[7:]) != usuario_id:
            raise HTTPException(status_code=403, detail="Solo tu propia meta")

    conexion = obtener_conexion()
    try:
        ajustes = obtener_ajustes(conexion)
        meta = int(ajustes["limites"].get("metaSemana", 5))
        with conexion.cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*)
                FROM intentos
                WHERE usuario_id = %s
                  AND modo = 'simulacro'
                  AND fecha_fin IS NOT NULL
                  AND fecha_inicio >= CURRENT_TIMESTAMP - INTERVAL '7 days';
            """, (usuario_id,))
            hechos = cursor.fetchone()[0]
        return {"meta": meta, "hechos": hechos}
    finally:
        conexion.close()


# ============================================================
# PAGOS (estudiante) Y CUPONES
# ============================================================

@app.post("/pagos")
def crear_pago(datos: CrearPago, usuario: dict = Depends(usuario_actual)):
    if datos.plan not in ("dia", "semana", "mes"):
        return {"error": "Plan no válido"}
    if len(datos.operacion.strip()) < 4:
        return {"error": "Ingresa el número de operación de Yape"}

    conexion = obtener_conexion()
    try:
        ajustes = obtener_ajustes(conexion)
        plan = next((p for p in ajustes["planes"] if p["id"] == datos.plan), None)
        if not plan:
            return {"error": "Plan no válido"}

        monto = plan["price"]

        if datos.cupon:
            with conexion.cursor() as cursor:
                cursor.execute(
                    "SELECT porcentaje, activo, vence, max_usos, usados FROM cupones WHERE codigo = %s;",
                    (datos.cupon.strip().upper(),),
                )
                cupon = cursor.fetchone()
            if not cupon or not cupon[1]:
                return {"error": "El cupón no existe o ya no está activo"}
            if cupon[2] and cupon[2] < date.today():
                return {"error": "El cupón ya venció"}
            if cupon[3] and cupon[4] >= cupon[3]:
                return {"error": "El cupón alcanzó el límite de usos"}
            monto = round(monto * (100 - cupon[0]) / 100, 2)

        with conexion.cursor() as cursor:
            cursor.execute("""
                INSERT INTO pagos (usuario_id, plan, monto, operacion, comprobante, cupon)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, fecha;
            """, (
                usuario["id"],
                datos.plan,
                monto,
                datos.operacion.strip(),
                datos.comprobante,
                datos.cupon.strip().upper() if datos.cupon else None,
            ))
            pago_id, fecha = cursor.fetchone()
            conexion.commit()

        return {
            "mensaje": "Pago registrado. Lo revisaremos en breve.",
            "pago": {"id": pago_id, "plan": datos.plan, "monto": monto, "fecha": fecha},
        }
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@app.get("/pagos/mios")
def mis_pagos(usuario: dict = Depends(usuario_actual)):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                SELECT id, plan, monto, operacion, estado, motivo, fecha, revisado_at
                FROM pagos
                WHERE usuario_id = %s
                ORDER BY fecha DESC;
            """, (usuario["id"],))
            return [
                {
                    "id": f[0], "plan": f[1], "monto": f[2], "operacion": f[3],
                    "estado": f[4], "motivo": f[5], "fecha": f[6], "revisado_at": f[7],
                }
                for f in cursor.fetchall()
            ]
    finally:
        conexion.close()


@app.post("/cupones/validar")
def validar_cupon(datos: ValidarCupon):
    codigo = datos.codigo.strip().upper()
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT porcentaje, activo, vence, max_usos, usados FROM cupones WHERE codigo = %s;",
                (codigo,),
            )
            cupon = cursor.fetchone()
        if not cupon:
            return {"error": "El cupón no existe"}
        if not cupon[1]:
            return {"error": "El cupón ya no está activo"}
        if cupon[2] and cupon[2] < date.today():
            return {"error": "El cupón venció"}
        if cupon[3] and cupon[4] >= cupon[3]:
            return {"error": "El cupón alcanzó su límite de usos"}
        return {"codigo": codigo, "porcentaje": cupon[0]}
    finally:
        conexion.close()


# ============================================================
# AJUSTES PÚBLICOS, REPORTES Y EVENTOS
# ============================================================

@app.get("/ajustes")
def leer_ajustes():
    conexion = obtener_conexion()
    try:
        return obtener_ajustes(conexion)
    finally:
        conexion.close()


@app.post("/reportes")
def crear_reporte(datos: CrearReporte, usuario: dict = Depends(usuario_actual)):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT 1 FROM preguntas WHERE id = %s;", (datos.pregunta_id,))
            if not cursor.fetchone():
                return {"error": "La pregunta no existe"}
            cursor.execute("""
                INSERT INTO reportes (pregunta_id, usuario_id, motivo, nota)
                VALUES (%s, %s, %s, %s);
            """, (datos.pregunta_id, usuario["id"], datos.motivo, datos.nota))
            conexion.commit()
        return {"mensaje": "Gracias, recibimos tu reporte"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@app.post("/eventos")
def registrar_evento(datos: Evento, authorization: Optional[str] = Header(None)):
    usuario_id = None
    if authorization and authorization.startswith("Bearer "):
        usuario_id = leer_token(authorization[7:])

    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute(
                "INSERT INTO eventos (usuario_id, accion, detalle) VALUES (%s, %s, %s);",
                (usuario_id, datos.accion, datos.detalle),
            )
            conexion.commit()
        return {"mensaje": "Evento registrado"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


# ============================================================
# ARCHIVOS DEL FRONTEND (estáticos)
# ============================================================

FRONT = Path(__file__).resolve().parent.parent

for carpeta in ("js", "icons", "mascotas"):
    app.mount(f"/{carpeta}", StaticFiles(directory=FRONT / carpeta), name=carpeta)


@app.get("/styles.css")
def servir_styles():
    return FileResponse(FRONT / "styles.css")


@app.get("/sw.js")
def servir_sw():
    return FileResponse(FRONT / "sw.js")


@app.get("/manifest.webmanifest")
def servir_manifest():
    return FileResponse(FRONT / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/{ruta:path}")
def servir_spa(ruta: str):
    """Sirve los archivos del frontend; ante una ruta desconocida devuelve index.html."""
    if ruta:
        destino = (FRONT / ruta).resolve()
        if destino.is_file() and destino.is_relative_to(FRONT):
            return FileResponse(destino)
    return FileResponse(FRONT / "index.html")
