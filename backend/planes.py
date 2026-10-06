"""
Matriz de planes: 4 periodos x 3 niveles de acceso.

Cada plan se guarda con un id compuesto (periodo + nivel), por ejemplo
"mes-completo", así el periodo y el nivel viajan juntos en una sola
columna (usuarios.plan y pagos.plan) y no hace falta migrar tablas para
añadir niveles.

El nivel decide qué dificultades de preguntas se le pueden mostrar:
    Básico     -> solo fáciles
    Intermedio -> fáciles + intermedias
    Completo   -> las 3 dificultades

Los 4 periodos incluyen las mismas 3 modalidades de examen (estándar,
personalizado y en grupo), así que aquí solo se define duración y precio.

Módulo sin dependencias ni de FastAPI ni de la base de datos: lo usan
ayudas.py, main.py, rutas_admin.py y seed.py.
"""

# (id, nombre, días)
PERIODOS = [
    ("dia", "Día", 1),
    ("semana", "Semana", 7),
    ("mes", "Mes", 30),
    ("anio", "Año", 365),
]

# (id, nombre, dificultades que abre, descripción)
NIVELES = [
    ("basico", "Básico", ("facil",), "Solo preguntas fáciles"),
    ("intermedio", "Intermedio", ("facil", "intermedio"), "Fáciles e intermedias"),
    ("completo", "Completo", ("facil", "intermedio", "dificil"), "Los 3 niveles"),
]

TODAS_DIFICULTADES = ("facil", "intermedio", "dificil")

# Precios en soles, uno por celda de la matriz.
PRECIOS = {
    "dia": {"basico": 1, "intermedio": 2, "completo": 3},
    "semana": {"basico": 5, "intermedio": 8, "completo": 10},
    "mes": {"basico": 15, "intermedio": 23, "completo": 30},
    "anio": {"basico": 100, "intermedio": 120, "completo": 150},
}

# Ids antiguos (antes solo existía el periodo): apuntan al nivel completo,
# que es lo que incluían los 3 planes originales.
PLANES_ANTIGUOS = {
    "dia": "dia-completo",
    "semana": "semana-completo",
    "mes": "mes-completo",
}


def unidad(dias):
    """Etiqueta corta del precio: S/ 15 <small>/mes</small>."""
    if dias == 1:
        return "/día"
    if dias == 7:
        return "/sem"
    if dias == 30:
        return "/mes"
    if dias == 365:
        return "/año"
    return f"/{dias} días"


def descripcion(dias):
    return "Acceso por 24 horas" if dias == 1 else f"Acceso por {dias} días"


def ahorro(precio, dias, nivel_id):
    """Ahorro por día frente al mismo nivel del plan de un día (la referencia)."""
    base = PRECIOS["dia"].get(nivel_id)
    if not base or not dias:
        return 0
    return max(0, round((1 - (precio / dias) / base) * 100))


def texto_ahorro(precio, dias, nivel_id):
    pct = ahorro(precio, dias, nivel_id)
    return f"Ahorras {pct} % frente al plan Día" if pct > 0 else ""


def planes_por_defecto():
    """Las 12 celdas de la matriz, en orden: periodo (fuera) y nivel (dentro)."""
    planes = []
    for periodo_id, periodo_nombre, dias in PERIODOS:
        for nivel_id, nivel_nombre, _difs, _desc in NIVELES:
            precio = PRECIOS[periodo_id][nivel_id]
            planes.append({
                "id": f"{periodo_id}-{nivel_id}",
                "periodo": periodo_id,
                "nivel": nivel_id,
                "name": f"{periodo_nombre} {nivel_nombre}",
                "price": precio,
                "unit": unidad(dias),
                "ms": dias * 86400000,
                "text": descripcion(dias),
                "per": f"S/ {precio / dias:.2f} por día",
                "save": texto_ahorro(precio, dias, nivel_id),
                # El plan que se usa para marcar "Más elegido" en la web.
                "best": nivel_id == "intermedio",
            })
    return planes


def nivel_de_plan(plan_id):
    """Nivel (basico/intermedio/completo) de un id de plan, o None si no se conoce."""
    if not plan_id:
        return None
    if plan_id in PLANES_ANTIGUOS:
        # Los planes viejos daban todas las dificultades.
        return "completo"
    nivel = str(plan_id).rsplit("-", 1)[-1]
    return nivel if any(n[0] == nivel for n in NIVELES) else None


def periodo_de_plan(plan_id):
    """Periodo (dia/semana/mes/anio) de un id de plan, o None si no se conoce."""
    if not plan_id:
        return None
    if plan_id in PLANES_ANTIGUOS:
        return str(plan_id)
    periodo = str(plan_id).split("-", 1)[0]
    return periodo if any(p[0] == periodo for p in PERIODOS) else None


def resolver_plan(planes, plan_id):
    """Plan buscado dentro de la lista de ajustes; acepta también los ids antiguos."""
    if not plan_id:
        return None
    for p in planes:
        if p.get("id") == plan_id:
            return p
    viejo = PLANES_ANTIGUOS.get(plan_id)
    if viejo:
        for p in planes:
            if p.get("id") == viejo:
                return p
    return None


def dificultades_de_plan(plan_id):
    """Dificultades que puede practicar quien tiene ese plan.

    Un id desconocido abre todas: nadie se queda sin preguntas por un id
    raro. Quien no tiene plan no llega aquí (tiene_acceso lo para antes).
    """
    nivel = nivel_de_plan(plan_id)
    if not nivel:
        return TODAS_DIFICULTADES
    for nivel_id, _nombre, dificultades, _desc in NIVELES:
        if nivel_id == nivel:
            return tuple(dificultades)
    return TODAS_DIFICULTADES


def etiqueta_plan(plan_id):
    """Nombre para mostrar: 'Mes Completo'; con ids antiguos, 'Mes'."""
    periodo = periodo_de_plan(plan_id)
    nivel = nivel_de_plan(plan_id)
    if not periodo or not nivel:
        return str(plan_id or "")
    nombre_periodo = next((p[1] for p in PERIODOS if p[0] == periodo), "")
    nombre_nivel = next((n[1] for n in NIVELES if n[0] == nivel), "")
    return f"{nombre_periodo} {nombre_nivel}".strip()
