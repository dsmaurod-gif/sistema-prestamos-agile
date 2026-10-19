# Contrato de la API (lo que el frontend puede llamar)

**Versión 1.3 · 17/10/2026**

La base de datos tiene las **reglas de negocio**. El frontend **no las reimplementa**: llama a estas funciones con `supabase.rpc()` y muestra lo que devuelven.
Los errores de regla llegan en `error.message` con texto listo para mostrar al usuario (en español).

> Si una función "no se encuentra" después de una actualización de la BD, el integrador ejecuta en Supabase: `notify pgrst, 'reload schema';`

## 0. Cómo llamar

```js
const { data, error } = await supabase.rpc('fn_evaluar_prestamo', {
  p_cliente: clienteId, p_monto: 5000, p_plazo: 6,
});
if (error) { /* mostrar error.message */ }
```
Todos los parámetros van **con nombre** y con el prefijo `p_`.

## 1. Quién es el trabajador (identidad)

1. Login: `supabase.auth.signInWithPassword({ email, password })`.
2. Luego leer su ficha:
```js
const { data: trabajador } = await supabase
  .from('trabajadores').select('id, nombre, rol, sede_id, sedes(nombre)')
  .eq('auth_user_id', user.id).single();
```
3. `trabajador.id` se pasa como `p_trabajador` en registrar cliente y aprobar préstamo. `rol` es `TRABAJADOR` o `ADMIN`.
4. El reporte por sede y los parámetros de demo solo se muestran al rol `ADMIN` (de momento lo controla el frontend; luego lo reforzará la BD).

> **Importante:** la forma de pasar `p_trabajador` cambiará cuando se active la seguridad. Por eso **toda llamada va dentro de `services/`**, nunca desde un componente.

## 2. Funciones (RPC)

### `fn_registrar_cliente` → `uuid` (id del cliente)
| Parámetro | Tipo | Notas |
|---|---|---|
| `p_tipo_documento` | text | `'DNI'`. Cualquier otro valor se rechaza con el mensaje de política |
| `p_dni` | text | 8 dígitos |
| `p_nombres`, `p_apellidos` | text | Se normalizan a MAYÚSCULAS |
| `p_telefono` | text | Obligatorio (7 a 15 dígitos, puede llevar `+` o espacios) |
| `p_direccion` | text/null | Opcional |
| `p_verificado` | boolean | `true` si el nombre vino de la consulta de DNI; `false` si se escribió a mano |
| `p_trabajador` | uuid | Ver sección 1 |
| `p_dni_caducidad` | date | `'AAAA-MM-DD'`. Si ya caducó, se rechaza |
| `p_ruc` | text/null | *(v1.3, opcional, default `null`)* 11 dígitos que empiezan con 10 o 20. El cliente se sigue identificando por DNI; el RUC no lo sustituye. La Edge Function `consultar-ruc` valida estado/condición antes (el formulario rechaza si no es ACTIVO y HABIDO) |
| `p_razon_social` | text/null | *(v1.3, opcional, default `null`)* Obligatoria si se envía `p_ruc`; sin RUC se rechaza. Se normaliza a MAYÚSCULAS |

Errores típicos: DNI ≠ 8 dígitos, DNI duplicado, DNI no vigente, carnet/pasaporte, RUC mal formado (no son 11 dígitos o no empieza con 10/20), RUC sin razón social. **Cambio de firma en v1.3:** la función tiene 11 parámetros; los dos últimos son opcionales, así que las llamadas con los 9 originales siguen funcionando (tras ejecutar `sql/08_ajustes_v1_3.sql`).

### `fn_evaluar_prestamo` → `jsonb` (no crea préstamos; registra la consulta en la bitácora)
Parámetros: `p_cliente uuid`, `p_monto numeric`, `p_plazo int` (meses).
```json
{
  "aprobable": true,
  "motivos": [],                       // lista de textos; vacía si es aprobable
  "estado_cliente": "AL_DIA",          // AL_DIA | MOROSO | EXTRAJUDICIAL
  "capital_vigente": 0.00,
  "disponible": 10000.00,
  "monto_maximo": 10000.00,
  "primera_cuota": 943.85,             // null si no es aprobable
  "total_a_pagar": 5386.82,
  "total_intereses": 386.82,
  "primer_vencimiento": "2026-11-18"
}
```
Si `aprobable` es `false`, mostrar **todos** los textos de `motivos`.

*(v1.3)* Ejemplo calculado para 5,000 a 6 meses con el método por defecto `CAPITAL_CONSTANTE` (con `CUOTA_FIJA`: primera cuota 898.98, total 5,393.86). **Cada evaluación deja una fila `EVALUAR_PRESTAMO` en `bitacora`** (cliente, monto, plazo, resultado y motivos; la trabajadora se toma de la sesión). `fn_aprobar_prestamo` revalida sin duplicar esa fila.

### `fn_aprobar_prestamo` → `uuid` (id del préstamo)
Parámetros: `p_cliente`, `p_monto`, `p_plazo`, `p_trabajador`, `p_cliente_conforme boolean`.
- `p_cliente_conforme` debe ser `true` (casilla: "El cliente está conforme con las condiciones y firmará el contrato impreso"). **No existe anulación posterior.**
- Revalida todas las reglas; si algo cambió desde la evaluación, devuelve error.
- Crea el préstamo y su cronograma (cuotas) de forma atómica.

### `fn_deuda_cliente(p_cliente)` → tabla (1 fila)
`cuotas_vencidas, deuda_vencida, mora, total_a_regularizar, dias_atraso, vencimiento_mas_antiguo`. Actualiza estados antes de calcular. Para la ficha del cliente.

### `fn_reporte_morosos(p_sede int default null)` → tabla
`dni, cliente, telefono, estado, fecha_moroso, cuotas_vencidas, dias_atraso, deuda_vencida, mora, total_a_regularizar, ultimo_pago, sedes`. `p_sede` = id de sede para filtrar (o `null` = todas). Para exportar a CSV.

### `fn_reporte_sedes(p_desde date default null, p_hasta date default null)` → tabla (1 fila por sede)
`sede, clientes_nuevos, prestamos_otorgados, capital_colocado, capital_vigente, intereses_proyectados, ingresos_cobrados, clientes_morosos, clientes_extrajudiciales`.

### `fn_actualizar_estados(p_cliente uuid default null)` → void
Recalcula cuotas vencidas, Moroso y Extrajudicial. Ya la llaman evaluar, deuda y reportes; normalmente no hace falta llamarla.

### `fn_capital_vigente(p_cliente)` → numeric
Capital vigente del cliente. Disponible = 10,000 − capital vigente.

## 3. Lectura de tablas (con `.from()`)

| Tabla | Campos principales |
|---|---|
| `clientes` | `id, dni, dni_caducidad, nombres, apellidos, telefono, direccion, nombre_verificado, estado, fecha_moroso, fecha_extrajudicial, sede_registro_id, ruc, razon_social` |
| `prestamos` | `id, cliente_id, sede_id, trabajador_id, monto, plazo_meses, tea, metodo_cuota, fecha_desembolso, estado (VIGENTE/CANCELADO)` |
| `cuotas` | `id, prestamo_id, numero, fecha_vencimiento, cuota, capital, interes, saldo, estado (PENDIENTE/PAGADA/VENCIDA), fecha_pago` |
| `sedes` | `id, nombre, ciudad` |
| `bitacora` | `fecha, accion, entidad, entidad_id, detalle, trabajador_id, sede_id`. Acciones: `CREAR_CLIENTE`, `EVALUAR_PRESTAMO`, `APROBAR_PRESTAMO`, `CAMBIO_ESTADO`. Solo lectura: no se puede editar ni borrar |

Ejemplos:
```js
// Buscar por DNI o por nombre
supabase.from('clientes').select('*').or(`dni.eq.${q},apellidos.ilike.%${q}%,nombres.ilike.%${q}%`).limit(20);

// Préstamo con su cronograma y su cliente
supabase.from('prestamos').select('*, clientes(*), cuotas(*)').eq('id', prestamoId).single();

// Préstamos de un cliente
supabase.from('prestamos').select('*, cuotas(*)').eq('cliente_id', clienteId).order('fecha_desembolso', { ascending: false });

// Listado de préstamos con cliente y sede (HU-10) → PrestamosService.listar()
supabase.from('prestamos').select('*, clientes(*), sedes(nombre)').eq('estado', 'VIGENTE').eq('sede_id', 2);

// Bitácora con trabajadora y sede (HU-16) → ReportesService.listarBitacora()
supabase.from('bitacora').select('*, trabajadores(nombre), sedes(nombre)').eq('accion', 'EVALUAR_PRESTAMO').order('fecha', { ascending: false });
```
**Solo lectura** desde el frontend: nunca `insert`/`update` directo en `clientes`, `prestamos` ni `cuotas` (saltaría las reglas). Toda escritura va por las funciones.

## 4. Modo demostración (solo ADMIN)

La fecha simulada vive en `parametros` (clave `fecha_referencia`, formato `AAAA-MM-DD`; vacío = fecha real):
```js
supabase.from('parametros').update({ valor: '2026-12-01' }).eq('clave', 'fecha_referencia');
supabase.from('parametros').update({ valor: '' }).eq('clave', 'fecha_referencia');   // volver a la fecha real
```
- Mostrar un **aviso visible** en toda la app mientras haya fecha simulada.
- Al avanzar la fecha, las cuotas pasan a vencidas y los clientes a Moroso/Extrajudicial; **no se revierte** al volver atrás: para reiniciar, el integrador ejecuta `sql/04_seed_demo.sql`.
- Otros parámetros editables por el administrador: `metodo_cuota`, `mora_modalidad`, `liberacion_cupo` (ver nota de la tabla).
- **Valores vigentes (v1.3, tras `sql/08_ajustes_v1_3.sql`):** `liberacion_cupo = AL_CANCELAR` (el cupo de un préstamo solo se libera cuando se paga por completo; la alternativa es `CAPITAL_AMORTIZADO`), `metodo_cuota = CAPITAL_CONSTANTE`, `mora_modalidad = COMPUESTA`, `fecha_referencia = ''`. El método y la mora están *por confirmar con el profesor*.

## 5. Reglas de presentación

- Montos: `S/ 1,234.50`. Fechas: `DD/MM/AAAA`.
- Estado del cliente con color: Al día (verde), Moroso (ámbar), Extrajudicial (rojo).
- Cuota `VENCIDA` resaltada; mostrar días de atraso y mora donde haya deuda.
- Antes de aprobar: pantalla de resumen (monto, plazo, cuota, total, primer vencimiento) + casilla de conformidad.

## 6. Edge Function `consultar-dni` (RENIEC)

Autocompleta nombres y apellidos de un DNI (HU-03 CA1). No es una RPC de SQL: se llama con `supabase.functions.invoke`, siempre desde `ClientesService.consultarDni(dni)`. El token del proveedor vive solo en el secret `PERU_API_TOKEN` del servidor.

```js
const { data, error } = await supabase.functions.invoke('consultar-dni', { body: { dni: '12345678' } });
```

**Entrada:** `{ "dni": "12345678" }` (8 dígitos numéricos, como texto).

| Caso | HTTP | Cuerpo |
|---|---|---|
| DNI existe | 200 | `{ "existe": true, "nombres": "DIEGO ALONSO", "apellidos": "PEREZ GOMEZ" }` (MAYÚSCULAS, sin espacios dobles) |
| DNI no existe | 200 | `{ "existe": false }` |
| DNI mal formado (no son 8 dígitos) | 400 | `{ "error": "El DNI debe tener exactamente 8 dígitos numéricos." }` |
| Proveedor caído, token inválido, cuota agotada o timeout (8 s) | 502 | `{ "error": "Servicio de consulta de DNI no disponible" }` |

- Con `existe: true` el nombre se muestra en solo lectura y el cliente se registra con `p_verificado = true`.
- Con `existe: false` no se puede registrar con datos verificados (HU-03 CA3).
- Con el error 502 (`consultarDni` lanza `ErrorBaseDatos`) se ofrece el ingreso manual con doble confirmación y `p_verificado = false` (HU-03 CA5).
- La función exige JWT: solo responde con la sesión iniciada (o la llave pública de la app).

## 7. Edge Function `consultar-ruc` (SUNAT)

Consulta un RUC para el selector "DNI / RUC" del registro (HU-03 CA12 a CA14). Se llama con `supabase.functions.invoke`, siempre desde `ClientesService.consultarRuc(ruc)`. El token del proveedor vive solo en el secret `PERU_API_TOKEN` del servidor.

```js
const { data, error } = await supabase.functions.invoke('consultar-ruc', { body: { ruc: '20601030013' } });
```

**Entrada:** `{ "ruc": "20601030013" }` (11 dígitos numéricos, como texto).

| Caso | HTTP | Cuerpo |
|---|---|---|
| RUC existe | 200 | `{ "existe": true, "ruc": "20601030013", "razon_social": "REXTIE S.A.C.", "estado": "ACTIVO", "condicion": "HABIDO" }` |
| RUC no existe | 200 | `{ "existe": false }` |
| RUC mal formado | 400 | `{ "error": "El RUC debe tener exactamente 11 dígitos numéricos." }` |
| Proveedor caído, token inválido, cuota agotada o timeout (8 s) | 502 | `{ "error": "Servicio de consulta de RUC no disponible" }` |

- La pantalla debe rechazar el RUC si `estado` ≠ `ACTIVO` o `condicion` ≠ `HABIDO`, y seguir exigiendo el DNI del titular (consultado con `consultar-dni`).
- Con el error 502, `consultarRuc` lanza `ErrorBaseDatos`: no se puede registrar con RUC (se registra solo con DNI). *Por confirmar con el profesor* si debe permitirse el ingreso manual del RUC.
- Al registrar, se envían `p_ruc` y `p_razon_social` a `fn_registrar_cliente` (sección 2).

## Registro de cambios

**1.3 (17/10/2026)**
- `fn_registrar_cliente`: nuevos parámetros opcionales `p_ruc` y `p_razon_social` (firma de 11 parámetros).
- `fn_evaluar_prestamo`: registra `EVALUAR_PRESTAMO` en la bitácora; el ejemplo de respuesta se corrigió para que sea coherente con `CAPITAL_CONSTANTE`.
- Parámetros vigentes: `liberacion_cupo = AL_CANCELAR`. Tabla `clientes`: columnas `ruc` y `razon_social`.
- Nueva Edge Function `consultar-ruc` (sección 7). Nuevas lecturas: listado de préstamos con cliente y sede, bitácora con trabajadora y sede.
- La bitácora es de solo lectura (no se edita ni se borra).
