# Sistema de Gestión de Préstamos (MVP) — Agile Development

Sistema web para las 5 sedes (Chimbote, Trujillo, Chiclayo, Piura, Tumbes). Uso exclusivo de trabajadores y administradores.

## Estructura del repositorio

```
/docs                Requerimientos, HU y criterios, plan, contrato de API
/sql                 Scripts de base de datos (01..07), se ejecutan en orden
/supabase/functions  Funciones de servidor (consulta de DNI)
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

## Documentos

| Archivo | Para qué |
|---|---|
| `docs/03_entregable_requerimientos_hu_ca.md` | Historias de usuario y criterios de aceptación (lo que se prueba) |
| `docs/02_plan_de_trabajo.md` | Reparto, calendario y guion de la demo |
| `docs/CONTRATO_API.md` | Funciones de la base de datos y cómo llamarlas |
| `CONTRIBUTING.md` | Flujo de ramas, commits y PR |
