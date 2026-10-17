// Verifica que el entorno local y la base de Supabase están listos.
// Solo lectura: usa la llave pública del .env. Sale con código 1 si algo falla.
// Nota: fn_evaluar_prestamo y los reportes recalculan estados (Moroso/Extrajudicial) por diseño.
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ quiet: true });

const SEDES = ['Chimbote', 'Trujillo', 'Chiclayo', 'Piura', 'Tumbes'];
const PARAMETROS = ['tea', 'metodo_cuota', 'tope_capital', 'plazo_min_meses', 'plazo_max_meses',
  'dias_entre_cuotas', 'dias_extrajudicial', 'mora_diaria', 'mora_modalidad', 'liberacion_cupo',
  'fecha_referencia'];
const DNI_DEMO = ['70000001', '70000002', '70000003', '70000004', '70000005', '70000006'];
const RECARGAR = "Ejecutar en Supabase: notify pgrst, 'reload schema';";

const resultados = [];
const ok = (nombre, detalle = '') => resultados.push({ estado: '✅', nombre, detalle });
const aviso = (nombre, detalle) => resultados.push({ estado: '⚠️', nombre, detalle });
const falla = (nombre, detalle) => resultados.push({ estado: '❌', nombre, detalle });

const describirError = (error) =>
  error.code === 'PGRST202' ? `Función no encontrada (PGRST202). ${RECARGAR}` : error.message;

function imprimir() {
  const ancho = Math.max(...resultados.map((r) => r.nombre.length));
  console.log('\nVerificación del entorno\n');
  for (const r of resultados) {
    console.log(`${r.estado}  ${r.nombre.padEnd(ancho)}  ${r.detalle}`);
  }
  const fallas = resultados.filter((r) => r.estado === '❌').length;
  const avisos = resultados.filter((r) => r.estado === '⚠️').length;
  console.log(`\n${resultados.length} comprobaciones: ${fallas} con error, ${avisos} con aviso.\n`);
  process.exitCode = fallas > 0 ? 1 : 0;
}

function verificarVariables() {
  const url = process.env.SUPABASE_URL;
  const llave = process.env.SUPABASE_PUBLISHABLE_KEY;
  const faltan = [!url && 'SUPABASE_URL', !llave && 'SUPABASE_PUBLISHABLE_KEY'].filter(Boolean);
  if (faltan.length) {
    falla('Variables de entorno', `Faltan en .env: ${faltan.join(', ')} (ver .env.example)`);
    return null;
  }
  if (llave.startsWith('sb_secret_')) {
    falla('Variables de entorno', 'La llave es secreta (sb_secret_). Usa la llave pública y rota la secreta.');
    return null;
  }
  const partes = llave.split('.');
  if (partes.length === 3) {
    let rol;
    try {
      rol = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')).role;
    } catch {
      falla('Variables de entorno', 'La llave parece un JWT pero no se pudo leer.');
      return null;
    }
    if (rol !== 'anon') {
      falla('Variables de entorno', `La llave tiene rol "${rol}", debe ser "anon". Si es service_role, rótala.`);
      return null;
    }
    ok('Variables de entorno', 'URL y llave pública (anon)');
  } else if (llave.startsWith('sb_publishable_')) {
    ok('Variables de entorno', 'URL y llave pública (publishable)');
  } else {
    aviso('Variables de entorno', 'Formato de llave no reconocido; se esperaba sb_publishable_ o JWT anon.');
  }
  return createClient(url, llave);
}

async function verificarSedes(db) {
  const { data, error } = await db.from('sedes').select('ciudad');
  if (error) return falla('Sedes', describirError(error));
  const ciudades = data.map((s) => s.ciudad);
  const faltan = SEDES.filter((c) => !ciudades.includes(c));
  if (data.length !== 5 || faltan.length) {
    return falla('Sedes', `Hay ${data.length} filas; faltan: ${faltan.join(', ') || 'ninguna'}. Ejecutar sql/03_seed_base.sql`);
  }
  ok('Sedes', SEDES.join(', '));
}

async function verificarParametros(db) {
  const { data, error } = await db.from('parametros').select('clave, valor');
  if (error) return falla('Parámetros', describirError(error));
  const claves = new Map(data.map((p) => [p.clave, p.valor]));
  const faltan = PARAMETROS.filter((c) => !claves.has(c));
  if (faltan.length) return falla('Parámetros', `Faltan: ${faltan.join(', ')}`);
  const fecha = claves.get('fecha_referencia');
  if (fecha) return aviso('Parámetros', `Fecha simulada activa: fecha_referencia = ${fecha}`);
  ok('Parámetros', `${PARAMETROS.length} claves; fecha real`);
}

async function verificarEsquemaV2(db) {
  const { error } = await db.from('clientes').select('dni_caducidad').limit(1);
  if (!error) return ok('Esquema v2', 'clientes.dni_caducidad existe');
  if (error.code === '42703') {
    return falla('Esquema v2', 'Falta clientes.dni_caducidad. Ejecutar sql/06_migracion_v1_a_v2.sql y luego 02');
  }
  falla('Esquema v2', describirError(error));
}

async function verificarTrabajadores(db) {
  const { data, error } = await db.from('trabajadores').select('id, rol, activo, auth_user_id');
  if (error) {
    falla('Trabajadores', describirError(error));
    return null;
  }
  const trabajadores = data.filter((t) => t.rol === 'TRABAJADOR').length;
  const admins = data.filter((t) => t.rol === 'ADMIN').length;
  if (trabajadores !== 5 || admins !== 1) {
    falla('Trabajadores', `Hay ${trabajadores} TRABAJADOR y ${admins} ADMIN; se esperan 5 y 1.`);
  } else {
    const sinAuth = data.filter((t) => !t.auth_user_id).length;
    if (sinAuth) {
      aviso('Trabajadores', `${sinAuth} de ${data.length} sin auth_user_id: crear usuarios en Auth y ejecutar sql/07_vincular_auth.sql`);
    } else {
      ok('Trabajadores', '5 TRABAJADOR y 1 ADMIN, todos vinculados a Auth');
    }
  }
  return data.find((t) => t.rol === 'TRABAJADOR' && t.activo)?.id ?? null;
}

async function verificarDatosDemo(db) {
  const { data, error } = await db.from('clientes').select('id, dni').in('dni', DNI_DEMO);
  if (error) {
    falla('Datos demo', describirError(error));
    return null;
  }
  const encontrados = data.map((c) => c.dni.trim());
  const faltan = DNI_DEMO.filter((d) => !encontrados.includes(d));
  if (faltan.length) {
    aviso('Datos demo', `Faltan DNI ${faltan.join(', ')}. Ejecutar sql/04_seed_demo.sql`);
  } else {
    ok('Datos demo', 'Clientes 70000001 a 70000006');
  }
  return data.find((c) => c.dni.trim() === '70000001')?.id ?? null;
}

async function verificarEvaluar(db, clienteDemo) {
  const nombre = 'fn_evaluar_prestamo';
  if (!clienteDemo) return aviso(nombre, 'Omitida: no está el cliente demo 70000001');
  const { data, error } = await db.rpc(nombre, { p_cliente: clienteDemo, p_monto: 5000, p_plazo: 12 });
  if (error) return falla(nombre, describirError(error));
  if (data?.aprobable === false && Number(data?.monto_maximo) === 3000) {
    return ok(nombre, '70000001 pide 5,000: rechazado, máximo 3,000');
  }
  falla(nombre, `Se esperaba aprobable=false y monto_maximo=3000; llegó aprobable=${data?.aprobable}, monto_maximo=${data?.monto_maximo}`);
}

async function verificarReporteSedes(db) {
  const nombre = 'fn_reporte_sedes';
  const { data, error } = await db.rpc(nombre);
  if (error) return falla(nombre, describirError(error));
  if (data.length !== 5) return falla(nombre, `Devolvió ${data.length} filas; se esperan 5`);
  if (!('ingresos_cobrados' in data[0])) return falla(nombre, 'Falta la columna ingresos_cobrados (versión anterior de 02)');
  ok(nombre, '5 sedes con ingresos_cobrados');
}

async function verificarReporteMorosos(db) {
  const nombre = 'fn_reporte_morosos';
  const { data, error } = await db.rpc(nombre);
  if (error) return falla(nombre, describirError(error));
  ok(nombre, `Responde (${data.length} filas)`);
}

// Debe fallar. El DNI es inválido a propósito: aunque faltara la regla del CE, no se insertaría nada.
async function verificarRegistrarCE(db, trabajador) {
  const nombre = 'fn_registrar_cliente (CE)';
  if (!trabajador) return aviso(nombre, 'Omitida: no hay un trabajador activo');
  const { error } = await db.rpc('fn_registrar_cliente', {
    p_tipo_documento: 'CE', p_dni: 'X', p_nombres: 'VERIFICACION', p_apellidos: 'ENTORNO',
    p_telefono: '999000111', p_direccion: null, p_verificado: false,
    p_trabajador: trabajador, p_dni_caducidad: '2035-12-31',
  });
  if (!error) return falla(nombre, 'No falló: debía rechazar el carnet de extranjería');
  if (error.code === 'PGRST202') return falla(nombre, describirError(error));
  if (error.message.toLowerCase().includes('carnet de extranjería')) return ok(nombre, 'Rechazado como se esperaba');
  falla(nombre, `Falló con otro mensaje: ${error.message}`);
}

// Debe fallar. El cliente es un id aleatorio: aunque faltara la regla de conformidad, no se crearía nada.
async function verificarAprobarSinConformidad(db, trabajador) {
  const nombre = 'fn_aprobar_prestamo (sin conformidad)';
  const { error } = await db.rpc('fn_aprobar_prestamo', {
    p_cliente: randomUUID(), p_monto: 100, p_plazo: 3,
    p_trabajador: trabajador ?? randomUUID(), p_cliente_conforme: false,
  });
  if (!error) return falla(nombre, 'No falló: debía exigir la conformidad del cliente');
  if (error.code === 'PGRST202') return falla(nombre, describirError(error));
  if (error.message.toLowerCase().includes('conforme')) return ok(nombre, 'Rechazado como se esperaba');
  falla(nombre, `Falló con otro mensaje: ${error.message}`);
}

const db = verificarVariables();
if (db) {
  try {
    await verificarSedes(db);
    await verificarParametros(db);
    await verificarEsquemaV2(db);
    const trabajador = await verificarTrabajadores(db);
    const clienteDemo = await verificarDatosDemo(db);
    await verificarEvaluar(db, clienteDemo);
    await verificarReporteSedes(db);
    await verificarReporteMorosos(db);
    await verificarRegistrarCE(db, trabajador);
    await verificarAprobarSinConformidad(db, trabajador);
  } catch (e) {
    falla('Conexión', `Error inesperado: ${e.message}`);
  }
}
imprimir();
