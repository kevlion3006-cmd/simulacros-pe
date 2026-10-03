--
-- PostgreSQL database dump
--

\restrict 2cmfFCdsl0xz38HdwMDyfma3CMTSdl8hXXuS4RRUF5vqzhfFXOQbJFhG8D4caFA

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ajustes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ajustes (
    clave character varying NOT NULL,
    valor jsonb NOT NULL
);


--
-- Name: alternativas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alternativas (
    id integer NOT NULL,
    pregunta_id integer NOT NULL,
    texto text NOT NULL,
    es_correcta boolean DEFAULT false,
    orden integer DEFAULT 0 NOT NULL
);


--
-- Name: alternativas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alternativas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alternativas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alternativas_id_seq OWNED BY public.alternativas.id;


--
-- Name: areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.areas (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    activa boolean DEFAULT true
);


--
-- Name: areas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.areas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: areas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.areas_id_seq OWNED BY public.areas.id;


--
-- Name: auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria (
    id integer NOT NULL,
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    quien character varying NOT NULL,
    accion character varying NOT NULL,
    detalle text
);


--
-- Name: auditoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auditoria_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auditoria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auditoria_id_seq OWNED BY public.auditoria.id;


--
-- Name: cupones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cupones (
    codigo character varying NOT NULL,
    porcentaje integer NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    vence date,
    max_usos integer,
    usados integer DEFAULT 0 NOT NULL
);


--
-- Name: cursos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cursos (
    id integer NOT NULL,
    area_id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    activo boolean DEFAULT true
);


--
-- Name: cursos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cursos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cursos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cursos_id_seq OWNED BY public.cursos.id;


--
-- Name: eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos (
    id integer NOT NULL,
    usuario_id integer,
    accion character varying NOT NULL,
    detalle text,
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: eventos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.eventos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: eventos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.eventos_id_seq OWNED BY public.eventos.id;


--
-- Name: examen_preguntas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.examen_preguntas (
    examen_id integer NOT NULL,
    pregunta_id integer NOT NULL
);


--
-- Name: examenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.examenes (
    id integer NOT NULL,
    universidad_id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    duracion_segundos integer NOT NULL,
    activo boolean DEFAULT true,
    tipo character varying(30) DEFAULT 'simulacro'::character varying,
    cantidad_preguntas integer,
    publicado boolean DEFAULT true NOT NULL,
    escala integer DEFAULT 20 NOT NULL
);


--
-- Name: examenes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.examenes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: examenes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.examenes_id_seq OWNED BY public.examenes.id;


--
-- Name: intento_preguntas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intento_preguntas (
    id integer NOT NULL,
    intento_id integer NOT NULL,
    pregunta_id integer NOT NULL,
    orden integer NOT NULL
);


--
-- Name: intento_preguntas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.intento_preguntas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: intento_preguntas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.intento_preguntas_id_seq OWNED BY public.intento_preguntas.id;


--
-- Name: intentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intentos (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    examen_id integer,
    fecha_inicio timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_fin timestamp without time zone,
    puntaje numeric(10,2),
    correctas integer DEFAULT 0,
    incorrectas integer DEFAULT 0,
    en_blanco integer DEFAULT 0,
    modo character varying DEFAULT 'simulacro'::character varying NOT NULL,
    fecha_sorteo date,
    segundos_usados integer
);


--
-- Name: intentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.intentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: intentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.intentos_id_seq OWNED BY public.intentos.id;


--
-- Name: pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    plan character varying NOT NULL,
    monto numeric NOT NULL,
    operacion character varying NOT NULL,
    comprobante text,
    cupon character varying,
    estado character varying DEFAULT 'pending'::character varying NOT NULL,
    motivo text,
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revisado_at timestamp without time zone
);


--
-- Name: pagos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pagos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pagos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pagos_id_seq OWNED BY public.pagos.id;


--
-- Name: preguntas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preguntas (
    id integer NOT NULL,
    area character varying(100) NOT NULL,
    texto text NOT NULL,
    sustento text,
    curso character varying(100),
    tema character varying(150),
    dificultad character varying(20),
    tema_id integer,
    gratis boolean DEFAULT false NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    clave character varying,
    imagen jsonb,
    sustento_imagen jsonb
);


--
-- Name: preguntas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.preguntas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: preguntas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.preguntas_id_seq OWNED BY public.preguntas.id;


--
-- Name: qstats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qstats (
    pregunta_id integer NOT NULL,
    n integer DEFAULT 0 NOT NULL,
    ok integer DEFAULT 0 NOT NULL
);


--
-- Name: reglas_calificacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reglas_calificacion (
    id integer NOT NULL,
    examen_id integer NOT NULL,
    puntos_correcta numeric(10,3) NOT NULL,
    puntos_incorrecta numeric(10,3) NOT NULL,
    puntos_blanco numeric(10,3) DEFAULT 0
);


--
-- Name: reglas_calificacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reglas_calificacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reglas_calificacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reglas_calificacion_id_seq OWNED BY public.reglas_calificacion.id;


--
-- Name: reportes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reportes (
    id integer NOT NULL,
    pregunta_id integer NOT NULL,
    usuario_id integer,
    motivo character varying NOT NULL,
    nota text,
    estado character varying DEFAULT 'open'::character varying NOT NULL,
    respuesta text,
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    respondido_at timestamp without time zone
);


--
-- Name: reportes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reportes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reportes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reportes_id_seq OWNED BY public.reportes.id;


--
-- Name: respuestas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.respuestas (
    id integer NOT NULL,
    intento_id integer NOT NULL,
    pregunta_id integer NOT NULL,
    alternativa_id integer
);


--
-- Name: respuestas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.respuestas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: respuestas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.respuestas_id_seq OWNED BY public.respuestas.id;


--
-- Name: temas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.temas (
    id integer NOT NULL,
    curso_id integer NOT NULL,
    nombre character varying(150) NOT NULL,
    activo boolean DEFAULT true
);


--
-- Name: temas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.temas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: temas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.temas_id_seq OWNED BY public.temas.id;


--
-- Name: universidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.universidades (
    id integer NOT NULL,
    nombre character varying(150) NOT NULL,
    codigo character varying(20) NOT NULL,
    activa boolean DEFAULT true,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: universidades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.universidades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: universidades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.universidades_id_seq OWNED BY public.universidades.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    nombre character varying(150) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    fecha_registro timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    telefono character varying(20),
    rol character varying DEFAULT 'estudiante'::character varying NOT NULL,
    plan character varying,
    plan_hasta timestamp without time zone,
    activo boolean DEFAULT true NOT NULL,
    ref_code character varying,
    referido_por integer,
    meta_uni character varying,
    meta_fecha date,
    tema character varying DEFAULT 'auto'::character varying NOT NULL,
    universidad character varying,
    facultad character varying,
    escuela character varying
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: alternativas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alternativas ALTER COLUMN id SET DEFAULT nextval('public.alternativas_id_seq'::regclass);


--
-- Name: areas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas ALTER COLUMN id SET DEFAULT nextval('public.areas_id_seq'::regclass);


--
-- Name: auditoria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria ALTER COLUMN id SET DEFAULT nextval('public.auditoria_id_seq'::regclass);


--
-- Name: cursos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cursos ALTER COLUMN id SET DEFAULT nextval('public.cursos_id_seq'::regclass);


--
-- Name: eventos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos ALTER COLUMN id SET DEFAULT nextval('public.eventos_id_seq'::regclass);


--
-- Name: examenes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.examenes ALTER COLUMN id SET DEFAULT nextval('public.examenes_id_seq'::regclass);


--
-- Name: intento_preguntas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intento_preguntas ALTER COLUMN id SET DEFAULT nextval('public.intento_preguntas_id_seq'::regclass);


--
-- Name: intentos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intentos ALTER COLUMN id SET DEFAULT nextval('public.intentos_id_seq'::regclass);


--
-- Name: pagos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos ALTER COLUMN id SET DEFAULT nextval('public.pagos_id_seq'::regclass);


--
-- Name: preguntas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preguntas ALTER COLUMN id SET DEFAULT nextval('public.preguntas_id_seq'::regclass);


--
-- Name: reglas_calificacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_calificacion ALTER COLUMN id SET DEFAULT nextval('public.reglas_calificacion_id_seq'::regclass);


--
-- Name: reportes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes ALTER COLUMN id SET DEFAULT nextval('public.reportes_id_seq'::regclass);


--
-- Name: respuestas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respuestas ALTER COLUMN id SET DEFAULT nextval('public.respuestas_id_seq'::regclass);


--
-- Name: temas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.temas ALTER COLUMN id SET DEFAULT nextval('public.temas_id_seq'::regclass);


--
-- Name: universidades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.universidades ALTER COLUMN id SET DEFAULT nextval('public.universidades_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: ajustes ajustes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ajustes
    ADD CONSTRAINT ajustes_pkey PRIMARY KEY (clave);


--
-- Name: alternativas alternativas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alternativas
    ADD CONSTRAINT alternativas_pkey PRIMARY KEY (id);


--
-- Name: areas areas_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_nombre_key UNIQUE (nombre);


--
-- Name: areas areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_pkey PRIMARY KEY (id);


--
-- Name: auditoria auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (id);


--
-- Name: cupones cupones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupones
    ADD CONSTRAINT cupones_pkey PRIMARY KEY (codigo);


--
-- Name: cursos cursos_area_id_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cursos
    ADD CONSTRAINT cursos_area_id_nombre_key UNIQUE (area_id, nombre);


--
-- Name: cursos cursos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cursos
    ADD CONSTRAINT cursos_pkey PRIMARY KEY (id);


--
-- Name: eventos eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_pkey PRIMARY KEY (id);


--
-- Name: examen_preguntas examen_preguntas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.examen_preguntas
    ADD CONSTRAINT examen_preguntas_pkey PRIMARY KEY (examen_id, pregunta_id);


--
-- Name: examenes examenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.examenes
    ADD CONSTRAINT examenes_pkey PRIMARY KEY (id);


--
-- Name: intento_preguntas intento_preguntas_intento_id_orden_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intento_preguntas
    ADD CONSTRAINT intento_preguntas_intento_id_orden_key UNIQUE (intento_id, orden);


--
-- Name: intento_preguntas intento_preguntas_intento_id_pregunta_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intento_preguntas
    ADD CONSTRAINT intento_preguntas_intento_id_pregunta_id_key UNIQUE (intento_id, pregunta_id);


--
-- Name: intento_preguntas intento_preguntas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intento_preguntas
    ADD CONSTRAINT intento_preguntas_pkey PRIMARY KEY (id);


--
-- Name: intentos intentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intentos
    ADD CONSTRAINT intentos_pkey PRIMARY KEY (id);


--
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (id);


--
-- Name: preguntas preguntas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preguntas
    ADD CONSTRAINT preguntas_pkey PRIMARY KEY (id);


--
-- Name: qstats qstats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qstats
    ADD CONSTRAINT qstats_pkey PRIMARY KEY (pregunta_id);


--
-- Name: reglas_calificacion reglas_calificacion_examen_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_calificacion
    ADD CONSTRAINT reglas_calificacion_examen_id_key UNIQUE (examen_id);


--
-- Name: reglas_calificacion reglas_calificacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_calificacion
    ADD CONSTRAINT reglas_calificacion_pkey PRIMARY KEY (id);


--
-- Name: reportes reportes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes
    ADD CONSTRAINT reportes_pkey PRIMARY KEY (id);


--
-- Name: respuestas respuestas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respuestas
    ADD CONSTRAINT respuestas_pkey PRIMARY KEY (id);


--
-- Name: respuestas respuestas_unicas_por_pregunta; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respuestas
    ADD CONSTRAINT respuestas_unicas_por_pregunta UNIQUE (intento_id, pregunta_id);


--
-- Name: temas temas_curso_id_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.temas
    ADD CONSTRAINT temas_curso_id_nombre_key UNIQUE (curso_id, nombre);


--
-- Name: temas temas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.temas
    ADD CONSTRAINT temas_pkey PRIMARY KEY (id);


--
-- Name: universidades universidades_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.universidades
    ADD CONSTRAINT universidades_codigo_key UNIQUE (codigo);


--
-- Name: universidades universidades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.universidades
    ADD CONSTRAINT universidades_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: preguntas_clave_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX preguntas_clave_key ON public.preguntas USING btree (clave);


--
-- Name: usuarios_ref_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_ref_code_key ON public.usuarios USING btree (ref_code);


--
-- Name: alternativas alternativas_pregunta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alternativas
    ADD CONSTRAINT alternativas_pregunta_id_fkey FOREIGN KEY (pregunta_id) REFERENCES public.preguntas(id);


--
-- Name: cursos cursos_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cursos
    ADD CONSTRAINT cursos_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id);


--
-- Name: eventos eventos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: examen_preguntas examen_preguntas_examen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.examen_preguntas
    ADD CONSTRAINT examen_preguntas_examen_id_fkey FOREIGN KEY (examen_id) REFERENCES public.examenes(id) ON DELETE CASCADE;


--
-- Name: examen_preguntas examen_preguntas_pregunta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.examen_preguntas
    ADD CONSTRAINT examen_preguntas_pregunta_id_fkey FOREIGN KEY (pregunta_id) REFERENCES public.preguntas(id) ON DELETE CASCADE;


--
-- Name: examenes examenes_universidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.examenes
    ADD CONSTRAINT examenes_universidad_id_fkey FOREIGN KEY (universidad_id) REFERENCES public.universidades(id);


--
-- Name: preguntas fk_preguntas_tema; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preguntas
    ADD CONSTRAINT fk_preguntas_tema FOREIGN KEY (tema_id) REFERENCES public.temas(id);


--
-- Name: intento_preguntas intento_preguntas_intento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intento_preguntas
    ADD CONSTRAINT intento_preguntas_intento_id_fkey FOREIGN KEY (intento_id) REFERENCES public.intentos(id);


--
-- Name: intento_preguntas intento_preguntas_pregunta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intento_preguntas
    ADD CONSTRAINT intento_preguntas_pregunta_id_fkey FOREIGN KEY (pregunta_id) REFERENCES public.preguntas(id);


--
-- Name: intentos intentos_examen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intentos
    ADD CONSTRAINT intentos_examen_id_fkey FOREIGN KEY (examen_id) REFERENCES public.examenes(id);


--
-- Name: intentos intentos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intentos
    ADD CONSTRAINT intentos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: pagos pagos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: qstats qstats_pregunta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qstats
    ADD CONSTRAINT qstats_pregunta_id_fkey FOREIGN KEY (pregunta_id) REFERENCES public.preguntas(id);


--
-- Name: reglas_calificacion reglas_calificacion_examen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_calificacion
    ADD CONSTRAINT reglas_calificacion_examen_id_fkey FOREIGN KEY (examen_id) REFERENCES public.examenes(id);


--
-- Name: reportes reportes_pregunta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes
    ADD CONSTRAINT reportes_pregunta_id_fkey FOREIGN KEY (pregunta_id) REFERENCES public.preguntas(id);


--
-- Name: reportes reportes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes
    ADD CONSTRAINT reportes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: respuestas respuestas_alternativa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respuestas
    ADD CONSTRAINT respuestas_alternativa_id_fkey FOREIGN KEY (alternativa_id) REFERENCES public.alternativas(id);


--
-- Name: respuestas respuestas_intento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respuestas
    ADD CONSTRAINT respuestas_intento_id_fkey FOREIGN KEY (intento_id) REFERENCES public.intentos(id);


--
-- Name: respuestas respuestas_pregunta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respuestas
    ADD CONSTRAINT respuestas_pregunta_id_fkey FOREIGN KEY (pregunta_id) REFERENCES public.preguntas(id);


--
-- Name: temas temas_curso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.temas
    ADD CONSTRAINT temas_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES public.cursos(id);


--
-- Name: usuarios usuarios_referido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_referido_por_fkey FOREIGN KEY (referido_por) REFERENCES public.usuarios(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 2cmfFCdsl0xz38HdwMDyfma3CMTSdl8hXXuS4RRUF5vqzhfFXOQbJFhG8D4caFA

