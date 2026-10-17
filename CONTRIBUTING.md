# Guía de trabajo en equipo (ramas, PR y orden)

Objetivo: 4 personas, 3 días, **cero choques**. Reglas cortas y obligatorias.

## 1. Ramas

| Rama | Para qué | Quién la toca |
|---|---|---|
| `main` | Lo que se **muestra al profesor** (desplegado). Siempre estable. | Solo el integrador (A), por PR desde `develop` |
| `develop` | Integración diaria. Siempre debe compilar y arrancar. | Todos, **solo por Pull Request** |
| `feature/HU-xx-nombre-corto` | Una historia de usuario | Quien la tiene asignada |
| `fix/descripcion-corta` | Corrección de un error | Quien lo encuentra |
| `docs/descripcion-corta` | Documentación | Cualquiera |
| `hotfix/descripcion` | Error crítico tras el congelamiento (domingo 8 PM) | Integrador, sale desde `main` |

Ejemplos: `feature/HU-03-registro-cliente`, `feature/HU-06-evaluar-prestamo`, `fix/cronograma-redondeo`.

**Nadie hace `push` directo a `main` ni a `develop`.** (Si GitHub no deja bloquearlas en tu plan, es regla del equipo igualmente.)

## 2. Flujo diario (siempre igual)

```bash
git checkout develop && git pull                      # 1. partir de lo último
git checkout -b feature/HU-03-registro-cliente        # 2. rama nueva (una por historia)
# ... trabajar, commits pequeños ...
git fetch origin && git rebase origin/develop         # 3. traer cambios de los demás (al menos 2 veces al día)
git push -u origin feature/HU-03-registro-cliente     # 4. subir
# 5. abrir Pull Request hacia develop (usa la plantilla)
```

- Una rama = una historia. **Ramas de máximo medio día de vida.** Si es más grande, se parte en dos.
- Antes de pedir revisión: la app arranca, tus criterios de aceptación se cumplen y no rompiste nada.
- Si hay conflictos al hacer `rebase`, los resuelves tú, **no** el integrador.

## 3. Commits

Formato: `tipo(HU-xx): qué hiciste` en minúscula y presente.

```
feat(HU-03): registro de cliente con validación de DNI
fix(HU-08): cronograma no mostraba la última cuota
docs: actualiza contrato de API
chore: agrega .env.example
```
Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

## 4. Pull Requests

- Destino: **`develop`**. Título: `HU-03: registro de cliente`.
- Revisión: **mínimo 1 aprobación** (el integrador A revisa todas; otra persona puede aprobar también). Se revisa en menos de 1 hora; si no, avisar en el grupo.
- Merge con **Squash and merge** (historial limpio). El autor borra su rama después.
- **Ventanas de merge a `develop`:** cuando esté aprobado, sin esperar. Pero **nada entra después del congelamiento** (domingo 8 PM) sin que lo apruebe A.
- `main` se actualiza solo por PR `develop → main` hecho por A: **sábado 10 PM** y **domingo 8 PM** (versión de demo), con etiqueta `v0.x`.

## 5. Base de datos (regla de oro)

- **Nadie modifica tablas ni funciones desde el panel de Supabase.** Todo cambio de base va como archivo en `/sql` con número siguiente (`08_...sql`), en un PR.
- **Solo A ejecuta los `.sql` en Supabase** y avisa al grupo: "BD actualizada a 08".
- Si necesitas un cambio en la BD, abre un *issue* "BD: ..." describiendo qué necesitas; no lo hagas tú.
- Los datos de prueba se reinician con `sql/04_seed_demo.sql` (avisar antes: borra los clientes).

## 6. Qué NO se sube nunca

- `.env`, llaves de Supabase, contraseñas, `node_modules`, `dist/`. Está en `.gitignore`.
- Solo se sube `.env.example` (sin valores reales).
- **Nunca** usar ni compartir la llave `service_role` ni la contraseña de la base de datos. Solo la URL y la llave pública (`anon`).

## 7. Reglas de código

- Todas las llamadas a Supabase pasan por una **capa de servicios** (`services/`), no desde los componentes. Si la firma de una función SQL cambia, se corrige en un solo archivo.
- Las reglas de negocio **no se reescriben en el frontend**: se muestran los mensajes que devuelve la base de datos.
- Textos de la interfaz en español. Montos con 2 decimales y prefijo `S/`. Fechas `DD/MM/AAAA`.
- No se deja código comentado ni `console.log` en el PR.

## 8. Definición de "Hecho"

- Cumple **todos** los criterios de aceptación de la HU (están en `docs/`).
- Probada por **otra persona** con los casos de prueba.
- Mensajes de error claros.
- Mergeada a `develop` y funcionando.
- Tarjeta movida a "Hecho" en el tablero.

## 9. Comunicación

- Daily de 10 minutos a las **9 PM** por llamada: qué hice, qué haré, qué me bloquea.
- Un bloqueo de más de 30 minutos se avisa **en el momento** en el grupo.
- Al mergear: mensaje al grupo con la HU y la rama.
