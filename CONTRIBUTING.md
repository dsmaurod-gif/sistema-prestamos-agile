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

- **Nadie modifica tablas ni funciones desde el panel de Supabase.** Todo cambio de base va como archivo en `/sql` con número siguiente (`12_...sql`; el último es el 11), en un PR.
- **Solo A ejecuta los `.sql` en Supabase** y avisa al grupo: "BD actualizada a 12". Orden en una base nueva: 01, 02, 03, **08**, 04, 04b, 09, 10, **11**. Si se vuelve a ejecutar 02, ejecutar 08 después.
- Si necesitas un cambio en la BD, abre un *issue* "BD: ..." describiendo qué necesitas; no lo hagas tú.
- Los datos de prueba se reinician con `sql/04_seed_demo.sql` y luego `sql/04b_demo_cupo_liberado.sql` (avisar antes: borran los clientes). Las pruebas de reglas v1.3 son `sql/05b_pruebas_al_cancelar.sql`; ejecutar 04 y 04b después.

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

## 10. Reparto y servicios por historia (v1.3)

| Quién | Historias | Servicios que usa (en `frontend/src/app/services/`) |
|---|---|---|
| **A** | HU-01, HU-02, HU-T1, Edge Functions, despliegue, RLS | `AuthService`, `DemoService` |
| **B** | HU-03 (selector DNI / RUC), HU-04, HU-05, HU-23 (vista) | `ClientesService.consultarDni / consultarRuc / registrar / buscar / obtener / deuda / capitalVigente` |
| **C** | HU-06, HU-07, HU-08, HU-10 | `PrestamosService.evaluar / aprobar / obtener / listarPorCliente / listar` |
| **D** | HU-09, HU-15, HU-16, HU-17 | `PrestamosService.obtener` (contrato), `ReportesService.morosos / porSede / sedes / listarBitacora` |

Cada quien trabaja solo en su página de `pages/`; los tipos viven en `core/contrato.ts` y cualquier cambio de firma lo coordina A.

### Cobertura por historia

Responsable de la **pantalla** (A, B, C o D, según el reparto de arriba) y cómo se cubre cada historia. Los T-xx están en `docs/02_plan_de_trabajo.md` §7. Los pares de QA son una propuesta: quien verifica no es quien construyó.

| HU | Pantalla | Cobertura / casos de prueba |
|---|---|---|
| HU-01 Login | A | T-17 |
| HU-02 Sedes y trabajadoras | A (sin pantalla; gestión de usuarios es Could) | Cubierta en BD (`sql/03_seed_base.sql`: 5 sedes y 1 trabajadora por sede + 1 administrador; vínculo con Auth en `sql/07_vincular_auth.sql`), verificada en QA por **B**. T-27 (solo ADMIN ve el reporte por sede) y T-21. Comprobado en Supabase el 17/10: las 5 sedes tienen al menos una trabajadora activa |
| HU-03 Registrar cliente (DNI / RUC) | B | T-01, T-02, T-03, T-18, T-23, T-28, T-29 |
| HU-04 Documentos no permitidos | B | T-04 |
| HU-05 Buscar y ver cliente | B | T-02 |
| HU-06 Evaluar solicitud | C | T-05, T-06, T-07, T-09, T-16 |
| HU-07 Aprobar préstamo | C | T-15, T-24 |
| HU-08 Cronograma | C | T-10, T-11 |
| HU-09 Contrato imprimible | D | T-19 |
| HU-10 Listar préstamos | C | — (ver detalle y cronograma en pantalla) |
| HU-11 Límite global y liberación de cupo | C (informe y ficha muestran capital vigente y disponible) | Cubierta en BD (`fn_capital_vigente` en `sql/02_funciones.sql`, modo `AL_CANCELAR` fijado en `sql/08_ajustes_v1_3.sql`), verificada en QA por **C**. T-05, T-06, T-07, T-08, T-22, T-26, T-32 |
| HU-12 Moroso automático | A (botón en el panel de demostración) | Cubierta en BD (`fn_actualizar_estados`, `sql/02_funciones.sql`), verificada en QA por **D**. T-13. El recálculo es al consultar o con el botón; no hay tarea programada |
| HU-13 Bloqueo de nuevos préstamos | C (mensaje en evaluación y aprobación) | Cubierta en BD (`fn_evaluar_prestamo_calc` y `fn_aprobar_prestamo`, `sql/08_ajustes_v1_3.sql`), verificada en QA por **B**. T-12 |
| HU-14 Extrajudicial automático | D (aparece en el reporte de morosos) | Cubierta en BD (`fn_actualizar_estados`, `sql/02_funciones.sql`), verificada en QA por **D**. T-14 |
| HU-15 Reporte de morosos | D | T-12, T-14 (cliente en la lista) |
| HU-16 Auditoría | D (pantalla de bitácora) | T-30, T-31 |
| HU-17 Reporte por sede | D | T-21, T-27 |
| HU-23 Mora por día | B (vista en la ficha) | T-25 |
| HU-T1 Modo demostración | A | T-13, T-14, T-20 |

