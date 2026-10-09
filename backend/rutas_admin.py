"""
Endpoints del panel de administración.
Todos requieren token con rol 'admin' (excepto los que se indica).
"""
from datetime import date, datetime, timedelta
from typing import Optional

import json
import re
import unicodedata

import psycopg
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from ayudas import (
    COLUMNAS_USUARIO,
    admin_actual,
    auditar,
    datos_usuario,
    iso_utc,
    obtener_ajustes,
    utcnow,
)
from database import obtener_conexion
from planes import planes_por_defecto, resolver_plan

admin_router = APIRouter(prefix="/admin", tags=["admin"])


# ============================================================
# MODELOS
# ============================================================

class ModificarUsuario(BaseModel):
    plan: Optional[str] = None            # id de la matriz (mes-completo) | null (limpia)
    plan_hasta: Optional[str] = None      # fecha ISO
    rol: Optional[str] = None
    activo: Optional[bool] = None
    meta_uni: Optional[str] = None
    meta_fecha: Optional[str] = None


class RechazarPago(BaseModel):
    motivo: str


class CrearCupon(BaseModel):
    codigo: str
    porcentaje: int
    activo: bool = True
    vence: Optional[str] = None
    max_usos: Optional[int] = None


class ModificarCupon(BaseModel):
    porcentaje: Optional[int] = None
    activo: Optional[bool] = None
    vence: Optional[str] = None
    max_usos: Optional[int] = None


class GuardarAjustes(BaseModel):
    yape: Optional[dict] = None
    planes: Optional[list] = None
    limites: Optional[dict] = None


class ResponderReporte(BaseModel):
    estado: Optional[str] = None       # open | resolved
    respuesta: Optional[str] = None


class CrearPregunta(BaseModel):
    area: str
    dif: str
    q: str
    o: list
    c: int
    why: Optional[str] = None
    curso: Optional[str] = None
    tema: Optional[str] = None
    gratis: bool = False
    activa: bool = True
    clave: Optional[str] = None
    universidad: Optional[str] = None        # códigos separados por | (ej. 'UNI|UNMSM')
    imagen: Optional[dict] = None          # {url, alt} en dataURL
    sustento_imagen: Optional[dict] = None
    dedupe: bool = False                   # true: no insertar si el enunciado ya existe


class CrearExamen(BaseModel):
    universidad_id: int
    nombre: str
    minutos: int = 60
    cantidad_preguntas: Optional[int] = None
    publicado: bool = True
    escala: int = 20
    pc: float = 1
    pw: float = 0


class GuardarPool(BaseModel):
    pregunta_ids: list
    cantidad: Optional[int] = None


class CrearUniversidad(BaseModel):
    nombre: str
    codigo: str
    activa: bool = True


class CrearCurso(BaseModel):
    area: str
    nombre: str


class ModificarCurso(BaseModel):
    nombre: str
    area: Optional[str] = None


class CrearTema(BaseModel):
    curso: str = ""          # nombre del curso al que pertenece (vacío = el primero)
    nombre: str


class ModificarTema(BaseModel):
    nombre: str
    curso: Optional[str] = None


# ============================================================
# USUARIOS
# ============================================================

@admin_router.get("/usuarios")
def listar_usuarios(
    busca: str = "",
    plan: str = "",
    _: dict = Depends(admin_actual),
):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            consulta = f"""
                SELECT {COLUMNAS_USUARIO},
                    COALESCE(tot.total, 0),
                    COALESCE(tot.hoy, 0)
                FROM usuarios
                LEFT JOIN LATERAL (
                    SELECT
                        COUNT(*)::int AS total,
                        COUNT(*) FILTER (
                            WHERE fecha_fin >= CURRENT_DATE
                        )::int AS hoy
                    FROM intentos i
                    WHERE i.usuario_id = usuarios.id
                      AND i.fecha_fin IS NOT NULL
                      AND i.modo <> 'practica'
                ) tot ON true
                WHERE (nombre ILIKE %s OR email ILIKE %s)
            """
            parametro = f"%{busca}%"
            argumentos = [parametro, parametro]

            if plan:
                if plan == "ninguno":
                    consulta += " AND plan IS NULL"
                else:
                    consulta += " AND plan = %s"
                    argumentos.append(plan)

            consulta += " ORDER BY fecha_registro DESC;"
            cursor.execute(consulta, tuple(argumentos))
            filas = cursor.fetchall()
            # COLUMNAS_USUARIO son 17 campos; los dos últimos son los conteos
            return [
                {
                    **datos_usuario(f),
                    "simulacros": f[17],
                    "hoy": f[18],
                }
                for f in filas
            ]
    finally:
        conexion.close()


@admin_router.patch("/usuarios/{usuario_id}")
def modificar_usuario(
    usuario_id: int,
    datos: ModificarUsuario,
    admin: dict = Depends(admin_actual),
):
    conexion = obtener_conexion()
    try:
        planes_site = obtener_ajustes(conexion)["planes"]
        with conexion.cursor() as cursor:
            cursor.execute(
                f"SELECT {COLUMNAS_USUARIO} FROM usuarios WHERE id = %s;",
                (usuario_id,),
            )
            fila = cursor.fetchone()
            if not fila:
                return {"error": "El usuario no existe"}

            # El acceso de una cuenta de administrador no se toca desde el panel:
            # ni su plan, ni su rol, ni su estado (ni la propia cuenta). Asi
            # nadie se queda sin panel por error.
            es_admin_destino = fila[3] == "admin" or usuario_id == admin["id"]
            if es_admin_destino and any(
                campo in datos.model_fields_set
                for campo in ("plan", "plan_hasta", "rol", "activo")
            ):
                return {
                    "error": "No se puede cambiar el acceso o el rol de una "
                    "cuenta de administrador."
                }

            cambios = []
            valores = []

            if "plan" in datos.model_fields_set:
                # Se valida contra los ajustes del sitio (la matriz 4x3) y se
                # aceptan también los ids antiguos dia/semana/mes.
                def_plan = resolver_plan(planes_site, datos.plan) if datos.plan else None
                nuevo_plan = def_plan["id"] if def_plan else None
                if datos.plan is not None and nuevo_plan is None:
                    return {"error": "Plan no válido"}
                valores.append(nuevo_plan)
                cambios.append("plan = %s")
                # Sin fecha explicita: el servidor suma los dias del plan sobre el
                # acceso vigente (igual que al aprobar un pago). El panel ya no
                # manda la fecha, asi que no hay desfase de zona horaria.
                if nuevo_plan is None:
                    valores.append(None)
                    cambios.append("plan_hasta = %s")
                elif datos.plan_hasta is None:
                    dias_plan = round(def_plan["ms"] / 864e5)
                    base = (
                        fila[5]
                        if (fila[5] and fila[5] > utcnow())
                        else utcnow()
                    )
                    valores.append(base + timedelta(days=dias_plan))
                    cambios.append("plan_hasta = %s")

            if "plan_hasta" in datos.model_fields_set and datos.plan_hasta:
                try:
                    hasta = datetime.fromisoformat(datos.plan_hasta)
                except ValueError:
                    return {"error": "Fecha inválida (usa formato ISO)"}
                valores.append(hasta)
                cambios.append("plan_hasta = %s")

            if datos.rol is not None:
                if datos.rol not in ("estudiante", "admin"):
                    return {"error": "Rol no válido"}
                valores.append(datos.rol)
                cambios.append("rol = %s")

            if datos.activo is not None:
                valores.append(datos.activo)
                cambios.append("activo = %s")

            if datos.meta_uni is not None:
                valores.append(datos.meta_uni)
                cambios.append("meta_uni = %s")

            if datos.meta_fecha is not None:
                valores.append(datos.meta_fecha)
                cambios.append("meta_fecha = %s")

            if not cambios:
                return {"error": "No hay cambios para guardar"}

            valores.append(usuario_id)
            cursor.execute(
                f"UPDATE usuarios SET {', '.join(cambios)} WHERE id = %s RETURNING {COLUMNAS_USUARIO};",
                tuple(valores),
            )
            actualizado = datos_usuario(cursor.fetchone())

            auditar(
                conexion,
                admin["email"],
                "Modificó un usuario",
                f"{actualizado['nombre']} ({actualizado['email']})",
            )
            conexion.commit()

        return {"mensaje": "Usuario actualizado", "usuario": actualizado}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


# ============================================================
# PAGOS
# ============================================================

@admin_router.delete("/usuarios/{usuario_id}")
def eliminar_usuario(usuario_id: int, admin: dict = Depends(admin_actual)):
    """
    Borra una cuenta de estudiante y todo lo que depende de ella:
    sus intentos (con respuestas y preguntas sorteadas), pagos, reportes
    y eventos. Los usuarios que lo tenian como referido quedan sin referente.
    No permite borrar administradores ni la propia cuenta del que opera.
    """
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT nombre, email, rol FROM usuarios WHERE id = %s;",
                (usuario_id,),
            )
            fila = cursor.fetchone()
            if not fila:
                raise HTTPException(status_code=404, detail="Ese usuario no existe")
            if fila[2] == "admin":
                raise HTTPException(
                    status_code=400,
                    detail="No se pueden borrar cuentas de administrador",
                )
            if usuario_id == admin["id"]:
                raise HTTPException(
                    status_code=400, detail="No puedes borrar tu propia cuenta"
                )

            # Primero los hijos de sus intentos: respuestas y preguntas sorteadas
            cursor.execute(
                """
                DELETE FROM respuestas
                WHERE intento_id IN (SELECT id FROM intentos WHERE usuario_id = %s);
                """,
                (usuario_id,),
            )
            cursor.execute(
                """
                DELETE FROM intento_preguntas
                WHERE intento_id IN (SELECT id FROM intentos WHERE usuario_id = %s);
                """,
                (usuario_id,),
            )
            for tabla in ("intentos", "pagos", "reportes", "eventos"):
                cursor.execute(
                    f"DELETE FROM {tabla} WHERE usuario_id = %s;", (usuario_id,)
                )
            cursor.execute(
                "UPDATE usuarios SET referido_por = NULL WHERE referido_por = %s;",
                (usuario_id,),
            )
            cursor.execute("DELETE FROM usuarios WHERE id = %s;", (usuario_id,))
            auditar(
                conexion,
                admin["email"],
                "Eliminó una cuenta",
                f"{fila[1]} ({fila[0]})",
            )

        conexion.commit()
        return {"mensaje": f"Se eliminó la cuenta de {fila[1]}."}

    except HTTPException:
        conexion.rollback()
        raise
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.get("/pagos")
def listar_pagos(
    estado: str = "pending",
    _: dict = Depends(admin_actual),
):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            consulta = """
                SELECT
                    p.id, p.usuario_id, u.nombre, u.email,
                    p.plan, p.monto, p.operacion, p.comprobante,
                    p.cupon, p.estado, p.motivo, p.fecha, p.revisado_at
                FROM pagos p
                JOIN usuarios u ON u.id = p.usuario_id
            """
            argumentos = ()
            if estado not in ("", "all"):
                consulta += " WHERE p.estado = %s"
                argumentos = (estado,)
            consulta += " ORDER BY p.fecha DESC;"

            cursor.execute(consulta, argumentos)

            return [
                {
                    "id": f[0], "usuario_id": f[1], "nombre": f[2], "email": f[3],
                    "plan": f[4], "monto": f[5], "operacion": f[6],
                    "comprobante": f[7], "cupon": f[8], "estado": f[9],
                    "motivo": f[10], "fecha": f[11], "revisado_at": f[12],
                }
                for f in cursor.fetchall()
            ]
    finally:
        conexion.close()


@admin_router.post("/pagos/{pago_id}/aprobar")
def aprobar_pago(pago_id: int, admin: dict = Depends(admin_actual)):
    conexion = obtener_conexion()
    try:
        ajustes = obtener_ajustes(conexion)

        with conexion.cursor() as cursor:
            cursor.execute("""
                SELECT
                    p.id, p.usuario_id, p.plan, p.monto, p.cupon, p.estado,
                    u.nombre, u.referido_por, u.plan_hasta
                FROM pagos p
                JOIN usuarios u ON u.id = p.usuario_id
                WHERE p.id = %s;
            """, (pago_id,))

            pago = cursor.fetchone()

            if not pago:
                return {"error": "El pago no existe"}
            if pago[5] != "pending":
                return {"error": "El pago ya fue revisado"}

            plan = resolver_plan(ajustes["planes"], pago[2])
            if not plan:
                return {"error": "El plan del pago no es válido"}

            dias = round(plan["ms"] / 864e5)

            # Suma los días al plan vigente; si no hay plan, empieza desde hoy
            base = pago[8] if (pago[8] and pago[8] > utcnow()) else utcnow()
            nuevo_hasta = base + timedelta(days=dias)

            cursor.execute("""
                UPDATE usuarios
                SET plan = %s, plan_hasta = %s
                WHERE id = %s;
            """, (plan["id"], nuevo_hasta, pago[1]))

            # Bono de referido: solo con pagos de cualquier plan MENSUAL
            # (periodo mes, sea Básico, Intermedio o Completo)
            if plan.get("periodo") == "mes" and pago[7]:
                cursor.execute(
                    "SELECT plan_hasta FROM usuarios WHERE id = %s;",
                    (pago[7],),
                )
                amigo = cursor.fetchone()
                if amigo:
                    dias_bono = int(ajustes["limites"].get("referralDays", 1))
                    base_amigo = (
                        amigo[0]
                        if (amigo[0] and amigo[0] > utcnow())
                        else utcnow()
                    )
                    cursor.execute(
                        "UPDATE usuarios SET plan_hasta = %s WHERE id = %s;",
                        (base_amigo + timedelta(days=dias_bono), pago[7]),
                    )
                    auditar(
                        conexion,
                        admin["email"],
                        "Bonificó un referido",
                        f"{dias_bono} día(s) por referido mensual",
                    )

            if pago[4]:
                cursor.execute(
                    "UPDATE cupones SET usados = usados + 1 WHERE codigo = %s;",
                    (pago[4],),
                )

            cursor.execute("""
                UPDATE pagos
                SET estado = 'approved', revisado_at = CURRENT_TIMESTAMP
                WHERE id = %s;
            """, (pago_id,))

            auditar(
                conexion,
                admin["email"],
                "Aprobó un pago",
                f"{pago[6]}, plan {plan['name']}, S/ {pago[3]:.2f}",
            )
            conexion.commit()

        return {"mensaje": "Pago aprobado", "plan_hasta": iso_utc(nuevo_hasta)}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.post("/pagos/{pago_id}/rechazar")
def rechazar_pago(
    pago_id: int,
    datos: RechazarPago,
    admin: dict = Depends(admin_actual),
):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                SELECT p.id, p.estado, p.operacion, u.nombre
                FROM pagos p
                JOIN usuarios u ON u.id = p.usuario_id
                WHERE p.id = %s;
            """, (pago_id,))

            pago = cursor.fetchone()

            if not pago:
                return {"error": "El pago no existe"}
            if pago[1] != "pending":
                return {"error": "El pago ya fue revisado"}

            cursor.execute("""
                UPDATE pagos
                SET estado = 'rejected', motivo = %s, revisado_at = CURRENT_TIMESTAMP
                WHERE id = %s;
            """, (datos.motivo, pago_id))

            auditar(
                conexion,
                admin["email"],
                "Rechazó un pago",
                f"{pago[3]}, operación {pago[2]}",
            )
            conexion.commit()

        return {"mensaje": "Pago rechazado"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


# ============================================================
# CUPONES
# ============================================================

@admin_router.get("/cupones")
def listar_cupones(_: dict = Depends(admin_actual)):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                SELECT codigo, porcentaje, activo, vence, max_usos, usados
                FROM cupones
                ORDER BY codigo;
            """)
            return [
                {
                    "codigo": f[0], "porcentaje": f[1], "activo": f[2],
                    "vence": f[3], "max_usos": f[4], "usados": f[5],
                }
                for f in cursor.fetchall()
            ]
    finally:
        conexion.close()


@admin_router.post("/cupones")
def crear_cupon(datos: CrearCupon, admin: dict = Depends(admin_actual)):
    codigo = datos.codigo.strip().upper()
    if not (1 <= datos.porcentaje <= 100):
        return {"error": "El porcentaje debe estar entre 1 y 100"}

    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT 1 FROM cupones WHERE codigo = %s;", (codigo,))
            if cursor.fetchone():
                return {"error": "El cupón ya existe"}
            cursor.execute("""
                INSERT INTO cupones (codigo, porcentaje, activo, vence, max_usos)
                VALUES (%s, %s, %s, %s, %s);
            """, (codigo, datos.porcentaje, datos.activo, datos.vence, datos.max_usos))
            auditar(conexion, admin["email"], "Creó un cupón", f"{codigo} (-{datos.porcentaje}%)")
            conexion.commit()
        return {"mensaje": "Cupón creado"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.put("/cupones/{codigo}")
def modificar_cupon(
    codigo: str,
    datos: ModificarCupon,
    admin: dict = Depends(admin_actual),
):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cambios, valores = [], []
            if datos.porcentaje is not None:
                if not (1 <= datos.porcentaje <= 100):
                    return {"error": "El porcentaje debe estar entre 1 y 100"}
                cambios.append("porcentaje = %s")
                valores.append(datos.porcentaje)
            if datos.activo is not None:
                cambios.append("activo = %s")
                valores.append(datos.activo)
            if "vence" in datos.model_fields_set:
                cambios.append("vence = %s")
                valores.append(datos.vence)
            if datos.max_usos is not None:
                cambios.append("max_usos = %s")
                valores.append(datos.max_usos)
            if not cambios:
                return {"error": "No hay cambios para guardar"}

            valores.append(codigo.upper())
            cursor.execute(
                f"UPDATE cupones SET {', '.join(cambios)} WHERE codigo = %s;",
                tuple(valores),
            )
            if cursor.rowcount == 0:
                return {"error": "El cupón no existe"}
            auditar(conexion, admin["email"], "Modificó un cupón", codigo.upper())
            conexion.commit()
        return {"mensaje": "Cupón actualizado"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.delete("/cupones/{codigo}")
def eliminar_cupon(codigo: str, admin: dict = Depends(admin_actual)):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("DELETE FROM cupones WHERE codigo = %s RETURNING codigo;", (codigo.upper(),))
            if not cursor.fetchone():
                return {"error": "El cupón no existe"}
            auditar(conexion, admin["email"], "Eliminó un cupón", codigo.upper())
            conexion.commit()
        return {"mensaje": "Cupón eliminado"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


# ============================================================
# AJUSTES
# ============================================================

@admin_router.get("/ajustes")
def leer_ajustes_admin(_: dict = Depends(admin_actual)):
    conexion = obtener_conexion()
    try:
        return obtener_ajustes(conexion)
    finally:
        conexion.close()


@admin_router.put("/ajustes")
def guardar_ajustes(
    datos: GuardarAjustes,
    admin: dict = Depends(admin_actual),
):
    conexion = obtener_conexion()
    try:
        pares = []
        if datos.yape is not None:
            pares.append(("yape", datos.yape))
        if datos.planes is not None:
            pares.append(("planes", datos.planes))
        if datos.limites is not None:
            pares.append(("limites", datos.limites))
        if not pares:
            return {"error": "No hay ajustes para guardar"}

        with conexion.cursor() as cursor:
            for clave, valor in pares:
                cursor.execute("""
                    INSERT INTO ajustes (clave, valor)
                    VALUES (%s, %s::jsonb)
                    ON CONFLICT (clave)
                    DO UPDATE SET valor = EXCLUDED.valor;
                """, (clave, __import__("json").dumps(valor)))
            auditar(conexion, admin["email"], "Modificó los ajustes", ", ".join(c[0] for c in pares))
            conexion.commit()
        return {"mensaje": "Ajustes guardados"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


# ============================================================
# REPORTES DE PREGUNTAS
# ============================================================

@admin_router.get("/reportes")
def listar_reportes(_: dict = Depends(admin_actual)):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                SELECT
                    r.id, r.pregunta_id, p.texto,
                    r.usuario_id, u.nombre, u.email,
                    r.motivo, r.nota, r.estado, r.respuesta,
                    r.fecha, r.respondido_at, p.clave
                FROM reportes r
                JOIN preguntas p ON p.id = r.pregunta_id
                LEFT JOIN usuarios u ON u.id = r.usuario_id
                ORDER BY
                    CASE r.estado WHEN 'open' THEN 0 ELSE 1 END,
                    r.fecha DESC;
            """)
            return [
                {
                    "id": f[0], "pregunta_id": f[1], "pregunta": f[2],
                    "usuario_id": f[3], "usuario": f[4], "email": f[5],
                    "motivo": f[6], "nota": f[7], "estado": f[8],
                    "respuesta": f[9], "fecha": f[10], "respondido_at": f[11],
                    "clave": f[12],
                }
                for f in cursor.fetchall()
            ]
    finally:
        conexion.close()


@admin_router.patch("/reportes/{reporte_id}")
def responder_reporte(
    reporte_id: int,
    datos: ResponderReporte,
    admin: dict = Depends(admin_actual),
):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cambios, valores = [], []
            if datos.estado is not None:
                if datos.estado not in ("open", "resolved"):
                    return {"error": "Estado no válido"}
                cambios.append("estado = %s")
                valores.append(datos.estado)
            if datos.respuesta is not None:
                cambios.append("respuesta = %s")
                valores.append(datos.respuesta)
                cambios.append("respondido_at = CURRENT_TIMESTAMP")
            if not cambios:
                return {"error": "No hay cambios para guardar"}

            valores.append(reporte_id)
            cursor.execute(
                f"UPDATE reportes SET {', '.join(cambios)} WHERE id = %s;",
                tuple(valores),
            )
            if cursor.rowcount == 0:
                return {"error": "El reporte no existe"}
            auditar(conexion, admin["email"], "Respondió un reporte", f"Reporte #{reporte_id}")
            conexion.commit()
        return {"mensaje": "Reporte actualizado"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


# ============================================================
# AUDITORÍA Y ESTADÍSTICAS
# ============================================================

@admin_router.get("/auditoria")
def leer_auditoria(_: dict = Depends(admin_actual)):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                SELECT id, fecha, quien, accion, detalle
                FROM auditoria
                ORDER BY fecha DESC
                LIMIT 200;
            """)
            return [
                {"id": f[0], "fecha": f[1], "quien": f[2], "accion": f[3], "detalle": f[4]}
                for f in cursor.fetchall()
            ]
    finally:
        conexion.close()


@admin_router.get("/estadisticas")
def estadisticas(_: dict = Depends(admin_actual)):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                SELECT
                    COUNT(*),
                    COUNT(*) FILTER (WHERE plan IS NOT NULL AND plan_hasta > CURRENT_TIMESTAMP),
                    COUNT(*) FILTER (WHERE plan IS NULL OR plan_hasta <= CURRENT_TIMESTAMP)
                FROM usuarios;
            """)
            usuarios, con_plan, sin_plan = cursor.fetchone()

            cursor.execute("""
                SELECT
                    COUNT(*),
                    COUNT(*) FILTER (WHERE estado = 'pending'),
                    COALESCE(SUM(monto) FILTER (
                        WHERE estado = 'approved'
                        AND fecha >= CURRENT_DATE - INTERVAL '30 days'
                    ), 0),
                    COUNT(*) FILTER (
                        WHERE estado = 'approved'
                        AND fecha >= CURRENT_DATE - INTERVAL '30 days'
                    )
                FROM pagos;
            """)
            pagos_total, pendientes, ingresos_30, aprobados_30 = cursor.fetchone()

            cursor.execute("""
                SELECT plan, COUNT(*)
                FROM pagos
                WHERE estado = 'approved'
                GROUP BY plan
                ORDER BY plan;
            """)
            por_plan = {f[0]: f[1] for f in cursor.fetchall()}

            # Preguntas con más errores (para revisar contenido)
            cursor.execute("""
                SELECT p.id, p.texto, p.dificultad, qs.n, qs.ok
                FROM qstats qs
                JOIN preguntas p ON p.id = qs.pregunta_id
                WHERE qs.n >= 5
                ORDER BY (qs.ok::float / qs.n) ASC
                LIMIT 5;
            """)
            peores = [
                {"id": f[0], "texto": f[1], "dificultad": f[2], "n": f[3], "ok": f[4]}
                for f in cursor.fetchall()
            ]

            # Sospechosas: marcadas difíciles pero casi todos aciertan
            cursor.execute("""
                SELECT p.id, p.texto, p.dificultad, qs.n, qs.ok
                FROM qstats qs
                JOIN preguntas p ON p.id = qs.pregunta_id
                WHERE qs.n >= 10
                  AND p.dificultad = 'dificil'
                  AND (qs.ok::float / qs.n) > 0.75
                LIMIT 5;
            """)
            sospechosas = [
                {"id": f[0], "texto": f[1], "dificultad": f[2], "n": f[3], "ok": f[4]}
                for f in cursor.fetchall()
            ]

            cursor.execute("SELECT COUNT(*) FROM reportes WHERE estado = 'open';")
            reportes_abiertos = cursor.fetchone()[0]

            cursor.execute("""
                SELECT accion, COUNT(*)
                FROM eventos
                WHERE fecha >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                GROUP BY accion
                ORDER BY COUNT(*) DESC;
            """)
            eventos = {f[0]: f[1] for f in cursor.fetchall()}

            return {
                "usuarios": {"total": usuarios, "con_plan": con_plan, "sin_plan": sin_plan},
                "pagos": {
                    "total": pagos_total,
                    "pendientes": pendientes,
                    "aprobados_30d": aprobados_30,
                    "ingresos_30d": float(ingresos_30),
                    "por_plan": por_plan,
                },
                "preguntas": {"peores": peores, "sospechosas": sospechosas},
                "reportes_abiertos": reportes_abiertos,
                "eventos_30d": eventos,
            }
    finally:
        conexion.close()


# ============================================================
# CRUD PREGUNTAS
# ============================================================

@admin_router.get("/preguntas")
def listar_preguntas(_: dict = Depends(admin_actual)):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                SELECT
                    p.id, p.area, p.dificultad, p.texto, p.sustento,
                    p.curso, p.tema, p.gratis, p.activa, p.clave,
                    qs.n, qs.ok, p.imagen, p.sustento_imagen, p.universidad
                FROM preguntas p
                LEFT JOIN qstats qs ON qs.pregunta_id = p.id
                ORDER BY p.id;
            """)
            filas = cursor.fetchall()

            resultado = []
            for fila in filas:
                cursor.execute("""
                    SELECT texto, es_correcta
                    FROM alternativas
                    WHERE pregunta_id = %s
                    ORDER BY orden, id;
                """, (fila[0],))
                alternativas = cursor.fetchall()
                correcta = next(
                    (i for i, a in enumerate(alternativas) if a[1]), None
                )
                resultado.append({
                    "id": fila[0],
                    "area": fila[1],
                    "dif": fila[2],
                    "q": fila[3],
                    "why": fila[4],
                    "curso": fila[5],
                    "tema": fila[6],
                    "gratis": fila[7],
                    "activa": fila[8],
                    "clave": fila[9],
                    "o": [a[0] for a in alternativas],
                    "c": correcta if correcta is not None else -1,
                    "stats": {"n": fila[10] or 0, "ok": fila[11] or 0},
                    "imagen": fila[12],
                    "sustento_imagen": fila[13],
                    "universidad": fila[14],
                })
            return resultado
    finally:
        conexion.close()


def _norm_dedup(texto):
    """Normaliza un enunciado para comparar duplicados. Misma regla que el
    panel (normTexto en js/admin.js): sin acentos, en minúsculas, sin
    puntuación y con los espacios colapsados."""
    s = unicodedata.normalize("NFD", str(texto or ""))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower().strip()
    s = re.sub(r"""[,;:!??¡…”“”'’«»]""", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def _buscar_duplicada(cursor, texto):
    """Id de una pregunta existente cuyo enunciado normalizado coincide."""
    destino = _norm_dedup(texto)
    if not destino:
        return None
    cursor.execute("SELECT id, texto FROM preguntas;")
    for pid, existente in cursor.fetchall():
        if _norm_dedup(existente) == destino:
            return pid
    return None


@admin_router.post("/preguntas")
def crear_pregunta(datos: CrearPregunta, admin: dict = Depends(admin_actual)):
    if datos.dif not in ("facil", "intermedio", "dificil"):
        return {"error": "Dificultad no válida"}
    if len(datos.o) < 2:
        return {"error": "Una pregunta necesita al menos 2 alternativas"}
    if not (0 <= datos.c < len(datos.o)):
        return {"error": "La alternativa correcta no es válida"}

    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            # El importador envía dedupe=true: aunque el navegador traiga la
            # lista vieja, el servidor no vuelve a insertar un enunciado igual.
            if datos.dedupe:
                existente = _buscar_duplicada(cursor, datos.q)
                if existente:
                    return {"duplicada": True, "id": existente}
            cursor.execute("""
                INSERT INTO preguntas (area, texto, sustento, curso, tema, dificultad, gratis, activa, universidad, imagen, sustento_imagen)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
            """, (
                datos.area, datos.q, datos.why, datos.curso, datos.tema,
                datos.dif, datos.gratis, datos.activa,
                datos.universidad or None,
                json.dumps(datos.imagen) if datos.imagen else None,
                json.dumps(datos.sustento_imagen) if datos.sustento_imagen else None,
            ))
            pregunta_id = cursor.fetchone()[0]

            # clave pública para el frontend ('q26', o la que envíe el admin)
            cursor.execute(
                "UPDATE preguntas SET clave = COALESCE(%s, 'q' || id::text) WHERE id = %s;",
                (datos.clave, pregunta_id),
            )

            for orden, texto in enumerate(datos.o):
                cursor.execute("""
                    INSERT INTO alternativas (pregunta_id, texto, es_correcta, orden)
                    VALUES (%s, %s, %s, %s);
                """, (pregunta_id, texto, orden == datos.c, orden))

            auditar(conexion, admin["email"], "Creó una pregunta", f"#{pregunta_id} {datos.area}")
            conexion.commit()
        return {"mensaje": "Pregunta creada", "id": pregunta_id}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.put("/preguntas/{pregunta_id}")
def modificar_pregunta(
    pregunta_id: int,
    datos: CrearPregunta,
    admin: dict = Depends(admin_actual),
):
    if datos.dif not in ("facil", "intermedio", "dificil"):
        return {"error": "Dificultad no válida"}
    if len(datos.o) < 2 or not (0 <= datos.c < len(datos.o)):
        return {"error": "Alternativas no válidas"}

    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                UPDATE preguntas
                SET area = %s, texto = %s, sustento = %s, curso = %s,
                    tema = %s, dificultad = %s, gratis = %s, activa = %s,
                    universidad = %s, imagen = %s, sustento_imagen = %s
                WHERE id = %s;
            """, (
                datos.area, datos.q, datos.why, datos.curso, datos.tema,
                datos.dif, datos.gratis, datos.activa,
                datos.universidad or None,
                json.dumps(datos.imagen) if datos.imagen else None,
                json.dumps(datos.sustento_imagen) if datos.sustento_imagen else None,
                pregunta_id,
            ))
            if cursor.rowcount == 0:
                return {"error": "La pregunta no existe"}

            # Actualiza las alternativas por posición: conserva sus ids
            # (si se borraran, se romperían las respuestas ya registradas)
            for orden, texto in enumerate(datos.o):
                cursor.execute("""
                    UPDATE alternativas
                    SET texto = %s, es_correcta = %s
                    WHERE pregunta_id = %s AND orden = %s;
                """, (texto, orden == datos.c, pregunta_id, orden))
                if cursor.rowcount == 0:
                    cursor.execute("""
                        INSERT INTO alternativas (pregunta_id, texto, es_correcta, orden)
                        VALUES (%s, %s, %s, %s);
                    """, (pregunta_id, texto, orden == datos.c, orden))
            cursor.execute(
                "DELETE FROM alternativas WHERE pregunta_id = %s AND orden >= %s;",
                (pregunta_id, len(datos.o)),
            )

            auditar(conexion, admin["email"], "Modificó una pregunta", f"#{pregunta_id}")
            conexion.commit()
        return {"mensaje": "Pregunta actualizada"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.delete("/preguntas/{pregunta_id}")
def eliminar_pregunta(pregunta_id: int, admin: dict = Depends(admin_actual)):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT texto FROM preguntas WHERE id = %s;", (pregunta_id,))
            pregunta = cursor.fetchone()
            if not pregunta:
                return {"error": "La pregunta no existe"}

            # Si ya se usó en un intento, se conserva (para no romper resultados)
            cursor.execute(
                "SELECT 1 FROM intento_preguntas WHERE pregunta_id = %s LIMIT 1;",
                (pregunta_id,),
            )
            if cursor.fetchone():
                return {"error": "La pregunta ya se usó en intentos. Desactívala (campo 'activa') en su lugar."}

            cursor.execute(
                "SELECT 1 FROM reportes WHERE pregunta_id = %s LIMIT 1;",
                (pregunta_id,),
            )
            if cursor.fetchone():
                return {"error": "La pregunta tiene reportes asociados; respóndelos antes de eliminarla."}

            # Sin referencias: se puede borrar con sus alternativas y vínculos
            cursor.execute("DELETE FROM examen_preguntas WHERE pregunta_id = %s;", (pregunta_id,))
            cursor.execute("DELETE FROM qstats WHERE pregunta_id = %s;", (pregunta_id,))
            cursor.execute("DELETE FROM alternativas WHERE pregunta_id = %s;", (pregunta_id,))
            cursor.execute("DELETE FROM preguntas WHERE id = %s;", (pregunta_id,))

            auditar(conexion, admin["email"], "Eliminó una pregunta", f"#{pregunta_id}")
            conexion.commit()
        return {"mensaje": "Pregunta eliminada"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


# ============================================================
# CRUD EXÁMENES
# ============================================================

@admin_router.post("/examenes")
def crear_examen(datos: CrearExamen, admin: dict = Depends(admin_actual)):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT 1 FROM universidades WHERE id = %s;", (datos.universidad_id,))
            if not cursor.fetchone():
                return {"error": "La universidad no existe"}

            cursor.execute("""
                INSERT INTO examenes (
                    universidad_id, nombre, duracion_segundos,
                    cantidad_preguntas, publicado, escala, tipo
                )
                VALUES (%s, %s, %s, %s, %s, %s, 'simulacro')
                RETURNING id;
            """, (
                datos.universidad_id, datos.nombre, datos.minutos * 60,
                datos.cantidad_preguntas, datos.publicado, datos.escala,
            ))
            examen_id = cursor.fetchone()[0]

            cursor.execute("""
                INSERT INTO reglas_calificacion (examen_id, puntos_correcta, puntos_incorrecta, puntos_blanco)
                VALUES (%s, %s, %s, 0);
            """, (examen_id, datos.pc, datos.pw))

            auditar(conexion, admin["email"], "Creó un examen", f"#{examen_id} {datos.nombre}")
            conexion.commit()
        return {"mensaje": "Examen creado", "id": examen_id}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.put("/examenes/{examen_id}")
def modificar_examen(
    examen_id: int,
    datos: CrearExamen,
    admin: dict = Depends(admin_actual),
):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                UPDATE examenes
                SET universidad_id = %s, nombre = %s, duracion_segundos = %s,
                    cantidad_preguntas = %s, publicado = %s, escala = %s
                WHERE id = %s;
            """, (
                datos.universidad_id, datos.nombre, datos.minutos * 60,
                datos.cantidad_preguntas, datos.publicado, datos.escala, examen_id,
            ))
            if cursor.rowcount == 0:
                return {"error": "El examen no existe"}

            cursor.execute("""
                UPDATE reglas_calificacion
                SET puntos_correcta = %s, puntos_incorrecta = %s
                WHERE examen_id = %s;
            """, (datos.pc, datos.pw, examen_id))

            auditar(conexion, admin["email"], "Modificó un examen", f"#{examen_id} {datos.nombre}")
            conexion.commit()
        return {"mensaje": "Examen actualizado"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.put("/examenes/{examen_id}/pool")
def guardar_pool(
    examen_id: int,
    datos: GuardarPool,
    admin: dict = Depends(admin_actual),
):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT 1 FROM examenes WHERE id = %s;", (examen_id,))
            if not cursor.fetchone():
                return {"error": "El examen no existe"}

            cursor.execute("DELETE FROM examen_preguntas WHERE examen_id = %s;", (examen_id,))
            for pregunta_id in datos.pregunta_ids:
                cursor.execute("""
                    INSERT INTO examen_preguntas (examen_id, pregunta_id)
                    VALUES (%s, %s) ON CONFLICT DO NOTHING;
                """, (examen_id, int(pregunta_id)))

            if datos.cantidad is not None:
                cursor.execute(
                    "UPDATE examenes SET cantidad_preguntas = %s WHERE id = %s;",
                    (datos.cantidad, examen_id),
                )

            auditar(
                conexion,
                admin["email"],
                "Actualizó el banco de un examen",
                f"#{examen_id}: {len(datos.pregunta_ids)} preguntas",
            )
            conexion.commit()
        return {"mensaje": "Banco actualizado", "preguntas": len(datos.pregunta_ids)}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.delete("/examenes/{examen_id}")
def eliminar_examen(examen_id: int, admin: dict = Depends(admin_actual)):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT nombre FROM examenes WHERE id = %s;", (examen_id,))
            examen = cursor.fetchone()
            if not examen:
                return {"error": "El examen no existe"}

            cursor.execute(
                "SELECT 1 FROM intentos WHERE examen_id = %s LIMIT 1;",
                (examen_id,),
            )
            if cursor.fetchone():
                return {"error": "El examen ya tiene intentos registrados; no se puede eliminar."}

            # Sin intentos: se puede borrar con sus vínculos
            cursor.execute("DELETE FROM examen_preguntas WHERE examen_id = %s;", (examen_id,))
            cursor.execute("DELETE FROM reglas_calificacion WHERE examen_id = %s;", (examen_id,))
            cursor.execute("DELETE FROM examenes WHERE id = %s;", (examen_id,))

            auditar(conexion, admin["email"], "Eliminó un examen", f"#{examen_id} {examen[0]}")
            conexion.commit()
        return {"mensaje": "Examen eliminado"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


# ============================================================
# UNIVERSIDADES
# ============================================================

@admin_router.post("/universidades")
def crear_universidad(datos: CrearUniversidad, admin: dict = Depends(admin_actual)):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                INSERT INTO universidades (nombre, codigo, activa)
                VALUES (%s, %s, %s) RETURNING id;
            """, (datos.nombre, datos.codigo.upper(), datos.activa))
            nuevo_id = cursor.fetchone()[0]
            auditar(conexion, admin["email"], "Creó una universidad", datos.nombre)
            conexion.commit()
        return {"mensaje": "Universidad creada", "id": nuevo_id}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.put("/universidades/{universidad_id}")
def modificar_universidad(
    universidad_id: int,
    datos: CrearUniversidad,
    admin: dict = Depends(admin_actual),
):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("""
                UPDATE universidades
                SET nombre = %s, codigo = %s, activa = %s
                WHERE id = %s;
            """, (datos.nombre, datos.codigo.upper(), datos.activa, universidad_id))
            if cursor.rowcount == 0:
                return {"error": "La universidad no existe"}
            auditar(conexion, admin["email"], "Modificó una universidad", datos.nombre)
            conexion.commit()
        return {"mensaje": "Universidad actualizada"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.delete("/universidades/{universidad_id}")
def eliminar_universidad(
    universidad_id: int,
    admin: dict = Depends(admin_actual),
):
    """Borra una universidad solo si no la referencia ningún examen ni ninguna
    pregunta: esas etiquetas siguen vivas en el banco y quitarlas rompería los
    filtros de la portada."""
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT nombre, codigo FROM universidades WHERE id = %s;",
                (universidad_id,),
            )
            fila = cursor.fetchone()
            if not fila:
                return {"error": "La universidad no existe"}
            nombre, codigo = fila[0], (fila[1] or "").strip().upper()

            cursor.execute(
                "SELECT COUNT(*) FROM examenes WHERE universidad_id = %s;",
                (universidad_id,),
            )
            en_examenes = cursor.fetchone()[0]

            en_preguntas = 0
            if codigo:
                # Compara por tokens: '|UNI|UNMSM|' contiene '|UNI|' pero no
                # 'UNI' suelto dentro de otra sigla (evita falsos positivos).
                cursor.execute(
                    """
                    SELECT COUNT(*) FROM preguntas
                    WHERE universidad IS NOT NULL
                      AND strpos(
                            '|' || replace(upper(universidad), ' ', '') || '|',
                            '|' || %s || '|'
                          ) > 0;
                    """,
                    (codigo,),
                )
                en_preguntas = cursor.fetchone()[0]

            if en_examenes or en_preguntas:
                partes = []
                if en_examenes:
                    partes.append(f"{en_examenes} examen(es)")
                if en_preguntas:
                    partes.append(f"{en_preguntas} pregunta(s)")
                return {
                    "error": (
                        f"{nombre} se usa en {' y '.join(partes)}. "
                        "Quítala de ahí antes de eliminarla (o desactívala para "
                        "que deje de aparecer)."
                    )
                }

            cursor.execute("DELETE FROM universidades WHERE id = %s;", (universidad_id,))
            if cursor.rowcount == 0:
                return {"error": "La universidad no existe"}
            auditar(conexion, admin["email"], "Eliminó una universidad", nombre)
            conexion.commit()
        return {"mensaje": "Universidad eliminada"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


# ============================================================
# CATÁLOGOS: UNIVERSIDADES, CURSOS Y TEMAS
# ============================================================
# Cursos y temas se guardan además como texto en cada pregunta (columnas
# curso y tema), que es de donde la portada arma sus filtros. Este catálogo
# es la lista oficial: al renombrar una entrada se actualiza su texto en
# todas las preguntas, así el cambio se nota de inmediato en la práctica.
# No hay claves ajenas en preguntas, así que no hace falta migrar nada.

def _area_de_texto(cursor, nombre_area):
    """Id del área con ese nombre (la crea si todavía no existe)."""
    nombre = (nombre_area or "").strip() or "Aptitud Académica"
    cursor.execute("SELECT id FROM areas WHERE nombre = %s ORDER BY id LIMIT 1;", (nombre,))
    fila = cursor.fetchone()
    if fila:
        return fila[0]
    cursor.execute(
        "INSERT INTO areas (nombre, activa) VALUES (%s, true) RETURNING id;", (nombre,)
    )
    return cursor.fetchone()[0]


def _curso_de_texto(cursor, nombre_curso):
    """Id del curso con ese nombre; lo crea si hace falta. Un tema siempre
    necesita un curso donde vivir, aunque la pregunta no traiga curso."""
    nombre = (nombre_curso or "").strip()
    if nombre:
        cursor.execute("SELECT id FROM cursos WHERE nombre = %s ORDER BY id LIMIT 1;", (nombre,))
        fila = cursor.fetchone()
        if fila:
            return fila[0]
        area_id = _area_de_texto(cursor, None)
        cursor.execute(
            "INSERT INTO cursos (area_id, nombre, activo) VALUES (%s, %s, true) RETURNING id;",
            (area_id, nombre),
        )
        return cursor.fetchone()[0]
    cursor.execute("SELECT id FROM cursos ORDER BY id LIMIT 1;")
    fila = cursor.fetchone()
    if fila:
        return fila[0]
    area_id = _area_de_texto(cursor, None)
    cursor.execute(
        "INSERT INTO cursos (area_id, nombre, activo) VALUES (%s, '', true) RETURNING id;",
        (area_id,),
    )
    return cursor.fetchone()[0]


def _conteo(cursor, columna, valor):
    """Preguntas que usan ese curso o tema (por nombre exacto)."""
    if columna == "curso":
        cursor.execute("SELECT COUNT(*) FROM preguntas WHERE curso = %s;", (valor,))
    else:
        cursor.execute("SELECT COUNT(*) FROM preguntas WHERE tema = %s;", (valor,))
    return cursor.fetchone()[0]


def _importar_al_catalogo(cursor):
    """Da de alta en el catálogo lo que ya esté escrito en las preguntas
    (idempotente): el panel nunca muestra un catálogo vacío."""
    cursor.execute(
        "SELECT DISTINCT area FROM preguntas WHERE area IS NOT NULL AND btrim(area) <> '';"
    )
    for (area,) in cursor.fetchall():
        cursor.execute("SELECT 1 FROM areas WHERE nombre = %s LIMIT 1;", (area,))
        if not cursor.fetchone():
            cursor.execute("INSERT INTO areas (nombre, activa) VALUES (%s, true);", (area,))

    # Cursos: el área que más se repite entre las preguntas que lo usan.
    cursor.execute(
        """
        SELECT curso, area FROM (
            SELECT curso, area,
                   ROW_NUMBER() OVER (
                       PARTITION BY curso ORDER BY COUNT(*) DESC, area
                   ) AS rn
            FROM preguntas
            WHERE curso IS NOT NULL AND btrim(curso) <> ''
            GROUP BY curso, area
        ) t WHERE rn = 1;
        """
    )
    for curso, area in cursor.fetchall():
        cursor.execute("SELECT 1 FROM cursos WHERE nombre = %s LIMIT 1;", (curso,))
        if cursor.fetchone():
            continue
        area_id = _area_de_texto(cursor, area)
        cursor.execute(
            "INSERT INTO cursos (area_id, nombre, activo) VALUES (%s, %s, true);",
            (area_id, curso),
        )

    # Temas: el curso que más se repite entre las preguntas que lo usan.
    cursor.execute(
        """
        SELECT tema, curso FROM (
            SELECT tema, COALESCE(curso, '') AS curso,
                   ROW_NUMBER() OVER (
                       PARTITION BY tema
                       ORDER BY COUNT(*) DESC, COALESCE(curso, '')
                   ) AS rn
            FROM preguntas
            WHERE tema IS NOT NULL AND btrim(tema) <> ''
            GROUP BY tema, COALESCE(curso, '')
        ) t WHERE rn = 1;
        """
    )
    for tema, curso in cursor.fetchall():
        cursor.execute("SELECT 1 FROM temas WHERE nombre = %s LIMIT 1;", (tema,))
        if cursor.fetchone():
            continue
        curso_id = _curso_de_texto(cursor, curso)
        cursor.execute(
            "INSERT INTO temas (curso_id, nombre, activo) VALUES (%s, %s, true);",
            (curso_id, tema),
        )


@admin_router.get("/catalogos")
def leer_catalogos(_: dict = Depends(admin_actual)):
    """Áreas, cursos y temas del catálogo. Antes importa lo que ya esté escrito
    en las preguntas: es una lectura con alta automática, sin efectos raros
    (volver a llamar no duplica nada)."""
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            _importar_al_catalogo(cursor)

            cursor.execute(
                """
                SELECT c.id, c.area_id, a.nombre, c.nombre, c.activo
                FROM cursos c
                JOIN areas a ON a.id = c.area_id
                ORDER BY a.nombre, c.nombre, c.id;
                """
            )
            cursos = [
                {
                    "id": f[0],
                    "area_id": f[1],
                    "area": f[2],
                    "nombre": f[3],
                    "activo": f[4],
                    "preguntas": _conteo(cursor, "curso", f[3]),
                }
                for f in cursor.fetchall()
            ]

            cursor.execute(
                """
                SELECT t.id, t.curso_id, COALESCE(c.nombre, ''), t.nombre, t.activo
                FROM temas t
                LEFT JOIN cursos c ON c.id = t.curso_id
                ORDER BY c.nombre, t.nombre, t.id;
                """
            )
            temas = [
                {
                    "id": f[0],
                    "curso_id": f[1],
                    "curso": f[2],
                    "nombre": f[3],
                    "activo": f[4],
                    "preguntas": _conteo(cursor, "tema", f[3]),
                }
                for f in cursor.fetchall()
            ]

            cursor.execute("SELECT id, nombre FROM areas ORDER BY nombre, id;")
            areas = [{"id": f[0], "nombre": f[1]} for f in cursor.fetchall()]

            conexion.commit()   # la importación de arriba escribe
        return {"areas": areas, "cursos": cursos, "temas": temas}
    finally:
        conexion.close()


@admin_router.post("/catalogos/cursos")
def crear_curso(datos: CrearCurso, admin: dict = Depends(admin_actual)):
    nombre = (datos.nombre or "").strip()
    if not nombre:
        return {"error": "Escribe el nombre del curso."}
    if len(nombre) > 100:
        return {"error": "El nombre del curso no puede pasar de 100 caracteres."}
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT id FROM cursos WHERE nombre = %s LIMIT 1;", (nombre,))
            if cursor.fetchone():
                return {"error": f"Ya existe un curso llamado {nombre}."}
            area_id = _area_de_texto(cursor, datos.area)
            cursor.execute(
                "INSERT INTO cursos (area_id, nombre, activo) VALUES (%s, %s, true) RETURNING id;",
                (area_id, nombre),
            )
            curso_id = cursor.fetchone()[0]
            auditar(conexion, admin["email"], "Creó un curso", nombre)
            conexion.commit()
        return {"mensaje": "Curso creado", "id": curso_id}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.put("/catalogos/cursos/{curso_id}")
def modificar_curso(
    curso_id: int, datos: ModificarCurso, admin: dict = Depends(admin_actual)
):
    """Renombra un curso y arrastra el cambio a todas sus preguntas."""
    nuevo = (datos.nombre or "").strip()
    if not nuevo:
        return {"error": "El nombre del curso no puede quedar vacío."}
    if len(nuevo) > 100:
        return {"error": "El nombre del curso no puede pasar de 100 caracteres."}
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT nombre FROM cursos WHERE id = %s;", (curso_id,))
            fila = cursor.fetchone()
            if not fila:
                return {"error": "El curso no existe."}
            viejo = fila[0]

            cursor.execute(
                "SELECT COUNT(*) FROM cursos WHERE nombre = %s AND id <> %s;",
                (nuevo, curso_id),
            )
            if cursor.fetchone()[0]:
                return {"error": f"Ya existe un curso llamado {nuevo}."}

            movidas = 0
            if nuevo != viejo:
                cursor.execute(
                    "UPDATE preguntas SET curso = %s WHERE curso = %s;", (nuevo, viejo)
                )
                movidas = cursor.rowcount
                cursor.execute(
                    "UPDATE cursos SET nombre = %s WHERE id = %s;", (nuevo, curso_id)
                )
            if datos.area:
                area_id = _area_de_texto(cursor, datos.area)
                cursor.execute("UPDATE cursos SET area_id = %s WHERE id = %s;", (area_id, curso_id))

            detalle = nuevo if nuevo != viejo else f"{nuevo} (área)"
            auditar(conexion, admin["email"], "Renombró un curso", detalle)
            conexion.commit()
        return {"mensaje": "Curso actualizado", "preguntas": movidas}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.delete("/catalogos/cursos/{curso_id}")
def eliminar_curso(curso_id: int, admin: dict = Depends(admin_actual)):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT nombre FROM cursos WHERE id = %s;", (curso_id,))
            fila = cursor.fetchone()
            if not fila:
                return {"error": "El curso no existe."}
            nombre = fila[0]

            cursor.execute(
                "SELECT COUNT(*) FROM preguntas WHERE curso = %s;", (nombre,)
            )
            en_uso = cursor.fetchone()[0]
            if en_uso:
                return {
                    "error": (
                        f"{en_uso} pregunta(s) usan el curso {nombre}. "
                        "Renómbralas o quítales el curso antes de eliminarlo."
                    )
                }

            cursor.execute("DELETE FROM temas WHERE curso_id = %s;", (curso_id,))
            cursor.execute("DELETE FROM cursos WHERE id = %s;", (curso_id,))
            if cursor.rowcount == 0:
                return {"error": "El curso no existe."}
            auditar(conexion, admin["email"], "Eliminó un curso", nombre)
            conexion.commit()
        return {"mensaje": "Curso eliminado"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.post("/catalogos/temas")
def crear_tema(datos: CrearTema, admin: dict = Depends(admin_actual)):
    nombre = (datos.nombre or "").strip()
    if not nombre:
        return {"error": "Escribe el nombre del tema."}
    if len(nombre) > 150:
        return {"error": "El nombre del tema no puede pasar de 150 caracteres."}
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT id FROM temas WHERE nombre = %s LIMIT 1;", (nombre,))
            if cursor.fetchone():
                return {"error": f"Ya existe un tema llamado {nombre}."}
            curso_id = _curso_de_texto(cursor, datos.curso)
            cursor.execute(
                "INSERT INTO temas (curso_id, nombre, activo) VALUES (%s, %s, true) RETURNING id;",
                (curso_id, nombre),
            )
            tema_id = cursor.fetchone()[0]
            auditar(conexion, admin["email"], "Creó un tema", nombre)
            conexion.commit()
        return {"mensaje": "Tema creado", "id": tema_id}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.put("/catalogos/temas/{tema_id}")
def modificar_tema(tema_id: int, datos: ModificarTema, admin: dict = Depends(admin_actual)):
    """Renombra un tema y arrastra el cambio a todas sus preguntas."""
    nuevo = (datos.nombre or "").strip()
    if not nuevo:
        return {"error": "El nombre del tema no puede quedar vacío."}
    if len(nuevo) > 150:
        return {"error": "El nombre del tema no puede pasar de 150 caracteres."}
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT nombre FROM temas WHERE id = %s;", (tema_id,))
            fila = cursor.fetchone()
            if not fila:
                return {"error": "El tema no existe."}
            viejo = fila[0]

            cursor.execute(
                "SELECT COUNT(*) FROM temas WHERE nombre = %s AND id <> %s;",
                (nuevo, tema_id),
            )
            if cursor.fetchone()[0]:
                return {"error": f"Ya existe un tema llamado {nuevo}."}

            movidas = 0
            if nuevo != viejo:
                cursor.execute(
                    "UPDATE preguntas SET tema = %s WHERE tema = %s;", (nuevo, viejo)
                )
                movidas = cursor.rowcount
                cursor.execute("UPDATE temas SET nombre = %s WHERE id = %s;", (nuevo, tema_id))
            if datos.curso is not None:
                curso_id = _curso_de_texto(cursor, datos.curso)
                cursor.execute("UPDATE temas SET curso_id = %s WHERE id = %s;", (curso_id, tema_id))

            auditar(conexion, admin["email"], "Renombró un tema", nuevo)
            conexion.commit()
        return {"mensaje": "Tema actualizado", "preguntas": movidas}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


@admin_router.delete("/catalogos/temas/{tema_id}")
def eliminar_tema(tema_id: int, admin: dict = Depends(admin_actual)):
    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT nombre FROM temas WHERE id = %s;", (tema_id,))
            fila = cursor.fetchone()
            if not fila:
                return {"error": "El tema no existe."}
            nombre = fila[0]

            cursor.execute("SELECT COUNT(*) FROM preguntas WHERE tema = %s;", (nombre,))
            en_uso = cursor.fetchone()[0]
            if en_uso:
                return {
                    "error": (
                        f"{en_uso} pregunta(s) usan el tema {nombre}. "
                        "Renómbralas o quítales el tema antes de eliminarlo."
                    )
                }

            cursor.execute("DELETE FROM temas WHERE id = %s;", (tema_id,))
            if cursor.rowcount == 0:
                return {"error": "El tema no existe."}
            auditar(conexion, admin["email"], "Eliminó un tema", nombre)
            conexion.commit()
        return {"mensaje": "Tema eliminado"}
    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()
