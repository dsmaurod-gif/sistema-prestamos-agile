# Sistema de Gestión de Préstamos — Requerimientos, Historias de Usuario y Criterios de Aceptación

**Curso:** Agile Development · **Marco:** Scrum · **Versión:** 1.3.2 · **Fecha:** 18/10/2026
**Alcance de este documento:** requerimientos, historias de usuario y criterios de aceptación del MVP (Sprint 1). Los pagos (HU-18 a HU-22) quedan para el Sprint 2. Los cambios de la v1.3 están en el registro de cambios al final.

## 1. Requerimientos

### 1.1 Reglas de negocio

| ID | Regla | Alcance |
|---|---|---|
| RN-01 | El sistema es de uso exclusivo de los trabajadores de las 5 sedes. El cliente, al otro lado de la ventanilla, no puede manipularlo. | MVP |
| RN-02 | El trámite es presencial; no existe solicitud virtual ni portal del cliente. | MVP |
| RN-03 | El DNI debe existir y comprobarse de forma válida (idealmente contra RENIEC) para que el nombre registrado sea el correcto. | MVP |
| RN-04 | Solo se presta a clientes **nacionales** con **DNI**. No se presta a quien se identifique solo con carnet de extranjería o pasaporte. El cliente siempre se identifica por DNI; el RUC es un dato adicional opcional (RN-30). | MVP |
| RN-05 | El capital máximo prestado por cliente es **S/ 10,000** (tope global, todas las sedes). Motivo: sobre ese monto habría que presentar un ROS (Reporte de Operaciones Sospechosas), un procedimiento complejo. | MVP |
| RN-06 | Un cliente puede tener varios préstamos vigentes (de distintos montos y plazos) mientras la suma de capital vigente + el nuevo monto ≤ 10,000. Un solo préstamo de 10,000 es válido. Ej.: vigente 7,000 + solicitud 5,000 → rechazado; solo podría pedir hasta 3,000. | MVP |
| RN-07 | Al pagar, se libera el cupo y se puede volver a solicitar capital, sin pasar nunca de 10,000. **Regla vigente (v1.3):** el cupo de un préstamo solo se libera cuando ese préstamo se paga por completo (queda Cancelado). Respuesta del profesor: «el préstamo debe pagarse completamente antes de proceder con algún nuevo que pueda rebasar el límite». Se aplica con el parámetro `liberacion_cupo = AL_CANCELAR`; la alternativa `CAPITAL_AMORTIZADO` (liberar lo ya amortizado) sigue disponible por si el profesor la pide. | MVP* |
| RN-08 | Monto mínimo > 0; plazo de **1 mes a 5 años** (1–60 meses). | MVP |
| RN-09 | Interés fijo del **30% TEA** (tasa efectiva anual). | MVP |
| RN-10 | Al aprobar, el sistema genera automáticamente el **cronograma de pagos detallado mes a mes** (el "contrato de pagos"). | MVP |
| RN-11 | Las cuotas vencen **cada 30 días** contados desde el desembolso. | MVP |
| RN-12 | El flujo es: solicitud → evaluación → informe → aprobación → contrato/cronograma. | MVP |
| RN-13 | El sistema soporta pagos en efectivo, tarjeta bancaria y Yape. | S2 |
| RN-14 | Un pago puede combinar métodos y cuentas Yape (2, 3 o más), sin límite fijo. | S2 |
| RN-15 | El cliente puede pagar antes del vencimiento y adelantar cuotas. | S2 |
| RN-16 | Se bloquea el pago de cuotas futuras si hay una cuota anterior sin cancelar: debe pagar primero lo adeudado (la más antigua). | S2 |
| RN-17 | **No** existen opciones de liquidar/perdonar/descontar deuda atrasada por debajo del capital original (el prestamista usa su propio capital; esto es de bancos, no de este negocio). | MVP (ausencia) |
| RN-18 | La morosidad se calcula por días: si no paga la cuota en su fecha, el día 31 el cliente pasa **automáticamente** a "Moroso". | MVP |
| RN-19 | A un moroso no se le entrega ningún préstamo nuevo, **aunque** tenga saldo dentro de sus 10,000. | MVP |
| RN-20 | Moroso con más de un año sin ningún pago/abono → **automáticamente** "Extrajudicial". | MVP |
| RN-21 | Extrajudicial: se deriva a empresa externa de cobranza y no accede a nuevos créditos. | MVP |
| RN-22 | Moneda: soles; zona horaria America/Lima. | MVP |
| RN-23 | La dirección necesita saber por sede cuántos morosos hay y cuántos ingresos (dinero cobrado). | MVP |
| RN-24 | Mora: 1% por cada día de atraso sobre el monto acumulado adeudado. No cuenta para el tope de 10,000. | MVP (cálculo) |
| RN-25 | El DNI del cliente debe estar vigente (no caducado). | MVP |
| RN-26 | El préstamo es irreversible: el trabajador lo confirma solo cuando el cliente está conforme; una vez firmado no se puede anular ni modificar. | MVP |
| RN-27 | Solo existen dos roles: Trabajador y Administrador. | MVP |
| RN-28 | El informe de evaluación entrega solo el resultado; no se consulta Infocorp ni se piden datos adicionales. | MVP |
| RN-29 | Un moroso que paga vuelve a Al día; un Extrajudicial no vuelve. | S2 |
| RN-30 | Identificación con RUC (v1.3): antes del registro se elige "DNI / RUC". El cliente se sigue identificando por DNI (único; sostiene el tope global). Con RUC se consulta SUNAT y solo se acepta un RUC ACTIVO y HABIDO; se sigue exigiendo el DNI del titular, consultado en RENIEC. *Diseño por defecto, por confirmar con el profesor.* | MVP |

\* En el MVP el sistema **calcula** la liberación de saldo a partir de las cuotas pagadas, pero no incluye pantalla para registrar pagos (módulo de pagos fuera de esta entrega). Esos casos se demuestran con datos precargados.

---

### 1.2 Requerimientos funcionales

Prioridad MoSCoW: **M** Must · **S** Should · **C** Could.

| ID | Requerimiento | RN | Prio | Alcance |
|---|---|---|---|---|
| RF-01 | Autenticación de trabajadoras con usuario y contraseña. | RN-01 | M | MVP |
| RF-02 | Cada trabajadora pertenece a una sede; toda operación registra sede, usuaria y fecha/hora. | RN-01 | M | MVP |
| RF-03 | Dos roles: **Trabajador** (opera clientes y préstamos) y **Administrador** (además ve reportes por sede y gestiona sedes y trabajadores; la pantalla de gestión es Could, carga inicial por script). | RN-01 | C | MVP |
| RF-04 | Registrar cliente con DNI de 8 dígitos y su fecha de caducidad (vigente), nombres, apellidos, teléfono y dirección (opcional) y, de forma opcional, RUC y razón social (RN-30). No se piden más datos. | RN-03, RN-04 | M | MVP |
| RF-05 | Validar identidad: consultar el DNI en un servicio de identidad (API de RENIEC si es viable) y autocompletar nombre/apellidos de solo lectura; si el servicio no responde, ingreso manual con doble confirmación y marca "No verificado". | RN-03 | M | MVP |
| RF-06 | Impedir clientes identificados solo con carnet de extranjería o pasaporte. | RN-04 | M | MVP |
| RF-07 | Evitar clientes duplicados (un DNI = un cliente) y proteger el nombre verificado contra edición. | RN-03 | M | MVP |
| RF-08 | Buscar clientes por DNI o nombre. | — | M | MVP |
| RF-09 | Ficha del cliente: datos, estado, límite, capital vigente, disponible, préstamos y cuotas. | RN-05–08 | M | MVP |
| RF-10 | Evaluar una solicitud (cliente, monto, plazo) validando todas las reglas y mostrando **todos** los motivos de rechazo. | RN-05–09, RN-19, RN-21 | M | MVP |
| RF-11 | Informe de evaluación: resultado, motivos, capital vigente, disponible, cuota, total a pagar. | RN-12 | M | MVP |
| RF-12 | Aprobar y registrar el préstamo (revalidando reglas en el momento de confirmar), con confirmación de que el cliente está conforme con las condiciones (el contrato impreso se firma en papel tras la aprobación). No existe anulación posterior. | RN-05, RN-06, RN-26 | M | MVP |
| RF-13 | Generar el cronograma al aprobar (n cuotas, vencimiento cada 30 días, capital, interés, cuota, saldo). | RN-10, RN-11 | M | MVP |
| RF-14 | Imprimir/descargar contrato y cronograma (PDF). | RN-10 | M | MVP |
| RF-15 | Listar préstamos con filtros (cliente, estado, sede) y ver detalle. | — | M | MVP |
| RF-16 | Recalcular estados Al día / Moroso / Extrajudicial al consultar al cliente y mediante `fn_actualizar_estados` (botón del panel de demostración); no hay tarea programada en el MVP. | RN-18, RN-20 | M | MVP |
| RF-17 | Bloquear nuevos préstamos a Morosos y Extrajudiciales. | RN-19, RN-21 | M | MVP |
| RF-18 | Reporte de Morosos y Extrajudiciales (deuda vencida, mora acumulada, total a regularizar, días de atraso, último pago) con exportación CSV para la empresa de cobranza. | RN-21 | S | MVP |
| RF-19 | Bitácora de auditoría de operaciones críticas (crear cliente, evaluar y aprobar préstamo, cambios de estado), visible en una pantalla de solo lectura. | RN-01 | S | MVP |
| RF-20 | Reporte por sede: morosos y extrajudiciales, clientes nuevos, préstamos otorgados, capital colocado, intereses proyectados e ingresos cobrados. | RN-23 | M | MVP |
| RF-21 | Modo demostración: fecha de referencia simulada y datos de ejemplo. | — | M | MVP (técnico) |
| RF-27 | Calcular días de atraso y mora (1% diario) de cada cuota vencida y el total a regularizar por cliente. | RN-24 | M | MVP |
| RF-28 | Marcar el préstamo como Cancelado cuando todas sus cuotas estén pagadas y liberar su cupo. | RN-07 | M | MVP |
| RF-29 | Validar que el DNI esté vigente al registrar y al evaluar. | RN-25 | M | MVP |
| RF-30 | Selector "DNI / RUC" al registrar. Con RUC: consultar SUNAT, mostrar razón social, estado y condición, rechazar si estado ≠ ACTIVO o condición ≠ HABIDO, y exigir además el DNI del titular. | RN-30 | M | MVP |
| RF-22 | Registrar pago de una cuota (por la trabajadora; sin pasarela). | RN-13 | M | S2 |
| RF-23 | Pago con varios métodos/cuentas Yape en una misma operación; la suma debe igualar el monto. | RN-14 | M | S2 |
| RF-24 | Pago anticipado en orden de cuotas. | RN-15, RN-16 | M | S2 |
| RF-25 | Bloquear pago de cuotas futuras con deuda anterior. | RN-16 | M | S2 |
| RF-26 | Regularización automática del moroso al pagar lo vencido (el Extrajudicial no vuelve). | RN-29 | S | S2 |

> RF-22 a RF-26 corresponden al módulo de pagos: **quedan fuera de esta entrega y no se implementan de forma parcial** (criterio del profesor: mejor algo funcional que algo a medias).

### 1.3 Requerimientos no funcionales

| ID | Requerimiento |
|---|---|
| RNF-01 | **Integridad:** las reglas críticas (límite 10,000, morosidad, bloqueo) se aplican en la base de datos/servidor, no solo en la interfaz. |
| RNF-02 | **Consistencia concurrente:** aprobar un préstamo es una operación atómica que revalida el límite (evita que dos sedes superen 10,000 a la vez). |
| RNF-03 | **Precisión monetaria:** valores decimales exactos (`NUMERIC(12,2)`), nunca flotantes; el cronograma suma exactamente el capital (la última cuota absorbe el redondeo). |
| RNF-04 | **Seguridad:** acceso solo con sesión; claves y llaves de API fuera del navegador; cada trabajadora ve solo funciones de su rol. |
| RNF-05 | **Auditabilidad:** quién, cuándo y desde qué sede creó/aprobó cada préstamo. Cronograma inmutable una vez aprobado. |
| RNF-06 | **Usabilidad:** flujo cliente → préstamo en pocos pasos; mensajes de error claros en español que indiquen la regla incumplida. |
| RNF-07 | **Rendimiento:** cronograma de hasta 60 cuotas y evaluación en menos de 2 s. |
| RNF-08 | **Disponibilidad en la demo:** sistema desplegado en línea y plan B local. |
| RNF-09 | **Zona horaria:** todas las fechas de vencimiento y estados se calculan en America/Lima. |

---

## 2. Historias de usuario y criterios de aceptación

Formato: *Como … quiero … para …* · criterios en *Dado / Cuando / Entonces*.

### Épica 1 — Acceso y sedes

**HU-01 · Iniciar sesión** (M · RF-01, RF-02)
Como trabajadora de una sede, quiero iniciar sesión, para operar el sistema de forma segura.
- **CA1** Dado un usuario válido, cuando ingresa credenciales correctas, entonces accede al sistema y se muestra su nombre y sede.
- **CA2** Dado credenciales incorrectas, cuando intenta ingresar, entonces ve un mensaje genérico ("Usuario o contraseña incorrectos") sin revelar cuál falló.
- **CA3** Dado que no hay sesión, cuando intenta abrir cualquier pantalla interna, entonces es redirigida al login.
- **CA4** Cuando cierra sesión, entonces no puede volver a las pantallas internas con el botón "atrás".

**HU-02 · Sedes y trabajadoras** (C · RF-03)
Como administrador, quiero contar con las 5 sedes y sus trabajadoras, para que cada operación quede asociada a su origen.
- **CA1** El sistema inicia con 5 sedes y al menos una trabajadora por sede.
- **CA2** Toda trabajadora pertenece a exactamente una sede.
- **CA3** (Could) El administrador puede crear/desactivar trabajadoras; una desactivada no puede iniciar sesión.
- **CA4** Solo existen los roles Trabajador y Administrador; solo el Administrador accede al reporte por sede y a la gestión de usuarios.

### Épica 2 — Clientes

**HU-03 · Registrar cliente con nombre validado** (M · RF-04, RF-05, RF-07, RF-30 · RN-03, RN-30)
Como trabajadora, quiero registrar un cliente validando su DNI, para asegurar que su nombre sea el correcto.
- **CA1** Dado un DNI de 8 dígitos numéricos, cuando lo consulta, entonces los nombres y apellidos se autocompletan en **solo lectura**.
- **CA2** Dado un DNI con menos/más de 8 dígitos o con letras, entonces el sistema lo rechaza con un mensaje claro y no consulta.
- **CA3** Dado un DNI inexistente en la consulta, entonces no se puede registrar con datos verificados.
- **CA4** Dado un DNI ya registrado, cuando intenta registrarlo, entonces no se crea un duplicado y se muestra la ficha existente.
- **CA5** Dado que el servicio de identidad no responde, cuando la trabajadora elige ingreso manual, entonces debe escribir el nombre dos veces (deben coincidir), marcar "verifiqué contra el DNI físico" y el cliente queda marcado **"No verificado"** de forma visible.
- **CA6** Dado un cliente verificado, entonces nombres y apellidos no son editables; solo teléfono y dirección.
- **CA7** El nombre se guarda normalizado (mayúsculas, sin espacios dobles, sin dígitos).
- **CA8** Teléfono obligatorio (para contacto de cobranza); dirección opcional.
- **CA9** Se registra la fecha de caducidad del DNI; si el DNI ya caducó o no se indica la fecha, no se registra el cliente.
- **CA10** Los datos del cliente son solo: DNI, nombres, apellidos, teléfono, dirección, caducidad del DNI y, de forma opcional, RUC y razón social (CA11 a CA16).
- **CA11** *(v1.3)* Antes del registro, el formulario ofrece un selector "DNI / RUC". Con "DNI" el flujo es el de CA1 a CA10.
- **CA12** *(v1.3)* Con "RUC", dado un RUC de 11 dígitos que empieza con 10 o 20, cuando lo consulta, entonces se muestran la razón social, el estado y la condición del contribuyente (consulta a SUNAT).
- **CA13** *(v1.3)* Dado un RUC con estado distinto de ACTIVO o condición distinta de HABIDO, entonces se rechaza con un mensaje que indica el estado y la condición, y no se registra.
- **CA14** *(v1.3)* Con RUC se sigue exigiendo el DNI del titular, consultado en RENIEC (CA1 a CA9). El cliente se identifica y cuenta para el tope por su DNI: el RUC no crea otro cliente ni otro tope.
- **CA15** *(v1.3)* El RUC y la razón social se guardan como datos opcionales del cliente. La base de datos valida el RUC (11 dígitos, empieza con 10 o 20) y exige la razón social cuando hay RUC.
- **CA16** *(v1.3)* Dado que el servicio de RUC no responde, entonces no se puede registrar con RUC; el cliente puede registrarse solo con DNI. *(Por confirmar con el profesor si debe permitirse ingresar el RUC a mano.)*

**HU-04 · Rechazar documentos no permitidos** (M · RF-06 · RN-04)
Como trabajadora, quiero que el sistema no admita clientes con carnet de extranjería o pasaporte, para cumplir la política de préstamos.
- **CA1** El formulario pide tipo de documento (DNI / Carnet de extranjería / Pasaporte).
- **CA2** Dado Carnet de extranjería o Pasaporte, entonces no se crea el cliente y se muestra: "No se otorgan préstamos a clientes identificados solo con carnet de extranjería o pasaporte."
- **CA3** Dado DNI, entonces el flujo continúa normalmente.
- **CA4** No es posible saltarse la regla por otro camino (validación también en servidor/BD).
- **CA5** *(v1.3)* El selector "DNI / RUC" no habilita clientes sin DNI: el RUC no es un documento de identificación alternativo. Carnet de extranjería y pasaporte siguen rechazados aunque se indique un RUC.

**HU-05 · Buscar y consultar cliente** (M · RF-08, RF-09)
Como trabajadora, quiero buscar un cliente y ver su situación completa, para decidir si se le puede prestar.
- **CA1** Dado un DNI o parte del nombre, entonces el sistema lista coincidencias (todas las sedes).
- **CA2** La ficha muestra estado (Al día / Moroso / Extrajudicial), capital vigente, disponible (de 10,000), préstamos y próximas cuotas.
- **CA3** Un cliente Moroso o Extrajudicial se distingue visualmente con alerta.
- **CA4** La ficha incluye préstamos de **todas** las sedes.

### Épica 3 — Préstamos

**HU-06 · Evaluar solicitud e informe** (M · RF-10, RF-11 · RN-05 a RN-09, RN-12, RN-19, RN-21)
Como trabajadora, quiero evaluar una solicitud (monto y plazo), para informar al cliente si procede y bajo qué condiciones.
- **CA1** Dado un cliente Al día con disponible suficiente, monto entre S/ 1 y su disponible y plazo de 1 a 60 meses, entonces el informe indica **Aprobable** con cuota mensual, total a pagar, total de intereses y fecha de la primera cuota.
- **CA2** Dado un monto mayor a su disponible, entonces **Rechazado** con el motivo y el monto máximo que sí podría pedir. Ej.: vigente 7,000 + solicitud 5,000 → rechazado, máximo permitido 3,000.
- **CA3** Dado monto 10,000 y capital vigente 0, entonces es **Aprobable**; monto 10,001 es rechazado.
- **CA4** Dado plazo 0, mayor a 60 meses o no entero, entonces es rechazado.
- **CA5** Dado un cliente Moroso, entonces rechazado por morosidad **aunque** tenga disponible.
- **CA6** Dado un cliente Extrajudicial, entonces rechazado por cobranza extrajudicial.
- **CA7** Si hay varios incumplimientos a la vez, el informe lista **todos**.
- **CA8** Evaluar no crea ningún préstamo.
- **CA9** Dado un cliente con DNI vencido, entonces rechazado, aunque cumpla todo lo demás.
- **CA10** El informe muestra solo el resultado y sus condiciones; no consulta centrales de riesgo ni solicita datos adicionales.

**HU-07 · Aprobar y registrar el préstamo** (M · RF-12 · RN-05, RN-06, RN-12)
Como trabajadora, quiero aprobar una solicitud evaluada, para entregar el préstamo y dejar todo registrado.
- **CA1** Dado un informe Aprobable, cuando confirma, entonces se crea el préstamo en estado **Vigente** con monto, plazo, tasa 30%, fecha de desembolso (hoy), sede, trabajadora y fecha/hora.
- **CA2** Dado un informe Rechazado, entonces el botón de aprobar no está disponible.
- **CA3** Al confirmar, el sistema **revalida** las reglas; si entre la evaluación y la confirmación el cliente quedó sin disponible o moroso (p. ej., otra sede le prestó), entonces no aprueba y explica el motivo.
- **CA4** La creación del préstamo y de su cronograma es atómica: o se guarda todo o nada.
- **CA5** Un préstamo aprobado no se puede editar (monto, plazo, tasa).
- **CA6** Antes de aprobar, el trabajador debe confirmar de forma explícita que el cliente está conforme con las condiciones del informe; sin esa confirmación no se registra el préstamo. El contrato se imprime después de aprobar y se firma en papel por el cliente y por la empresa.
- **CA7** No existe función de anular ni de revertir un préstamo aprobado.
- **CA8** Tras aprobar, el sistema lleva al detalle del préstamo, desde donde se imprime el contrato y el cronograma (HU-09).

**HU-08 · Cronograma automático** (M · RF-13 · RN-10, RN-11)
Como trabajadora, quiero que se genere el cronograma al aprobar, para entregar al cliente el detalle mes a mes.
- **CA1** Dado un préstamo de 5,000 a 6 meses, entonces se generan 6 cuotas con vencimientos desembolso +30, +60, … +180 días.
- **CA2** Cada cuota muestra: N°, fecha de vencimiento, cuota, capital, interés, saldo pendiente.
- **CA3** La suma de las porciones de capital es exactamente el monto prestado; la última cuota ajusta el redondeo y el saldo final es 0.00.
- **CA4** Dado plazo de 1 mes, entonces 1 cuota; dado 60 meses, 60 cuotas.
- **CA5** Ejemplo de validación (TEA 30%, método por defecto CAPITAL_CONSTANTE, por confirmar con el profesor): 5,000 a 6 meses → cuotas 943.85, 925.44, 907.01, 888.59, 870.18 y 851.75; total ≈ S/ 5,386.82 (intereses ≈ S/ 386.82). *Nota:* con CUOTA_FIJA (alternativa parametrizable) la cuota sería ≈ S/ 898.98 y el total ≈ S/ 5,393.86.
- **CA6** Todas las cuotas nacen en estado Pendiente.
- **CA7** El cronograma muestra en su encabezado nombre del cliente, fecha del préstamo, monto y plazo (datos que pidió el profesor).

**HU-09 · Contrato y cronograma imprimible** (M · RF-14 · RN-10)
Como trabajadora, quiero imprimir/descargar el contrato de pagos, para entregárselo al cliente.
- **CA1** El documento incluye datos del cliente (DNI y nombre), sede, trabajadora, fecha, monto, plazo, tasa y el cronograma completo.
- **CA2** Se puede abrir de nuevo desde el detalle del préstamo y es idéntico al original.
- **CA3** Incluye leyenda sobre morosidad (vence a los 30 días; el atraso deja al cliente sin nuevos préstamos).

**HU-10 · Listar y consultar préstamos** (M · RF-15)
Como trabajadora, quiero ver los préstamos y su detalle, para dar seguimiento.
- **CA1** Se lista por cliente, estado y sede.
- **CA2** El detalle muestra el cronograma con el estado de cada cuota (Pendiente / Pagada / Vencida).
- **CA3** Se ven los préstamos de todas las sedes.

**HU-11 · Límite global y liberación de saldo** (M · RN-05 a RN-07)
Como prestamista, quiero que el límite de 10,000 se controle sobre el capital vigente de todos los préstamos del cliente, para no exceder el tope.
- **CA1** Capital vigente = suma del capital de los préstamos Vigentes del cliente (con `liberacion_cupo = AL_CANCELAR`, el monto completo de cada préstamo hasta que se cancela). Con la alternativa `CAPITAL_AMORTIZADO` sería la suma de la porción de capital de las cuotas no pagadas.
- **CA2** Dado vigente 5,000, entonces puede pedir hasta 5,000 más, en uno o varios préstamos (p. ej., 1,000 + 1,000 + 1,000).
- **CA3** Dado un préstamo con algunas cuotas pagadas pero aún no cancelado, entonces su capital sigue contando en el capital vigente (no se libera cupo parcialmente). Cuando todas sus cuotas están pagadas, el préstamo pasa a Cancelado, su capital deja de contar y aumenta el disponible.
- **CA4** Dos préstamos de 5,000 (uno a 1 año y otro a 2 meses): al pagar por completo el de 2 meses (queda Cancelado), puede volver a pedir hasta 5,000 mientras no sea moroso.
- **CA5** El límite es global entre sedes.
- **CA6** Los intereses **no** cuentan para el tope.
- **CA7** Caso planteado por el profesor en su chat: préstamo de 10,000 a 2 años, con 5,000 ya amortizados al año, ¿puede solicitar 5,000? Con la regla vigente (AL_CANCELAR) **no**: debe pagar el préstamo completo. Este caso se contrastará con el profesor (*por confirmar*); si respondiera lo contrario se activa CAPITAL_AMORTIZADO (CA8). Con capital constante, el capital amortizado a los 12 meses sería exactamente 5,000.
- **CA8** El modo vigente es AL_CANCELAR (parámetro `liberacion_cupo`). Si el profesor confirmara la liberación por capital amortizado, se cambia el parámetro a CAPITAL_AMORTIZADO sin cambiar el diseño.

### Épica 4 — Morosidad

**HU-12 · Estado Moroso automático** (M · RF-16 · RN-18)
Como prestamista, quiero que un cliente pase a Moroso al no pagar su cuota, para controlar el riesgo sin intervención manual.
- **CA1** Dada una cuota Pendiente con vencimiento el día 30, cuando llega el día 31 sin pago, entonces el cliente pasa a **Moroso** y la cuota a **Vencida**.
- **CA2** Dado que paga (o aún es el día de vencimiento), entonces sigue **Al día**.
- **CA3** El estado se recalcula al consultar al cliente y mediante fn_actualizar_estados (botón del panel de demostración); no hay tarea programada en el MVP.
- **CA4** Se registra la fecha en que pasó a Moroso.
- **CA5** Con varios préstamos, basta una cuota vencida para que sea Moroso.

**HU-13 · Bloqueo de nuevos préstamos** (M · RF-17 · RN-19, RN-21)
Como prestamista, quiero que no se entregue crédito a morosos ni extrajudiciales, para no aumentar mi exposición.
- **CA1** Dado un cliente Moroso con disponible (p. ej., 6,000 libres), entonces no puede aprobar un nuevo préstamo.
- **CA2** Dado un cliente Extrajudicial, entonces no puede aprobar un nuevo préstamo.
- **CA3** El bloqueo se aplica en evaluación y también en aprobación (servidor/BD).
- **CA4** El mensaje indica el motivo (estado) y la cuota vencida más antigua.

**HU-14 · Estado Extrajudicial automático** (M · RF-16 · RN-20, RN-21)
Como prestamista, quiero que un moroso sin pagos por más de un año pase a Extrajudicial, para derivarlo a cobranza externa.
- **CA1** Dado un Moroso sin ningún pago por más de 365 días , entonces pasa automáticamente a **Extrajudicial**.
- **CA2** Dado un Moroso con 364 días o con un abono dentro del año, entonces sigue Moroso.
- **CA3** Se registra la fecha de pase a Extrajudicial.
- **CA4** Un Extrajudicial aparece en el reporte de derivación.
- **CA5** El estado no regresa automáticamente a Al día.

**HU-23 · Mora por día de atraso** (M · RF-27 · RN-24)
Como prestamista, quiero que el sistema calcule los días de atraso y la mora (1% diario) de cada moroso, para saber cuánto debe regularizar.
- **CA1** El día de vencimiento no genera mora; el día 31 cuenta como 1 día de atraso.
- **CA2** Mora compuesta: una cuota de S/ 1,000 con 10 días de atraso acumula S/ 104.62 de mora (modalidad confirmable: simple daría S/ 100.00).
- **CA3** La ficha del cliente y el reporte muestran: cuotas vencidas, días de atraso, deuda vencida, mora acumulada y total a regularizar.
- **CA4** La mora no cuenta para el tope de 10,000 (no es capital).
- **CA5** Con varias cuotas vencidas, la mora se calcula por cada cuota desde su propio vencimiento y se suma.

**HU-15 · Reporte de morosos y extrajudiciales** (S · RF-18 · RN-21)
Como prestamista, quiero un listado de morosos y extrajudiciales, para gestionarlos y derivarlos a la empresa de cobranza.
- **CA1** Muestra DNI, nombre, teléfono, estado, deuda vencida, mora acumulada, total a regularizar, días de atraso, fecha del último pago y sede.
- **CA2** Se filtra por estado y por sede.
- **CA3** Se exporta a CSV.

### Épica 5 — Transversales

**HU-16 · Auditoría** (S · RF-19)
Como prestamista, quiero saber quién hizo qué, para tener trazabilidad.
- **CA1** Se registra usuaria, sede, fecha/hora y acción en: crear cliente, evaluar préstamo, aprobar préstamo y cambios de estado. Evaluar queda registrado aunque no cree ningún préstamo.
- **CA2** La bitácora no se puede editar desde la aplicación.
- **CA3** *(v1.3)* La bitácora es visible en una pantalla del sistema, de solo lectura, con filtros por rango de fechas, acción y sede; muestra fecha/hora, trabajadora, sede, acción y detalle. *(Perfil con acceso: Administrador, por confirmar.)*

**HU-17 · Reporte por sede** (M · RF-20 · RN-23)
Como prestamista, quiero ver por sede cuántos morosos hay y cuántos ingresos, para evaluar cada sede.
- **CA1** Por sede (Chimbote, Trujillo, Chiclayo, Piura, Tumbes) muestra: clientes Morosos y Extrajudiciales, clientes nuevos y préstamos otorgados en el período, capital colocado y capital vigente.
- **CA2** Permite filtrar por rango de fechas y ver el total consolidado.
- **CA3** Los ingresos (dinero cobrado) se calculan a partir de las cuotas pagadas; mientras no exista el módulo de pagos solo reflejan datos precargados. Se muestran además los intereses proyectados.

**HU-T1 · Modo demostración** (M · RF-21) — *historia técnica*
Como equipo, queremos datos de ejemplo y una fecha simulada, para demostrar morosidad y extrajudicial sin esperar meses.
- **CA1** Existe un conjunto de datos (clientes Al día, Moroso, Extrajudicial, con vigente 7,000, etc.) que se puede reiniciar con un solo comando.
- **CA2** Existe una "fecha de referencia" configurable solo en modo demostración, visible con un aviso en pantalla, que mueve el cálculo de vencimientos y estados.
- **CA3** En producción/real la fecha de referencia es siempre la del día.

### Épica 6 — Pagos (FUERA de esta entrega; no se construye de forma parcial)

**HU-18 · Registrar pago de cuota** (M-S2 · RF-22 · RN-13)
Como trabajadora, quiero registrar el pago de una cuota, para actualizar la deuda del cliente.
- **CA1** El pago se registra con método(s), monto y referencia (n.º de operación Yape/tarjeta); no hay cobro desde el sistema.
- **CA2** Al pagar, la cuota pasa a Pagada y se libera su capital en el límite.
- **CA3** Se emite comprobante de pago.

**HU-19 · Pago con múltiples métodos** (M-S2 · RF-23 · RN-14)
- **CA1** Una operación admite N líneas: efectivo, tarjeta y una o más cuentas Yape distintas.
- **CA2** La suma de líneas debe ser igual al monto de la cuota; si no, no se registra.
- **CA3** No hay límite fijo de líneas.

**HU-20 · Pago anticipado y orden de cuotas** (M-S2 · RF-24, RF-25 · RN-15, RN-16)
- **CA1** Puede pagar una cuota antes de su vencimiento si no tiene cuotas anteriores sin pagar.
- **CA2** Dada una cuota anterior Pendiente/Vencida, intentar pagar una posterior se bloquea y se indica cuál debe pagar primero.
- **CA3** Un moroso solo puede pagar primero la cuota vencida más antigua.

**HU-21 · Sin liquidación ni condonación** (M · RN-17)
- **CA1** El sistema no ofrece ninguna función de descuento, perdón o liquidación por monto menor a lo adeudado.
- **CA2** Toda cuota se registra por su importe completo.

**HU-22 · Regularización del moroso** (S-S2 · RF-26)
- **CA1** Al pagar todas sus cuotas vencidas, un Moroso vuelve a Al día y puede volver a solicitar préstamos.
- **CA2** Un Extrajudicial no vuelve automáticamente a Al día.

---

## Registro de cambios

**1.3.2 (18/10/2026)**
- HU-07 CA6 y RF-12: la casilla confirma la conformidad con las condiciones del informe; el contrato se imprime después de aprobar y se firma en papel. HU-07 CA8 nuevo: tras aprobar se lleva al detalle del préstamo. RN-26 no se modificó.

**1.3.1 (17/10/2026)**
- RF-16 y HU-12 CA3: el estado se recalcula al consultar al cliente y con `fn_actualizar_estados` (botón del panel de demostración); no hay tarea programada (`pg_cron`) en el MVP.

**1.3 (17/10/2026)**
- RN-07 y HU-11 (CA1, CA3, CA4, CA7, CA8): liberación de cupo **AL_CANCELAR** como regla vigente, con la respuesta del profesor. El caso de 10,000 a 2 años queda como "por confirmar".
- RN-04, RN-30, RF-04, RF-30, HU-03 (CA10 ajustado; CA11 a CA16 nuevos) y HU-04 (CA5 nuevo): selector DNI / RUC.
- HU-08 CA5: método por defecto CAPITAL_CONSTANTE (943.85); CUOTA_FIJA (898.98) queda como nota. Método y mora (COMPUESTA) siguen "por confirmar con el profesor".
- HU-09, HU-17 (RF-14, RF-20) pasan a Must en el Sprint 1. HU-16 (RF-19, CA1 ajustado, CA3 nuevo): auditoría visible e incluye evaluar.
- Pagos (HU-18 a HU-22) quedan para el Sprint 2.

**1.2 (15/10/2026)** · versión anterior.
