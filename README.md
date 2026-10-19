# Sistema de Gestión de Préstamos (MVP) — Agile Development

Sistema web para las 5 sedes (Chimbote, Trujillo, Chiclayo, Piura, Tumbes). Uso exclusivo de trabajadores y administradores.

## Estructura del repositorio

```
/docs                Requerimientos, HU y criterios, plan, contrato de API
/sql                 Scripts de base de datos (01..11, más 04b, 05b y 11b), se ejecutan en orden
/supabase/functions  Edge Functions (consultar-dni, consultar-ruc)
/scripts             Verificación del entorno y configuración del frontend (Node)
/frontend            Aplicación web (Angular + Tailwind CSS)
  src/app/core         Cliente de Supabase, tipos del contrato, guardias y formato
  src/app/services     Única capa que llama a Supabase (auth, clientes, préstamos, reportes, demo)
  src/app/pages        Una página por pantalla (indica las HU que implementa)
  src/app/components   Layout con menú por rol y aviso reutilizable
```

## Empezar (cada integrante)

1. Clonar el repositorio y cambiar a `develop`:
   ```bash
   git clone <URL-DEL-REPO> && cd <carpeta> && git checkout develop
   ```
2. Copiar `.env.example` a `.env` (en la raíz) y completar con los valores que te pasa el integrador (A). El mismo `.env` sirve para los scripts y para el frontend.
3. Instalar dependencias y verificar el entorno:
   ```bash
   npm install
   npm run verificar        # debe terminar sin ❌
   cd frontend && npm install
   ```
4. Arrancar en modo desarrollo (desde `frontend/`): `npm start` y abrir http://localhost:4200
5. Antes de abrir un PR (desde `frontend/`): `npm run lint` y `npm run build`.
6. Iniciar sesión con uno de los usuarios de prueba (te los pasa A por privado).
7. Leer **`CONTRIBUTING.md`** (ramas y Pull Requests) y **`docs/CONTRATO_API.md`** (qué se puede llamar) antes de escribir código.

> `npm start` y `npm run build` generan `frontend/src/environments/environment.ts` a partir del `.env` (ese archivo no se sube a git).

## Despliegue en Vercel

El frontend es una SPA de Angular; la salida de `npm run build` queda en `frontend/dist/frontend/browser` y `frontend/vercel.json` ya define el comando, la carpeta y la reescritura de rutas hacia `index.html`.

1. En Vercel: **Add New → Project** e importa el repositorio de GitHub (rama de producción: `main`).
2. **Root Directory:** `frontend`.
3. **Build Command:** `npm run build` · **Output Directory:** `dist/frontend/browser` (también están en `vercel.json`).
4. Activa **Include source files outside of the Root Directory in the Build Step** (Settings → General → Root Directory). Es obligatorio: `prebuild` ejecuta `../scripts/generar-entorno-frontend.mjs`, que está fuera de `frontend/`.
5. **Node.js Version:** 22.x o superior (el script usa `process.loadEnvFile`).
6. **Environment Variables** (Production y Preview): `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. Solo la llave pública (`anon`/publishable), nunca la `service_role`.
7. Deploy. Prueba el login y recarga una ruta interna (por ejemplo `/clientes`): debe seguir funcionando gracias a la reescritura.

Las Edge Functions no se despliegan en Vercel: `supabase functions deploy consultar-dni` y `supabase functions deploy consultar-ruc` (el secret `PERU_API_TOKEN` vive en Supabase).

## Documentos

| Archivo | Para qué |
|---|---|
| `docs/03_entregable_requerimientos_hu_ca.md` | Historias de usuario y criterios de aceptación (lo que se prueba) |
| `docs/02_plan_de_trabajo.md` | Reparto, calendario y guion de la demo |
| `docs/CONTRATO_API.md` | Funciones de la base de datos y cómo llamarlas |
| `CONTRIBUTING.md` | Flujo de ramas, commits y PR |
