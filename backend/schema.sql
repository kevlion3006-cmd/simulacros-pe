-- ============================================================
-- SIMULACROS PE — ESQUEMA V2
-- Compatible con la base local (pgAdmin) y con la nube (Neon/Render).
-- Ejecutar con: psql -f schema.sql   (o desde pgAdmin)
-- Es idempotente: se puede ejecutar más de una vez sin romper nada.
-- ============================================================


-- ============================================================
-- 1. TABLAS NUEVAS (se crean primero por las dependencias)
-- ============================================================

-- Pool de preguntas compartido: una misma pregunta puede estar
-- en varios exámenes (el frontend usa pools cruzados).
CREATE TABLE IF NOT EXISTS examen_preguntas (
    examen_id   integer NOT NULL REFERENCES examenes(id) ON DELETE CASCADE,
    pregunta_id integer NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE,
    PRIMARY KEY (examen_id, pregunta_id)
);

-- Pagos Yape (el estudiante registra la operación, el admin la aprueba)
CREATE TABLE IF NOT EXISTS pagos (
    id          serial PRIMARY KEY,
    usuario_id  integer NOT NULL REFERENCES usuarios(id),
    plan        varchar NOT NULL,              -- id de la matriz: dia-basico ... anio-completo
    monto       numeric NOT NULL,
    operacion   varchar NOT NULL,
    comprobante text,                          -- URL o base64 de la captura
    cupon       varchar,
    estado      varchar NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    motivo      text,                           -- motivo de rechazo
    fecha       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revisado_at timestamp
);

-- Cupones de descuento
CREATE TABLE IF NOT EXISTS cupones (
    codigo     varchar PRIMARY KEY,
    porcentaje integer NOT NULL,
    activo     boolean NOT NULL DEFAULT true,
    vence      date,
    max_usos   integer,
    usados     integer NOT NULL DEFAULT 0
);

-- Ajustes del sitio (clave/valor JSON): yape, metas, límites, planes...
CREATE TABLE IF NOT EXISTS ajustes (
    clave varchar PRIMARY KEY,
    valor jsonb NOT NULL
);

-- Reportes de preguntas (estudiante marca una pregunta con error)
CREATE TABLE IF NOT EXISTS reportes (
    id            serial PRIMARY KEY,
    pregunta_id   integer NOT NULL REFERENCES preguntas(id),
    usuario_id    integer REFERENCES usuarios(id),
    motivo        varchar NOT NULL,
    nota          text,
    estado        varchar NOT NULL DEFAULT 'open',  -- open | resolved
    respuesta     text,
    fecha         timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    respondido_at timestamp
);

-- Bitácora de acciones del admin
CREATE TABLE IF NOT EXISTS auditoria (
    id     serial PRIMARY KEY,
    fecha  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quien  varchar NOT NULL,
    accion varchar NOT NULL,
    detalle text
);

-- Estadísticas de aciertos por pregunta (n = veces rendida, ok = aciertos)
CREATE TABLE IF NOT EXISTS qstats (
    pregunta_id integer PRIMARY KEY REFERENCES preguntas(id),
    n           integer NOT NULL DEFAULT 0,
    ok          integer NOT NULL DEFAULT 0
);

-- Eventos de la app (funnel: visitas, registros, pagos...)
CREATE TABLE IF NOT EXISTS eventos (
    id         serial PRIMARY KEY,
    usuario_id integer REFERENCES usuarios(id),
    accion     varchar NOT NULL,
    detalle    text,
    fecha      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 2. MIGRACIÓN DE LAS TABLAS EXISTENTES (se añaden columnas)
-- ============================================================

-- usuarios: planes, rol, referidos y meta
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol        varchar NOT NULL DEFAULT 'estudiante';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plan       varchar;               -- dia-basico ... anio-completo | NULL
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plan_hasta timestamp;             -- vencimiento de la suscripción
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo     boolean NOT NULL DEFAULT true;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ref_code   varchar;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS referido_por integer REFERENCES usuarios(id);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS meta_uni   varchar;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS meta_fecha date;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tema       varchar NOT NULL DEFAULT 'auto';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS universidad varchar;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS facultad   varchar;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS escuela    varchar;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_key  ON usuarios(email);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_ref_code_key ON usuarios(ref_code);

-- examenes: publicación y escala de calificación
ALTER TABLE examenes ADD COLUMN IF NOT EXISTS publicado boolean NOT NULL DEFAULT true;
ALTER TABLE examenes ADD COLUMN IF NOT EXISTS escala    integer NOT NULL DEFAULT 20;  -- 0 = puntos directos, 20 = escala 0-20

-- preguntas: prueba gratis, activación y bandera de examen legacy
ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS gratis  boolean NOT NULL DEFAULT false;
ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS activa  boolean NOT NULL DEFAULT true;

-- clave pública (ej. 'a1', 'm3') que usa el frontend en poolIds, qstats y reportes
ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS clave varchar;
CREATE UNIQUE INDEX IF NOT EXISTS preguntas_clave_key ON preguntas(clave);

-- imágenes de la pregunta: objetos {url, alt} en base64 (dataURL)
ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS imagen          jsonb;
ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS sustento_imagen jsonb;

-- universidades que clasifican la pregunta; códigos separados por | (ej. 'UNI|UNMSM')
ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS universidad varchar(120);

-- Migrar la relación 1:N antigua (preguntas.examen_id) al pool muchOS-a-muchos
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'preguntas' AND column_name = 'examen_id'
    ) THEN
        INSERT INTO examen_preguntas (examen_id, pregunta_id)
        SELECT examen_id, id FROM preguntas WHERE examen_id IS NOT NULL
        ON CONFLICT DO NOTHING;

        ALTER TABLE preguntas DROP COLUMN examen_id;
    END IF;
END $$;

-- alternativas: orden estable de A/B/C/D
ALTER TABLE alternativas ADD COLUMN IF NOT EXISTS orden integer NOT NULL DEFAULT 0;
UPDATE alternativas a SET orden = sub.rn
FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY pregunta_id ORDER BY id) AS rn
    FROM alternativas
) sub
WHERE a.id = sub.id AND a.orden = 0;

-- intentos: modo práctica, fecha del sorteo diario y tiempo usado
ALTER TABLE intentos ADD COLUMN IF NOT EXISTS modo          varchar NOT NULL DEFAULT 'simulacro';
ALTER TABLE intentos ADD COLUMN IF NOT EXISTS fecha_sorteo  date;
ALTER TABLE intentos ADD COLUMN IF NOT EXISTS segundos_usados integer;

-- La práctica libre no pertenece a ningún examen
ALTER TABLE intentos ALTER COLUMN examen_id DROP NOT NULL;

-- usuarios de prueba antiguos: conservarlos, pero sin contraseña inventada
UPDATE usuarios SET password_hash = 'pbkdf2$100000$invalida$invalida'
WHERE password_hash NOT LIKE 'pbkdf2$%' AND password_hash <> ''
  AND password_hash IS NOT NULL;


-- ============================================================
-- 3. DATOS BASE
-- ============================================================

-- Reglas de calificación para los 5 exámenes (si no existen)
INSERT INTO reglas_calificacion (examen_id, puntos_correcta, puntos_incorrecta, puntos_blanco)
SELECT e.id, 1, 0, 0
FROM examenes e
WHERE NOT EXISTS (SELECT 1 FROM reglas_calificacion r WHERE r.examen_id = e.id);
