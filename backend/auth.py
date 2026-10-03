"""
Autenticación sin dependencias extra:
- Contraseñas: PBKDF2-SHA256 (hashlib de la biblioteca estándar).
- Sesiones: token firmado con HMAC-SHA256 (tipo JWT casero, sin librerías externas).
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

SECRETO = os.getenv("SECRET_KEY", "simulacros-pe-clave-desarrollo").encode()
ITERACIONES = 100_000
DURACION_TOKEN_DIAS = 7


# ============================================================
# CONTRASEÑAS
# ============================================================

def crear_hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digesto = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), ITERACIONES
    )
    return f"pbkdf2${ITERACIONES}${salt}${digesto.hex()}"


def verificar_password(password: str, guardado: str) -> bool:
    try:
        _, iteraciones, salt, digesto = guardado.split("$")
        calculado = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), salt.encode(), int(iteraciones)
        )
        return hmac.compare_digest(calculado.hex(), digesto)
    except (ValueError, AttributeError):
        return False


# ============================================================
# TOKENS
# ============================================================

def _b64(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode()


def _b64_inv(texto: str) -> bytes:
    padding = "=" * (-len(texto) % 4)
    return base64.urlsafe_b64decode(texto + padding)


def crear_token(usuario_id: int, dias: int = DURACION_TOKEN_DIAS) -> str:
    payload = {"u": usuario_id, "exp": int(time.time()) + dias * 86400}
    cuerpo = _b64(json.dumps(payload, separators=(",", ":")).encode())
    firma = hmac.new(SECRETO, cuerpo.encode(), hashlib.sha256).hexdigest()
    return f"{cuerpo}.{firma}"


def leer_token(token: str):
    """Devuelve el usuario_id o None si el token es inválido o venció."""
    try:
        cuerpo, firma = token.split(".")
        esperada = hmac.new(SECRETO, cuerpo.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(firma, esperada):
            return None
        payload = json.loads(_b64_inv(cuerpo))
        if payload.get("exp", 0) < time.time():
            return None
        return int(payload["u"])
    except (ValueError, KeyError, TypeError):
        return None
