# Contrato de la API (lo que el frontend puede llamar)

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

Errores típicos: DNI ≠ 8 dígitos, DNI duplicado, DNI no vigente, carnet/pasaporte.

### `fn_evaluar_prestamo` → `jsonb` (no crea nada)
Parámetros: `p_cliente uuid`, `p_monto numeric`, `p_plazo int` (meses).
```json
{
  "aprobable": true,
  "motivos": [],                       // lista de textos; vacía si es aprobable
  "estado_cliente": "AL_DIA",          // AL_DIA | MOROSO | EXTRAJUDICIAL
  "capital_vigente": 7000.00,
  "disponible": 3000.00,
  "monto_maximo": 3000.00,
  "primera_cuota": 943.85,             // null si no es aprobable
  "total_a_pagar": 5393.87,
  "total_intereses": 393.87,
  "primer_vencimiento": "2026-11-18"
}
```
Si `aprobable` es `false`, mostrar **todos** los textos de `motivos`.

### `fn_aprobar_prestamo` → `uuid` (id del préstamo)
Parámetros: `p_cliente`, `p_monto`, `p_plazo`, `p_trabajador`, `p_cliente_conforme boolean`.
- `p_cliente_conforme` debe ser `true` (casilla: "El cliente está conforme y firmó el contrato"). **No existe anulación posterior.**
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
| `clientes` | `id, dni, dni_caducidad, nombres, apellidos, telefono, direccion, nombre_verificado, estado, fecha_moroso, fecha_extrajudicial, sede_registro_id` |
| `prestamos` | `id, cliente_id, sede_id, trabajador_id, monto, plazo_meses, tea, metodo_cuota, fecha_desembolso, estado (VIGENTE/CANCELADO)` |
| `cuotas` | `id, prestamo_id, numero, fecha_vencimiento, cuota, capital, interes, saldo, estado (PENDIENTE/PAGADA/VENCIDA), fecha_pago` |
| `sedes` | `id, nombre, ciudad` |
| `bitacora` | `fecha, accion, entidad, entidad_id, detalle, trabajador_id, sede_id` |

Ejemplos:
```js
// Buscar por DNI o por nombre
supabase.from('clientes').select('*').or(`dni.eq.${q},apellidos.ilike.%${q}%,nombres.ilike.%${q}%`).limit(20);

// Préstamo con su cronograma y su cliente
supabase.from('prestamos').select('*, clientes(*), cuotas(*)').eq('id', prestamoId).single();

// Préstamos de un cliente
supabase.from('prestamos').select('*, cuotas(*)').eq('cliente_id', clienteId).order('fecha_desembolso', { ascending: false });
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

## 5. Reglas de presentación

- Montos: `S/ 1,234.50`. Fechas: `DD/MM/AAAA`.
- Estado del cliente con color: Al día (verde), Moroso (ámbar), Extrajudicial (rojo).
- Cuota `VENCIDA` resaltada; mostrar días de atraso y mora donde haya deuda.
- Antes de aprobar: pantalla de resumen (monto, plazo, cuota, total, primer vencimiento) + casilla de conformidad.
