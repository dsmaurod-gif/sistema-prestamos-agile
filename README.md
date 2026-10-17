# Sistema de Gestión de Préstamos (MVP) — Agile Development

Sistema web para las 5 sedes (Chimbote, Trujillo, Chiclayo, Piura, Tumbes). Uso exclusivo de trabajadores y administradores.

## Estructura del repositorio

```
/docs        Requerimientos, HU y criterios, plan, contrato de API
/sql         Scripts de base de datos (01..07), se ejecutan en orden
/supabase    Funciones de servidor (consulta de DNI)
/<frontend>  Aplicación web (nombre según el framework elegido)
/scripts     Pruebas de conexión en Node
```

## Empezar (cada integrante)

1. Clonar el repositorio y cambiar a `develop`:
   ```bash
   git clone <URL-DEL-REPO> && cd <carpeta> && git checkout develop
   ```
2. Instalar dependencias: `npm install` (en la carpeta del frontend).
3. Copiar `.env.example` a `.env` y completar con los valores que te pasa el integrador (A).
4. Arrancar en modo desarrollo: `npm run dev` (o `npm start`, según el framework).
5. Iniciar sesión con uno de los usuarios de prueba (te los pasa A por privado).
6. Leer **`CONTRIBUTING.md`** (ramas y Pull Requests) y **`docs/CONTRATO_API.md`** (qué se puede llamar) antes de escribir código.

## Documentos

| Archivo | Para qué |
|---|---|
| `docs/03_entregable_requerimientos_hu_ca.md` | Historias de usuario y criterios de aceptación (lo que se prueba) |
| `docs/02_plan_de_trabajo.md` | Reparto, calendario y guion de la demo |
| `docs/CONTRATO_API.md` | Funciones de la base de datos y cómo llamarlas |
| `CONTRIBUTING.md` | Flujo de ramas, commits y PR |
