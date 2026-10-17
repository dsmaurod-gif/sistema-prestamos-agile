// Genera frontend/src/environments/environment.ts con la URL y la llave pública.
// Lee el .env de la raíz (o variables ya definidas, p. ej. en el despliegue). El archivo generado no se sube a git.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));

try {
  process.loadEnvFile(`${raiz}.env`);
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

const url = process.env.SUPABASE_URL;
const llave = process.env.SUPABASE_PUBLISHABLE_KEY;

function salirConError(mensaje) {
  console.error(`❌ ${mensaje}`);
  process.exit(1);
}

if (!url || !llave) salirConError('Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY en el .env de la raíz (ver .env.example).');
if (llave.startsWith('sb_secret_')) salirConError('La llave es secreta (sb_secret_). Usa la llave pública.');
const partes = llave.split('.');
if (partes.length === 3) {
  let rol;
  try {
    rol = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')).role;
  } catch {
    salirConError('La llave parece un JWT pero no se pudo leer.');
  }
  if (rol !== 'anon') salirConError(`La llave tiene rol "${rol}", debe ser "anon".`);
}

const carpeta = `${raiz}frontend/src/environments`;
mkdirSync(carpeta, { recursive: true });
writeFileSync(
  `${carpeta}/environment.ts`,
  `// Generado por scripts/generar-entorno-frontend.mjs. No editar ni subir a git.
export const environment = {
  supabaseUrl: ${JSON.stringify(url)},
  supabasePublishableKey: ${JSON.stringify(llave)},
};
`,
);
