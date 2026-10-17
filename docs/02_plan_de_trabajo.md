# Plan de trabajo — MVP Sistema de Préstamos

**Hoy:** viernes 16/10 · **Presentación:** lunes 19/10, 4:00 PM, presencial
**Equipo:** 4 personas · **Capacidad supuesta:** ~4–5 h útiles por persona al día (ajustar a la realidad del grupo)

Documento de referencia: `01_documentacion_base.md` (IDs RN-, RF-, HU-, SUP-).

---

## 0. Estado al viernes 16/10

**Hecho:** proyecto de Supabase creado, scripts SQL v2 ejecutados (incluida la migración), repositorio local y conexión desde Node probados. **Falta:** subir el repositorio a GitHub, elegir framework y arrancar el frontend.
**Cambió con las respuestas del profesor (versión 2 de los scripts):**
- Mora de 1% diario, calculada por días (HU-23).
- DNI vigente: se registra la fecha de caducidad (RN-25).
- Sin anulación de préstamos; el trabajador confirma con el cliente conforme (RN-26).
- Ingresos = dinero cobrado.
- Solo roles Trabajador y Administrador.
- Documentación solo con requerimientos, HU y criterios: ver `03_entregable_requerimientos_hu_ca.md`.
- **El sistema debe ser web:** falta construir y desplegar el frontend.
- **La persona sorteada justifica y sustenta todo:** negocio y decisiones técnicas.

**Para actualizar tu Supabase:** ejecutar `06_migracion_v1_a_v2.sql`, luego `02_funciones.sql` (v2) y, si quieres reiniciar datos, `04_seed_demo.sql`.

**Siguiente:** frontend web (login, cliente, evaluación, cronograma, fichas, reportes), consulta de DNI/RENIEC, seguridad (RLS) y guía de sustentación.

---

## 1. Estrategia: cómo "vender" el MVP

**Mensaje central:** *"Un sistema pequeño pero completo en lo que hace, que ya protege tu capital desde el primer día."*

El profesor aclaró que la nota es la misma para un MVP grande o pequeño; lo que cuenta es que **lo presentado funcione sin errores** y **sirva al negocio**. Por eso la estrategia es **profundidad antes que amplitud**:

1. **Cada regla que dijo en clase está implementada y se puede probar en vivo** (tope de 10,000, solo DNI, nombre validado, moroso bloqueado, extrajudicial, cronograma cada 30 días). Si él prueba una regla, el sistema responde bien.
2. **Reglas protegidas en la base de datos, no solo en pantalla.** Si intenta "saltarse" una regla, no puede.
3. **Un flujo de principio a fin sin cabos sueltos:** buscar/registrar cliente → evaluar → informe → aprobar → cronograma/contrato impreso → seguimiento de estado.
4. **Demo preparada con casos que él seguramente probará** (ver sección 6). Anticipa su "prueba de error" (cliente moroso con saldo libre, 10,001, carnet de extranjería, nombre incorrecto).
5. **Narrativa de negocio, no técnica.** El profesor dijo: "yo veo la parte del negocio, la parte técnica la ven ustedes". Explicar qué problema del prestamista resuelve cada pantalla.

### Decisión de alcance: pagos fuera del MVP (completo, sin versiones a medias)

Criterio alineado con lo dicho por el profesor: ni pasarela ni registro de pagos, porque consumen un tiempo que no hay y es preferible algo funcional a algo a medias.

| Elemento | Decisión |
|---|---|
| Pasarela de pago | **Fuera, definitivo** (el trámite es presencial). |
| Registro de pagos (HU-18 a HU-22) | **Fuera de esta entrega por completo.** No hay pantalla, botón, campo ni "versión mínima". Se eliminó la puerta que permitía sumarlo si sobraba tiempo. |
| Lo que sí se construye | Originación y control: cliente, evaluación, aprobación, cronograma, límite, estados, mora por días y reportes por sede. |
| Modelo de datos | Las cuotas ya tienen estado (Pendiente, Pagada, Vencida) para que el módulo futuro se enganche sin rehacer nada; la tabla de pagos se crea junto con ese módulo. |

**Limitación que hay que conocer y decir con honestidad en la demo:** sin módulo de pagos no hay forma de marcar cuotas como pagadas desde la aplicación; por eso los casos de "saldo liberado" y "moroso" se muestran con datos precargados y fecha simulada. En operación real, el cobro es lo que cierra el ciclo.

> Frase para el profesor: *"Este sprint entrega el control del otorgamiento y del riesgo; el cobro es un módulo aparte que preferimos no dejar a medias."*

---

## 2. Stack recomendado (ajustable a lo que el equipo ya domine)

Prioridad: **rápido de construir, reglas en BD, desplegado en línea.**

| Capa | Sugerencia | Por qué |
|---|---|---|
| Base de datos y auth | PostgreSQL con Supabase (Auth + RLS + funciones SQL) | Reglas críticas como funciones/constraints; tarea diaria con `pg_cron` |
| Frontend | Angular (o React) | Formularios, validaciones, tablas |
| Validación de identidad | API de consulta DNI de un tercero (verificar términos y cuota gratuita) llamada desde servidor/Edge Function | Nombre correcto (RN-03) sin exponer la llave |
| PDF del contrato | Generación en cliente (jsPDF o impresión HTML) | Simple y rápido |
| Despliegue | Frontend en Vercel/Netlify + Supabase cloud | Demo en línea; plan B local |
| Control de versiones | GitHub, ramas por historia, PR revisado por otro | Evita choques |

Si el equipo domina otro stack (p. ej., Spring Boot + PostgreSQL), mantener las mismas ideas: **reglas en servidor/BD, decimales exactos, transacción al aprobar**.

---

## 3. Reparto por persona

A = integrador y líder técnico. B, C y D = los otros tres integrantes (asignen quién es cada uno). Cada persona es dueña de un área completa, con sus ramas y sus historias; **todos** deben poder sustentar todo, porque el sorteo decide quién defiende.

| | Área | Historias | Ramas |
|---|---|---|---|
| **A** (tú) | **Base de datos, seguridad, integración y despliegue.** Repositorio y estructura inicial; vínculo de usuarios (Auth); consulta de DNI (función de servidor); seguridad (RLS); despliegue en línea; revisa y mergea todos los PR; guía de sustentación técnica | HU-01 (parte BD), HU-03 (consulta DNI), seguridad, HU-02 | `infra/repo-base`, `feature/HU-03-consulta-dni`, `infra/seguridad-rls`, `infra/despliegue` |
| **B** | **Acceso y clientes (frontend).** Login, rutas protegidas, menú por rol, registro de cliente con DNI y fecha de caducidad, búsqueda, ficha del cliente (estado, cupo, préstamos, deuda y mora) | HU-01, HU-03 (pantalla), HU-04, HU-05 | `feature/HU-01-login`, `feature/HU-03-registro-cliente`, `feature/HU-05-ficha-cliente` |
| **C** | **Préstamos (frontend).** Solicitud, evaluación e informe, pantalla de confirmación con casilla de conformidad, cronograma, contrato imprimible/PDF, listado y detalle de préstamos | HU-06, HU-07, HU-08, HU-09, HU-10 | `feature/HU-06-evaluar-prestamo`, `feature/HU-07-aprobar-prestamo`, `feature/HU-09-contrato-pdf`, `feature/HU-10-listado-prestamos` |
| **D** | **Morosidad, reportes, demo y calidad.** Reporte de morosos y extrajudiciales con CSV, reporte por sede (administrador), panel de modo demostración (fecha simulada y aviso), casos de prueba, datos demo, guion y manual breve | HU-13/14 (vista), HU-15, HU-17, HU-23 (vista), HU-T1, HU-16 (opcional) | `feature/HU-15-reporte-morosos`, `feature/HU-17-reporte-sedes`, `feature/HU-T1-modo-demo`, `docs/casos-de-prueba` |

**Dependencias que importan**
1. **A entrega la estructura inicial hoy antes de las 2 PM** (menú, rutas, cliente de Supabase, carpeta `services/`). B, C y D no pueden empezar sus pantallas sin eso: mientras tanto leen la documentación y el contrato de API, y preparan sus pantallas en papel o en borrador.
2. **C necesita clientes registrados** para evaluar: usa los datos demo (`04_seed_demo.sql`) hasta que B termine el registro.
3. **D necesita datos con mora**: ya están en los datos demo (morosos y extrajudicial).
4. **Cambios en la base de datos solo por A**, con número de script nuevo (ver `CONTRIBUTING.md`).

### 3.2 Flujo de ramas (resumen; el detalle está en `CONTRIBUTING.md`)

- `main` = demo estable. `develop` = integración. Ramas `feature/HU-xx-...` de máximo medio día.
- Todo entra por **Pull Request a `develop`** con revisión de A.
- `main` se actualiza solo desde `develop`: **sábado 10 PM** y **domingo 8 PM** (congelamiento).
- Nadie toca la base de datos desde el panel de Supabase.

---

## 3.1 Marco Scrum (el profesor pidió trabajar bajo Scrum)

| Elemento | Aplicación |
|---|---|
| Product Owner | El profesor (cliente). Un integrante hace de enlace con él el jueves. |
| Scrum Master | Un integrante (puede rotar); cuida el tablero, las puertas G2–G4 y el congelamiento. |
| Equipo de desarrollo | Los 4 integrantes. |
| Product Backlog | Las historias de `01_documentacion_base.md` (Must / Should / Could). |
| **Sprint Goal** | *"Un trabajador de sede registra un cliente validado, evalúa y otorga un préstamo respetando las reglas del negocio, entrega su cronograma, y la dirección ve la morosidad por sede."* |
| Sprint Planning | Miércoles noche: validar backlog y reparto. |
| Daily | 10 min a las 9 PM por llamada: qué hice, qué haré, qué me bloquea. |
| Sprint Review | La presentación del lunes (4:00 PM). |
| Retrospectiva | 15 min después de presentar: qué mantener y qué mejorar. |
| Evidencia | Tablero actualizado, captura diaria de HU hechas/total, Definición de Hecho, documento de limitaciones conocidas y contingencias (útil si hubiera fallos en el sistema). |

---

## 4. Cronograma día por día (desde hoy, viernes 16/10)

Horas útiles supuestas: 5–6 por persona entre semana de parciales; ajusten a su realidad. Si alguien tiene examen, avisar hoy para redistribuir.

### Viernes 16/10 — Arranque y flujo vertical
| Cuándo | A | B | C | D |
|---|---|---|---|---|
| Mañana | Sube el repositorio a GitHub, crea `develop`, invita a B/C/D, crea los usuarios de Auth y ejecuta `07_vincular_auth.sql`. Pasa a cada uno la URL y llave pública por privado | Clona, configura `.env`, lee el contrato de API y las HU del login y clientes | Clona, configura, lee HU-06 a HU-10 y el contrato | Clona, configura, lee HU-15, 17, 23 y T1; arma los casos de prueba |
| **Antes de las 2 PM** | **Estructura inicial** en `develop`: menú, rutas, cliente Supabase, carpeta `services/`, pantalla vacía de cada módulo | Espera la estructura (revisa diseño de pantallas) | Igual | Igual |
| Tarde | Consulta de DNI (función de servidor); empieza seguridad | `feature/HU-01-login` y guardia de rutas; luego registro de cliente | `feature/HU-06-evaluar-prestamo` (formulario → informe, con datos demo) | Reporte de morosos (HU-15), luego panel de modo demo |
| **9 PM** | Daily + revisión de PR | Login mergeado | Evaluación mergeada | Reporte de morosos mergeado |

🚦 **G2 (viernes 10 PM): demo vertical.** Debe funcionar de punta a punta aunque sea feo: login → buscar cliente demo → evaluar → aprobar → ver cronograma. Si no se logra, el sábado se dedica solo a esto.

### Sábado 17/10 — Completar y probar
| Cuándo | A | B | C | D |
|---|---|---|---|---|
| Mañana | Integra consulta de DNI con el registro (con B); revisa PR | Registro de cliente con DNI y caducidad (HU-03/04) | Aprobación con casilla de conformidad (HU-07) y cronograma (HU-08) | Reporte por sede (HU-17) y modo demo (HU-T1) |
| **12 PM** | 🚦 **G3:** ¿todo lo Must está verde? Si no, se recortan los Should | | | |
| Tarde | Seguridad (RLS) en rama aparte; **si falla, se descarta**; despliegue en línea | Búsqueda y ficha del cliente con deuda y mora (HU-05) | Contrato en PDF (HU-09) y listado de préstamos (HU-10) | Casos de prueba ejecutados; reporte de morosos con CSV |
| **6 PM** | **Congelamiento de funciones nuevas.** Desde aquí solo se corrigen errores | | | |
| **10 PM** | `develop → main`, etiqueta `v0.9`; **QA cruzado:** cada uno prueba lo que hizo otro con los casos de prueba y anota errores | | | |

### Domingo 18/10 — Estabilizar y ensayar
| Cuándo | Todos |
|---|---|
| Mañana | Corregir errores del QA de anoche (cada uno los de su área); A revisa y mergea |
| Mediodía | Despliegue final probado desde otro dispositivo y otra red; documentos finales (entregable del profesor, limitaciones conocidas, guía de sustentación) |
| **Tarde** | **Ensayo con sorteo:** se sortea quién presenta, otro hace de profesor y trata de romper el sistema; repetir hasta que los 4 hayan presentado. Quien presenta responde también el **porqué** de cada decisión |
| 🚦 **G4 — 8 PM** | **CONGELAMIENTO.** `develop → main`, etiqueta `v1.0`. Solo `hotfix/` por error crítico, aprobado por A |
| Noche | Respaldo de la base de datos y copia local funcional; verificar login, consulta de DNI y despliegue |

### Lunes 19/10 — Presentación
- **Mañana:** *smoke test* (login → cliente → préstamo → cronograma → moroso). Reiniciar datos demo. Sin cambios de código.
- **3:00 PM:** todos en la escuela; laptops cargadas; datos móviles de respaldo; sesión iniciada y datos demo reiniciados.
- **4:00 PM:** presentación. Se sortea quién defiende; solo esa persona opera y responde; el resto observa sin intervenir.
- Después: retrospectiva de 15 minutos.

---

## 5. Preguntas pendientes para el profesor

Las respuestas ya recibidas están incorporadas en la documentación (SUP-01, 05, 06, 07, 13, 15, 16, 20). Quedan **cuatro**, con números para que solo elija:

| # | Pregunta | Ejemplo para que elija | Por defecto hoy |
|---|---|---|---|
| P1 | **Liberación del cupo.** Usted dijo que el préstamo debe pagarse completo antes de uno nuevo que rebase el límite, pero en su chat dijo que con 10 mil a 2 años y 5 mil pagados al año puede pedir 5 mil. ¿Cuál vale? | A) Se libera lo amortizado: con 5,000 pagados, pide 5,000. B) Solo al terminar de pagar: debe pagar los 10,000. | A |
| P2 | **Cuotas.** "Interés compuesto" ya lo aplicamos (TEA 30%). ¿Las cuotas son iguales cada mes, o el capital es igual y baja la cuota? | 5,000 a 6 meses: A) 6 cuotas de ≈ 898.98. B) 943.85, 925.44 … 851.75. | B (hace exacto su ejemplo del chat) |
| P3 | **Mora del 1% diario "del monto acumulado".** ¿Se capitaliza cada día o es 1% fijo de la cuota por día? | Cuota de 1,000 con 10 días de atraso: A) compuesta: 104.62. B) simple: 100.00. A 470 días de atraso, una cuota de 1,000 sube a ≈ 107,000 con A. | A |
| P4 | **Consulta de DNI.** ¿Basta con validar el nombre por RENIEC y escribir la fecha de caducidad que figura en el DNI físico? | — | Sí |

Lo que no se confirme queda **parametrizado** (basta cambiar un valor en la tabla `parametros`).

---

## 6. Guion de la demostración (≈ 10–15 min)

Relato: *"Soy la asesora de la sede Trujillo. Llega un cliente…"*

| Paso | Qué se muestra | Regla demostrada |
|---|---|---|
| 1 | Login de trabajadora; se ve su sede | RN-01 |
| 2 | Registrar un **cliente nuevo** con DNI: nombre autocompletado y no editable | RN-03 |
| 3 | Intentar registrar con **carnet de extranjería/pasaporte** → bloqueado; luego un **DNI vencido** → bloqueado | RN-04, RN-25 |
| 4 | Evaluar **5,000 a 6 meses** → informe: cuota, total, primera fecha | RN-09, RN-12 |
| 5 | Aprobar → **cronograma** mes a mes (vencimientos cada 30 días) → imprimir contrato | RN-10, RN-11 |
| 6 | Mismo cliente: pedir **6,000 más** → rechazado (pasa 10,000); pedir **5,000** → aprobado (llega a 10,000 exacto) | RN-05, RN-06 |
| 7 | Cliente con vigente 7,000: pedir 5,000 → rechazado, "máximo 3,000" | RN-06 |
| 8 | Cliente precargado (10,000 a 2 años, 5,000 ya amortizados): mostrar **saldo liberado** y pedir 5,000 | RN-07 |
| 9 | **Cliente moroso con saldo libre** → rechazado por morosidad | RN-18, RN-19 |
| 10 | Activar fecha simulada: un cliente al día cruza el día 31, pasa a Moroso y empieza a acumular 1% diario de mora | RN-18, RN-24 |
| 11 | Cliente **Extrajudicial** (más de un año) → bloqueado; reporte de derivación con deuda y mora + CSV | RN-20, RN-21, RN-24 |
| 12 | Casos extremos: plazo 1 mes y 60 meses; 10,000 aceptado; 10,001 rechazado | RN-05, RN-08 |
| 13 | **Reporte por sede**: morosos y préstamos otorgados en Chimbote, Trujillo, Chiclayo, Piura y Tumbes | RN-23 |
| 14 | Cierre: *"Este sprint entrega el control del otorgamiento y del riesgo; el cobro es un módulo aparte que preferimos no dejar a medias."* | Alcance |

**Decirlo en voz alta:** los pasos 8–11 usan datos precargados y fecha simulada (no hay módulo de pagos en este sprint).

**Antes del ensayo:** el profesor pidió **DNI reales**: usar los de integrantes del equipo (con su consentimiento) para la consulta en vivo; tener también datos precargados por si la API falla en la demo.

---

## 7. Casos de prueba mínimos (QA cruzado del sábado)

| ID | Caso | Resultado esperado |
|---|---|---|
| T-01 | DNI de 7 dígitos / con letras | Rechazo con mensaje |
| T-02 | DNI duplicado | Muestra ficha existente, no duplica |
| T-03 | Intentar editar nombre verificado | No permitido |
| T-04 | Carnet de extranjería / pasaporte | No se crea cliente |
| T-05 | Monto 10,000 con vigente 0 | Aprobable |
| T-06 | Monto 10,001 | Rechazado |
| T-07 | Vigente 7,000 + 5,000 | Rechazado, máximo 3,000 |
| T-08 | Vigente 5,000 + 1,000 + 1,000 + 1,000 | Los tres aprobados (suman 8,000) |
| T-09 | Plazo 0, 61, decimal | Rechazado |
| T-10 | Plazo 1 y 60 meses | 1 y 60 cuotas; saldo final 0.00 |
| T-11 | 5,000 a 6 meses | Coincide con el ejemplo de la documentación |
| T-12 | Moroso con saldo libre | Rechazado en evaluación y en aprobación |
| T-13 | Día 30 sin pago / día 31 sin pago | Al día / Moroso |
| T-14 | Moroso 364 / 366 días sin pagos | Moroso / Extrajudicial |
| T-15 | Dos sedes aprueban a la vez al mismo cliente cerca del tope | Solo una pasa; la otra es rechazada |
| T-16 | Evaluar sin aprobar | No crea préstamo |
| T-17 | Acceso a pantallas sin sesión | Redirige al login |
| T-18 | API de DNI caída | Ingreso manual con doble confirmación y marca "No verificado" |
| T-19 | Imprimir contrato dos veces | Documento idéntico |
| T-20 | Reiniciar datos demo | Estado inicial conocido, sin errores |
| T-21 | Reporte por sede | Conteos coinciden con los datos precargados de cada sede |
| T-22 | 10,000 a 24 meses con 12 cuotas pagadas (precargado) | Disponible según el método confirmado (con capital constante: 5,000) |
| T-23 | DNI vencido o sin fecha de caducidad | Rechazado al registrar y al evaluar |
| T-24 | Aprobar sin confirmar conformidad | Rechazado; no existe forma de anular un préstamo aprobado |
| T-25 | Mora: 1,000 con 0, 1 y 10 días de atraso | 0.00, 10.00 y 104.62 (compuesta) |
| T-26 | Préstamo con todas las cuotas pagadas | Pasa a Cancelado y libera su cupo |
| T-27 | Trabajador entra al reporte por sede | Solo el Administrador accede |

---

## 8. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Método de cuota distinto al que imagina el profesor (SUP-17) | Media | Alto | P1 el jueves; método parametrizable; su ejemplo de 10,000 a 2 años como prueba |
| API de DNI caída o con cuota agotada el lunes | Media | Alto | Ingreso manual verificado + datos precargados + probar el domingo |
| Falla de internet en la sala | Media | Alto | Datos móviles + copia local funcional |
| Falta de tiempo | Media | Alto | Puertas G2–G4; recortar Should/Could, nunca Must |
| Errores de redondeo en el cronograma | Baja | Alto | `NUMERIC`, última cuota ajusta, prueba T-11 |
| Choque de código entre 4 personas | Media | Medio | Ramas + PR revisado; integración diaria |
| Sorteo: le toca a quien menos domina el sistema | Alta | Alto | Los 4 dominan todo: intercambio de partes y ensayo rotativo con sorteo |
| Mora compuesta da cifras enormes y el profesor las cuestiona | Media | Medio | P3 el jueves; modalidad parametrizable; llevar el cálculo explicado |
| El profesor echa de menos pagos | Media | Medio | Frase de alcance, limitación dicha con honestidad, datos precargados que muestren el efecto |
| Cambios de último minuto introducen bugs | Media | Alto | Congelamiento el domingo a las 8 PM |
| Demo de morosidad requiere "esperar meses" | Alta | Medio | Modo demostración con fecha simulada (HU-T1) |

---

## 9. Definición de "Hecho" (DoD) por historia

- Cumple **todos** sus criterios de aceptación.
- La regla está validada en servidor/BD (no solo en pantalla).
- Probada por **otra persona** del equipo con los casos de la sección 7.
- Mensajes de error claros en español.
- Desplegada y funcionando en el entorno de la demo.
- Documentada en el tablero (qué se hizo y supuestos).

## 10. Entregables

- `01_documentacion_base.md` (contexto, reglas, requerimientos, HU y criterios).
- Sistema desplegado + copia local.
- Datos demo y comando de reinicio.
- Casos de prueba ejecutados (con resultados).
- Guion de la demo (sección 6).
- Documento de limitaciones conocidas y contingencias.
- **Guía de sustentación:** para cada decisión de negocio y técnica, el porqué (la persona sorteada "justifica y sustenta todo"). Ejemplos: por qué las reglas viven en la base de datos, por qué mora compuesta, por qué TEA, por qué no hay pasarela, por qué cupo global entre sedes.
- **Entregable al profesor:** solo `03_entregable_requerimientos_hu_ca.md` (requerimientos, HU y criterios).

## 11. Después de esta entrega (no se construye ahora)

1. HU-18 registro de pago de cuota (con comprobante).
2. HU-19 pago con múltiples métodos y cuentas Yape.
3. HU-20 pago anticipado y orden de cuotas.
4. HU-22 regularización de moroso.
5. HU-21 verificación de que no existe condonación.
6. Pantalla de administración (HU-02 completa) y panel del prestamista (HU-17).
