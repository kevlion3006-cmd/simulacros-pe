"""
Siembra la base de datos con los mismos datos del frontend (js/data.js).

REQUISITO: ejecutar schema.sql antes.
- Resetea preguntas, alternativas e intentos (datos de prueba antiguos).
- Conserva universidades, exámenes y usuarios existentes.

Uso:  python seed.py
"""
import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

os.chdir(Path(__file__).resolve().parent)  # ejecutar desde backend/

from dotenv import load_dotenv

load_dotenv()

from auth import crear_hash_password  # noqa: E402
from database import obtener_conexion  # noqa: E402
from planes import planes_por_defecto  # noqa: E402


# ============================================================
# DATOS DEL FRONTEND (js/data.js)
# ============================================================

# (id, area, curso, tema, dificultad, texto, opciones, correcta, sustento)
PREGUNTAS = [
    ("a1", "Aptitud Académica", "Razonamiento verbal", "Sinónimos y antónimos", "facil",
     "Determine el sinónimo contextual de 'EFÍMERO':",
     ["Permanente", "Pasajero", "Trascendental", "Complejo"], 1,
     "Efímero es de corta duración, por tanto, pasajero."),
    ("a2", "Aptitud Académica", "Razonamiento lógico", "Certeza y combinatoria", "dificil",
     "Con 4 pelotas rojas, 5 azules y 6 verdes, ¿cuántas extraes al azar para tener certeza de una de cada color?",
     ["10", "11", "12", "13"], 2,
     "Sacas todas las verdes y azules (11). La 12 asegura una de cada color."),
    ("a3", "Aptitud Académica", "Razonamiento numérico", "Series numéricas", "intermedio",
     "En la serie 2, 6, 12, 20, 30, ... ¿qué número sigue?",
     ["36", "40", "42", "44"], 2,
     "Las diferencias son 4, 6, 8 y 10; la siguiente es 12, así que 30 + 12 = 42."),
    ("a4", "Aptitud Académica", "Razonamiento verbal", "Analogías", "facil",
     "Complete la analogía: LIBRO es a BIBLIOTECA como CUADRO es a...",
     ["Pintor", "Museo", "Marco", "Color"], 1,
     "Un libro se guarda en una biblioteca, como un cuadro se exhibe en un museo."),
    ("a5", "Aptitud Académica", "Razonamiento numérico", "Planteo de ecuaciones", "dificil",
     "El doble de un número, aumentado en 6, es igual al triple del mismo número disminuido en 4. ¿Cuál es el número?",
     ["8", "10", "12", "14"], 1,
     "2x + 6 = 3x − 4, entonces x = 10."),
    ("a6", "Aptitud Académica", "Razonamiento verbal", "Término excluido", "facil",
     "Elija la palabra que no pertenece al grupo: rojo, azul, verde, cuadrado.",
     ["Rojo", "Azul", "Verde", "Cuadrado"], 3,
     "Rojo, azul y verde son colores; cuadrado es una figura geométrica."),
    ("m1", "Matemáticas", "Álgebra", "Ecuaciones lineales", "facil",
     "Si 3x + 5 = 20, ¿cuál es el valor de x?",
     ["3", "5", "7", "15"], 1,
     "3x = 15, entonces x = 5."),
    ("m2", "Matemáticas", "Geometría", "Áreas de figuras planas", "facil",
     "¿Cuál es el área de un triángulo de base 10 cm y altura 6 cm?",
     ["60 cm²", "16 cm²", "30 cm²", "32 cm²"], 2,
     "Área = (base × altura) / 2 = (10 × 6) / 2 = 30 cm²."),
    ("m3", "Matemáticas", "Álgebra", "Ecuaciones cuadráticas", "intermedio",
     "La suma de las raíces de x² − 7x + 12 = 0 es:",
     ["7", "12", "−7", "4"], 0,
     "Las raíces son 3 y 4; su suma es 7."),
    ("m4", "Matemáticas", "Aritmética", "Porcentajes", "facil",
     "¿Cuál es el 20 % de 250?",
     ["50", "40", "25", "60"], 0,
     "250 × 0,20 = 50."),
    ("m5", "Matemáticas", "Álgebra", "Logaritmos", "dificil",
     "Si log₂(x) + log₂(x − 2) = 3, ¿cuál es el valor de x?",
     ["2", "3", "4", "6"], 2,
     "x(x − 2) = 2³ = 8, luego x² − 2x − 8 = 0 y x = 4 (x = −2 no cumple el dominio)."),
    ("m6", "Matemáticas", "Geometría analítica", "La recta: pendiente", "intermedio",
     "¿Cuál es la pendiente de la recta que pasa por (1, 2) y (3, 8)?",
     ["2", "4", "6", "6"], 1,
     "m = (8 − 2) / (3 − 1) = 3."),
    ("c1", "Ciencias", "Química", "Tabla periódica", "facil",
     "¿Cuál es el símbolo químico del sodio?",
     ["S", "So", "Na", "N"], 2,
     "El símbolo Na proviene del latín natrium."),
    ("c2", "Ciencias", "Física", "Magnitudes y unidades", "facil",
     "¿En qué unidad del Sistema Internacional se mide la fuerza?",
     ["Joule", "Newton", "Pascal", "Watt"], 1,
     "La fuerza se mide en newton (N). El joule mide energía, el pascal presión y el watt potencia."),
    ("c3", "Ciencias", "Biología", "La célula", "intermedio",
     "¿En qué orgánulo de la célula se realiza la respiración celular?",
     ["Ribosoma", "Núcleo", "Mitocondria", "Lisosoma"], 2,
     "La mitocondria produce ATP mediante la respiración celular."),
    ("c4", "Ciencias", "Física", "Cinemática: MRU", "intermedio",
     "Un móvil recorre 120 km en 2 horas. ¿Cuál es su rapidez media?",
     ["40 km/h", "60 km/h", "80 km/h", "240 km/h"], 1,
     "v = d / t = 120 km / 2 h = 60 km/h."),
    ("c5", "Ciencias", "Química", "Ácidos y bases", "facil",
     "¿Cuál es el pH de una solución neutra a 25 °C?",
     ["0", "14", "1", "7"], 3,
     "A 25 °C, una solución neutra tiene pH 7."),
    ("c6", "Ciencias", "Química", "Estequiometría", "dificil",
     "¿Cuántos gramos de agua se forman al reaccionar 4 g de hidrógeno con suficiente oxígeno? (H = 1, O = 16)",
     ["18 g", "32 g", "36 g", "72 g"], 2,
     "4 g de H₂ son 2 mol; en 2H₂ + O₂ → 2H₂O se forman 2 mol de agua, es decir, 36 g."),
    ("c7", "Ciencias", "Física", "Gases ideales", "intermedio",
     "Un gas ideal, a temperatura constante, reduce su volumen a la mitad. ¿Qué ocurre con su presión?",
     ["Se reduce a la mitad", "Se mantiene", "Se duplica", "Se cuadruplica"], 2,
     "Por la ley de Boyle, P · V es constante; si V se reduce a la mitad, P se duplica."),
    ("h1", "Humanidades", "Historia del Perú", "Independencia del Perú", "facil",
     "¿En qué año se proclamó la independencia del Perú?",
     ["1810", "1821", "1824", "1879"], 1,
     "José de San Martín proclamó la independencia el 28 de julio de 1821."),
    ("h2", "Humanidades", "Lenguaje", "Sintaxis: sujeto y predicado", "intermedio",
     "¿Cuál es el sujeto en la oración \"Los estudiantes practicaron toda la tarde\"?",
     ["toda la tarde", "practicaron", "la tarde", "Los estudiantes"], 3,
     "El sujeto es quien realiza la acción: los estudiantes."),
    ("h3", "Humanidades", "Literatura", "Narrativa peruana", "intermedio",
     "¿Quién escribió la novela \"Los ríos profundos\"?",
     ["Mario Vargas Llosa", "José María Arguedas", "Ciro Alegría", "Ricardo Palma"], 1,
     "Los ríos profundos (1958) es una novela de José María Arguedas."),
    ("h4", "Humanidades", "Historia del Perú", "Culturas preincas", "intermedio",
     "¿Cómo se llama la civilización más antigua del Perú, cuyo centro urbano principal se ubica en el valle de Supe?",
     ["Chavín", "Caral", "Moche", "Wari"], 1,
     "Caral, en el valle de Supe, se considera la civilización más antigua de América."),
    ("h5", "Humanidades", "Literatura", "Figuras literarias", "facil",
     "¿Qué figura literaria se usa en \"Tus ojos son dos luceros\"?",
     ["Símil", "Hipérbole", "Metáfora", "Personificación"], 2,
     "Se identifica los ojos con luceros sin usar un nexo comparativo: es una metáfora."),
    ("h6", "Humanidades", "Historia del Perú", "La Guerra del Pacífico", "dificil",
     "¿Qué tratado puso fin a la Guerra del Pacífico entre el Perú y Chile en 1883?",
     ["Tratado de Lima", "Tratado de Ancón", "Tratado de Versalles", "Tratado de Tordesillas"], 1,
     "El Tratado de Ancón (1883) puso fin a la guerra entre Perú y Chile."),
]

GRATIS = {"a1", "m1", "c2", "h1"}  # prueba gratis (c8 no existe)

# nombre del examen -> (pool de preguntas, cantidad a sortear por día)
EXAMENES = {
    "Simulacro de admisión UNMSM": (["a1", "a2", "h1", "m1", "c1", "c3", "h4", "m3"], 8),
    "Simulacro UNI - Humanidades": (["a1", "a4", "h1", "h2", "h3", "h5", "h6"], 7),
    "Simulacro de admisión UNALM": (["a2", "a3", "m1", "c1", "c2", "c3", "c7"], 7),
    "Simulacro UNI - Matemática": (["a2", "a3", "m1", "m2", "m3", "m4", "m5", "m6"], 8),
    "Simulacro UNI - Ciencias": (["c1", "c2", "c3", "c4", "c5", "c6", "c7"], 7),
}

PASSWORD_DEMO = "demo12345"

# (email, nombre, plan, días hasta vencimiento, referido_por_email, meta_uni, meta_días)
# El plan es un id de la matriz 4 periodos x 3 niveles (nivel = basico/intermedio/completo).
USUARIOS = [
    ("maria@correo.com", "María Torres", "semana-completo", 5, None, "UNI", 58),
    ("carlos.quispe@correo.com", "Carlos Quispe", "dia-completo", -1, None, None, None),
    ("lucia.ramos@correo.com", "Lucía Ramos", "mes-completo", 21, "maria@correo.com", None, None),
    ("diego.flores@correo.com", "Diego Flores", None, None, None, None, None),
    ("ana.paredes@correo.com", "Ana Paredes", "semana-basico", -2, None, None, None),
    ("sofia.vega@correo.com", "Sofía Vega", None, None, None, None, None),
]

ADMIN = ("admin@simulacros.pe", "Administrador", "admin12345")

# (email, plan, monto, operación, estado, días_atrás, motivo)
# El monto coincide con el precio de la celda de la matriz.
PAGOS = [
    ("diego.flores@correo.com", "dia-basico", 1, "00219473", "pending", 0.04, None),
    ("sofia.vega@correo.com", "semana-basico", 5, "00458812", "pending", 0.12, None),
    ("lucia.ramos@correo.com", "mes-basico", 15, "00397120", "approved", 9, None),
    ("carlos.quispe@correo.com", "dia-completo", 3, "00120034", "approved", 2, None),
    ("diego.flores@correo.com", "dia-basico", 1, "00099881", "rejected", 3, "La operación no coincide con el monto."),
]

CUPONES = [
    ("BIENVENIDA", 20, True, None, 100, 12),
    ("UNI10", 10, True, date.today() + timedelta(days=30), None, 3),
]

# (pregunta_id_str, email, motivo, nota, estado, respuesta, días_atrás, respondido_días)
REPORTES = [
    ("a2", "lucia.ramos@correo.com", "Respuesta incorrecta",
     "Creo que la respuesta correcta es 11, no 12.", "open", "", 1, None),
    ("h5", "ana.paredes@correo.com", "Enunciado confuso o con error", "",
     "resolved", "Revisamos la pregunta y el sustento ya quedó más claro. ¡Gracias por avisarnos!",
     6, 5),
]

AUDITORIA = [
    (9, "Admin", "Aprobó un pago", "Lucía Ramos, plan Mes Básico, S/ 15.00"),
    (2, "Admin", "Aprobó un pago", "Carlos Quispe, plan Día Completo, S/ 3.00"),
    (3, "Admin", "Rechazó un pago", "Diego Flores, operación 00099881"),
]

# Historial de María: (examen, días_atrás, segundos, {área: (correctas, total)})
RESULTADOS_MARIA = [
    ("Simulacro UNI - Matemática", 2, 1250, {"Matemáticas": (4, 6), "Aptitud Académica": (3, 3)}),
    ("Simulacro de admisión UNMSM", 4, 2100,
     {"Aptitud Académica": (2, 3), "Humanidades": (1, 2), "Matemáticas": (1, 2), "Ciencias": (1, 2)}),
    ("Simulacro de admisión UNALM", 6, 1500,
     {"Aptitud Académica": (2, 2), "Matemáticas": (1, 1), "Ciencias": (2, 4)}),
    ("Simulacro UNI - Ciencias", 9, 2600, {"Ciencias": (4, 7)}),
    ("Simulacro UNI - Humanidades", 11, 1900,
     {"Humanidades": (4, 4), "Aptitud Académica": (2, 3)}),
    ("Simulacro de admisión UNMSM", 14, 2300,
     {"Aptitud Académica": (2, 3), "Humanidades": (2, 3), "Matemáticas": (1, 2), "Ciencias": (1, 2)}),
]

AJUSTES = {
    "yape": {"number": "999 999 999", "name": "Simulacros PE", "qr": ""},
    # Matriz 4 periodos x 3 niveles: los mismos 12 planes de la web.
    "planes": planes_por_defecto(),
    "limites": {
        "minPerQ": 2, "maxQ": 50,
        "showCountArea": True, "showCountCurso": True,
        "showCountTema": True, "showCountDif": True,
        "showQuestionSlider": True, "eta": "",
        "maxPerDay": 10, "referralDays": 1,
        "metaSemana": 5, "practicaQ": 10, "scoreMax": 20,
    },
}


def estadisticas_qstats(indice: int, clave: str):
    """Fórmula exacta de data.js (datos de ejemplo de aciertos por pregunta)."""
    if clave == "a2":
        return {"n": 34, "ok": 26}
    base = {"facil": 0.88, "intermedio": 0.62, "dificil": 0.33}
    dificultad = PREGUNTAS[indice][4]
    n = 18 + (indice * 7) % 40
    p = min(0.97, max(0.05, base[dificultad] + ((indice * 37) % 21 - 10) / 100))
    return {"n": n, "ok": round(n * p)}


# ============================================================
# SIEMBRA
# ============================================================

def main():
    if "--confirmar" not in sys.argv:
        print("ATENCIÓN: esto resetea preguntas e intentos de prueba.")
        print("Ejecuta de nuevo con:  python seed.py --confirmar")
        return

    conexion = obtener_conexion()
    try:
        with conexion.cursor() as cursor:

            # 0) Datos base para una BD NUEVA (p.ej. Neon): idempotente,
            #    no toca nada si las filas ya existen.
            for codigo, nombre in (
                ("UNMSM", "Universidad Nacional Mayor de San Marcos"),
                ("UNI",   "Universidad Nacional de Ingeniería"),
                ("UNALM", "Universidad Nacional Agraria La Molina"),
            ):
                cursor.execute(
                    "INSERT INTO universidades (codigo, nombre) VALUES (%s, %s) "
                    "ON CONFLICT (codigo) DO NOTHING;",
                    (codigo, nombre),
                )
            for nombre, codigo, duracion, cantidad in (
                ("Simulacro de admisión UNMSM", "UNMSM", 3600,  8),
                ("Simulacro UNI - Humanidades", "UNI",  10800,  7),
                ("Simulacro de admisión UNALM", "UNALM", 3600,  7),
                ("Simulacro UNI - Matemática",  "UNI",  10800,  8),
                ("Simulacro UNI - Ciencias",    "UNI",  10800,  7),
            ):
                cursor.execute("""
                    INSERT INTO examenes
                        (universidad_id, nombre, duracion_segundos,
                         cantidad_preguntas, publicado, activo, escala)
                    SELECT u.id, %s, %s, %s, true, true, 20
                    FROM universidades u
                    WHERE u.codigo = %s
                      AND NOT EXISTS (
                          SELECT 1 FROM examenes e WHERE e.nombre = %s
                      );
                """, (nombre, duracion, cantidad, codigo, nombre))

            # 1) Limpieza de datos de prueba (conserva universidades/exámenes/usuarios)
            cursor.execute("""
                TRUNCATE TABLE
                    respuestas, intento_preguntas, intentos,
                    alternativas, examen_preguntas, preguntas,
                    qstats, reportes, pagos, auditoria, eventos
                RESTART IDENTITY CASCADE;
            """)
            cursor.execute("DELETE FROM cupones;")

            # 2) Preguntas
            ids = {}
            for clave, area, curso, tema, dif, texto, opciones, correcta, porque in PREGUNTAS:
                cursor.execute("""
                    INSERT INTO preguntas (area, texto, sustento, curso, tema, dificultad, gratis, activa, clave)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, true, %s)
                    RETURNING id;
                """, (area, texto, porque, curso, tema, dif, clave in GRATIS, clave))
                ids[clave] = cursor.fetchone()[0]
                for orden, opcion in enumerate(opciones):
                    cursor.execute("""
                        INSERT INTO alternativas (pregunta_id, texto, es_correcta, orden)
                        VALUES (%s, %s, %s, %s);
                    """, (ids[clave], opcion, orden == correcta, orden))

            # 3) Exámenes: sorteo diario + calificación 0-20
            for nombre, (pool, cantidad) in EXAMENES.items():
                cursor.execute("SELECT id FROM examenes WHERE nombre = %s;", (nombre,))
                fila = cursor.fetchone()
                if not fila:
                    print(f"  ! No encontré el examen: {nombre}")
                    continue
                examen_id = fila[0]
                cursor.execute("""
                    UPDATE examenes
                    SET cantidad_preguntas = %s, publicado = true, escala = 20
                    WHERE id = %s;
                """, (cantidad, examen_id))
                cursor.execute("""
                    INSERT INTO reglas_calificacion (examen_id, puntos_correcta, puntos_incorrecta, puntos_blanco)
                    VALUES (%s, 1, 0, 0)
                    ON CONFLICT DO NOTHING;
                """, (examen_id,))
                for clave in pool:
                    cursor.execute("""
                        INSERT INTO examen_preguntas (examen_id, pregunta_id)
                        VALUES (%s, %s) ON CONFLICT DO NOTHING;
                    """, (examen_id, ids[clave]))

            # 4) Estadísticas de preguntas
            for indice, (clave, *_resto) in enumerate(PREGUNTAS):
                st = estadisticas_qstats(indice, clave)
                cursor.execute(
                    "INSERT INTO qstats (pregunta_id, n, ok) VALUES (%s, %s, %s);",
                    (ids[clave], st["n"], st["ok"]),
                )

            # 5) Usuarios demo + admin
            usuarios = {}
            for email, nombre, plan, dias, referido, meta_uni, meta_dias in USUARIOS:
                plan_hasta = (datetime.now() + timedelta(days=dias)) if dias is not None else None
                meta_fecha = (date.today() + timedelta(days=meta_dias)) if meta_dias is not None else None
                cursor.execute("""
                    INSERT INTO usuarios (nombre, email, password_hash, plan, plan_hasta,
                                          meta_uni, meta_fecha, ref_code)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (email) DO UPDATE SET
                        nombre = EXCLUDED.nombre,
                        password_hash = EXCLUDED.password_hash,
                        plan = EXCLUDED.plan,
                        plan_hasta = EXCLUDED.plan_hasta,
                        meta_uni = EXCLUDED.meta_uni,
                        meta_fecha = EXCLUDED.meta_fecha
                    RETURNING id;
                """, (
                    nombre, email, crear_hash_password(PASSWORD_DEMO),
                    plan, plan_hasta, meta_uni, meta_fecha,
                    nombre.split()[0].upper()[:6] + "-DEMO",
                ))
                usuarios[email] = cursor.fetchone()[0]

            cursor.execute("""
                INSERT INTO usuarios (nombre, email, password_hash, rol, ref_code)
                VALUES (%s, %s, %s, 'admin', 'ADMIN-0001')
                ON CONFLICT (email) DO UPDATE SET
                    nombre = EXCLUDED.nombre,
                    password_hash = EXCLUDED.password_hash,
                    rol = 'admin'
                RETURNING id;
            """, (ADMIN[1], ADMIN[0], crear_hash_password(ADMIN[2])))
            admin_id = cursor.fetchone()[0]

            # Referido: Lucía fue invitada por María
            cursor.execute(
                "UPDATE usuarios SET referido_por = %s WHERE id = %s;",
                (usuarios["maria@correo.com"], usuarios["lucia.ramos@correo.com"]),
            )

            # 6) Pagos demo
            for email, plan, monto, operacion, estado, dias, motivo in PAGOS:
                fecha = datetime.now() - timedelta(days=dias)
                revisado = fecha if estado != "pending" else None
                cursor.execute("""
                    INSERT INTO pagos (usuario_id, plan, monto, operacion, estado, motivo, fecha, revisado_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                """, (usuarios[email], plan, monto, operacion, estado, motivo, fecha, revisado))

            # 7) Cupones
            for codigo, porcentaje, activo, vence, max_usos, usados in CUPONES:
                cursor.execute("""
                    INSERT INTO cupones (codigo, porcentaje, activo, vence, max_usos, usados)
                    VALUES (%s, %s, %s, %s, %s, %s);
                """, (codigo, porcentaje, activo, vence, max_usos, usados))

            # 8) Reportes
            for clave, email, motivo, nota, estado, respuesta, dias, respondido in REPORTES:
                cursor.execute("""
                    INSERT INTO reportes (pregunta_id, usuario_id, motivo, nota, estado, respuesta, fecha, respondido_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                """, (
                    ids[clave], usuarios[email], motivo, nota, estado, respuesta,
                    datetime.now() - timedelta(days=dias),
                    datetime.now() - timedelta(days=respondido) if respondido else None,
                ))

            # 9) Auditoría
            for dias, quien, accion, detalle in AUDITORIA:
                cursor.execute("""
                    INSERT INTO auditoria (fecha, quien, accion, detalle)
                    VALUES (%s, %s, %s, %s);
                """, (datetime.now() - timedelta(days=dias), quien, accion, detalle))

            # 10) Ajustes del sitio
            for clave, valor in AJUSTES.items():
                cursor.execute("""
                    INSERT INTO ajustes (clave, valor) VALUES (%s, %s::jsonb)
                    ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;
                """, (clave, json.dumps(valor)))

            # 11) Historial de María (6 resultados fabricados, coherentes con el frontend)
            maria = usuarios["maria@correo.com"]
            for nombre, dias, segundos, areas in RESULTADOS_MARIA:
                cursor.execute("SELECT id FROM examenes WHERE nombre = %s;", (nombre,))
                examen_id = cursor.fetchone()[0]

                elegidas = []
                correctas = incorrectas = 0
                for area, (ok, total) in areas.items():
                    cursor.execute("""
                        SELECT p.id,
                            (SELECT id FROM alternativas
                             WHERE pregunta_id = p.id AND es_correcta
                             ORDER BY orden LIMIT 1) AS correcta,
                            (SELECT id FROM alternativas
                             WHERE pregunta_id = p.id AND NOT es_correcta
                             ORDER BY orden LIMIT 1) AS incorrecta
                        FROM preguntas p
                        WHERE p.area = %s AND p.activa = true
                        ORDER BY p.id
                        LIMIT %s;
                    """, (area, total))
                    for indice, (pregunta_id, alt_ok, alt_no) in enumerate(cursor.fetchall()):
                        es_correcta = indice < ok
                        elegidas.append((pregunta_id, alt_ok if es_correcta else alt_no))
                        if es_correcta:
                            correctas += 1
                        else:
                            incorrectas += 1

                inicio = datetime.now() - timedelta(days=dias, seconds=segundos)
                fin = inicio + timedelta(seconds=segundos)

                cursor.execute("""
                    INSERT INTO intentos (
                        usuario_id, examen_id, modo, fecha_sorteo,
                        fecha_inicio, fecha_fin, puntaje,
                        correctas, incorrectas, en_blanco, segundos_usados
                    )
                    VALUES (%s, %s, 'simulacro', %s, %s, %s, %s, %s, %s, 0, %s)
                    RETURNING id;
                """, (
                    maria, examen_id, inicio.date(), inicio, fin,
                    correctas, correctas, incorrectas, segundos,
                ))
                intento_id = cursor.fetchone()[0]

                for orden, (pregunta_id, alternativa_id) in enumerate(elegidas, start=1):
                    cursor.execute("""
                        INSERT INTO intento_preguntas (intento_id, pregunta_id, orden)
                        VALUES (%s, %s, %s);
                    """, (intento_id, pregunta_id, orden))
                    cursor.execute("""
                        INSERT INTO respuestas (intento_id, pregunta_id, alternativa_id)
                        VALUES (%s, %s, %s);
                    """, (intento_id, pregunta_id, alternativa_id))

            conexion.commit()

            print("SIEMBRA OK")
            print(f"  Preguntas:  {len(PREGUNTAS)}")
            print(f"  Exámenes:   {len(EXAMENES)} con sus bancos")
            print(f"  Usuarios:   {len(USUARIOS)} demo + 1 admin ({ADMIN[0]} / {ADMIN[2]})")
            print(f"  Pagos:      {len(PAGOS)}  | Cupones: {len(CUPONES)}")
            print(f"  Historial:  {len(RESULTADOS_MARIA)} resultados de María")

    except Exception:
        conexion.rollback()
        raise
    finally:
        conexion.close()


if __name__ == "__main__":
    main()
