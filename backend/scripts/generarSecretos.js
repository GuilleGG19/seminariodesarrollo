// Genera secretos aleatorios para el archivo .env (no escribe ningun archivo).
// Uso: npm run secretos
// Copia las lineas que imprime en backend/.env (y la contrasena de la base en el .env raiz).
const crypto = require('crypto');

const hex = (bytes) => crypto.randomBytes(bytes).toString('hex');

console.log(`# --- Pegar en backend/.env ---
JWT_SECRET=${hex(64)}
DATA_ENCRYPTION_KEY=${hex(32)}
DATA_HASH_KEY=${hex(32)}

# --- Contrasena nueva para PostgreSQL (opcional) ---
# 1) Cambiarla en la base:
#    docker exec sccvi_postgres psql -U sccvi_admin -d sccvi_db -c "ALTER USER sccvi_admin PASSWORD 'NUEVA'"
# 2) Poner la misma en DB_PASSWORD (backend/.env) y POSTGRES_PASSWORD (.env raiz)
NUEVA=${crypto.randomBytes(18).toString('base64url')}

# IMPORTANTE: DATA_ENCRYPTION_KEY y DATA_HASH_KEY no deben cambiar despues de cifrar
# datos; si se pierden, los datos cifrados no se pueden recuperar.`);
