// Tipos de docs/CONTRATO_API.md. Si cambia una función SQL, se corrige aquí y en su servicio.

export type Rol = 'TRABAJADOR' | 'ADMIN';
export type EstadoCliente = 'AL_DIA' | 'MOROSO' | 'EXTRAJUDICIAL';
export type EstadoPrestamo = 'VIGENTE' | 'CANCELADO';
export type EstadoCuota = 'PENDIENTE' | 'PAGADA' | 'VENCIDA';
export type MetodoCuota = 'CUOTA_FIJA' | 'CAPITAL_CONSTANTE';

/** Fecha 'AAAA-MM-DD' tal como la envía y recibe la base de datos. */
export type FechaISO = string;
export type Uuid = string;

// ---------- Funciones (RPC) ----------

export interface RegistrarClienteParams {
  p_tipo_documento: string;
  p_dni: string;
  p_nombres: string;
  p_apellidos: string;
  p_telefono: string;
  p_direccion: string | null;
  p_verificado: boolean;
  p_trabajador: Uuid;
  p_dni_caducidad: FechaISO;
}

export interface EvaluarPrestamoParams {
  p_cliente: Uuid;
  p_monto: number;
  p_plazo: number;
}

export interface EvaluacionPrestamo {
  aprobable: boolean;
  motivos: string[];
  estado_cliente: EstadoCliente;
  capital_vigente: number;
  disponible: number;
  monto_maximo: number;
  primera_cuota: number | null;
  total_a_pagar: number | null;
  total_intereses: number | null;
  primer_vencimiento: FechaISO | null;
}

export interface AprobarPrestamoParams {
  p_cliente: Uuid;
  p_monto: number;
  p_plazo: number;
  p_trabajador: Uuid;
  p_cliente_conforme: boolean;
}

export interface ClienteParams {
  p_cliente: Uuid;
}

export interface DeudaCliente {
  cuotas_vencidas: number;
  deuda_vencida: number;
  mora: number;
  total_a_regularizar: number;
  dias_atraso: number;
  vencimiento_mas_antiguo: FechaISO | null;
}

export interface ReporteMorososParams {
  p_sede: number | null;
}

export interface FilaReporteMorosos {
  dni: string;
  cliente: string;
  telefono: string;
  estado: EstadoCliente;
  fecha_moroso: FechaISO | null;
  cuotas_vencidas: number;
  dias_atraso: number;
  deuda_vencida: number;
  mora: number;
  total_a_regularizar: number;
  ultimo_pago: FechaISO | null;
  sedes: string | null;
}

export interface ReporteSedesParams {
  p_desde: FechaISO | null;
  p_hasta: FechaISO | null;
}

export interface FilaReporteSedes {
  sede: string;
  clientes_nuevos: number;
  prestamos_otorgados: number;
  capital_colocado: number;
  capital_vigente: number;
  intereses_proyectados: number;
  ingresos_cobrados: number;
  clientes_morosos: number;
  clientes_extrajudiciales: number;
}

export interface ActualizarEstadosParams {
  p_cliente: Uuid | null;
}

/** Cada función del contrato con sus parámetros y su respuesta. */
export interface FuncionesRpc {
  fn_registrar_cliente: { params: RegistrarClienteParams; respuesta: Uuid };
  fn_evaluar_prestamo: { params: EvaluarPrestamoParams; respuesta: EvaluacionPrestamo };
  fn_aprobar_prestamo: { params: AprobarPrestamoParams; respuesta: Uuid };
  fn_deuda_cliente: { params: ClienteParams; respuesta: DeudaCliente[] };
  fn_reporte_morosos: { params: ReporteMorososParams; respuesta: FilaReporteMorosos[] };
  fn_reporte_sedes: { params: ReporteSedesParams; respuesta: FilaReporteSedes[] };
  fn_actualizar_estados: { params: ActualizarEstadosParams; respuesta: null };
  fn_capital_vigente: { params: ClienteParams; respuesta: number };
}

// ---------- Tablas (solo lectura, salvo parametros en modo demo) ----------

export interface Sede {
  id: number;
  nombre: string;
  ciudad: string;
}

export interface TrabajadorSesion {
  id: Uuid;
  nombre: string;
  rol: Rol;
  sede_id: number;
  sedes: Pick<Sede, 'nombre'> | null;
}

export interface Cliente {
  id: Uuid;
  dni: string;
  dni_caducidad: FechaISO;
  nombres: string;
  apellidos: string;
  telefono: string;
  direccion: string | null;
  nombre_verificado: boolean;
  estado: EstadoCliente;
  fecha_moroso: FechaISO | null;
  fecha_extrajudicial: FechaISO | null;
  sede_registro_id: number;
}

export interface Cuota {
  id: Uuid;
  prestamo_id: Uuid;
  numero: number;
  fecha_vencimiento: FechaISO;
  cuota: number;
  capital: number;
  interes: number;
  saldo: number;
  estado: EstadoCuota;
  fecha_pago: FechaISO | null;
}

export interface Prestamo {
  id: Uuid;
  cliente_id: Uuid;
  sede_id: number;
  trabajador_id: Uuid;
  monto: number;
  plazo_meses: number;
  tea: number;
  metodo_cuota: MetodoCuota;
  fecha_desembolso: FechaISO;
  estado: EstadoPrestamo;
}

export interface PrestamoConCuotas extends Prestamo {
  cuotas: Cuota[];
}

export interface PrestamoDetalle extends PrestamoConCuotas {
  clientes: Cliente;
}

export interface RegistroBitacora {
  fecha: string;
  accion: string;
  entidad: string;
  entidad_id: Uuid | null;
  detalle: Record<string, unknown> | null;
  trabajador_id: Uuid | null;
  sede_id: number | null;
}

export interface Parametro {
  clave: string;
  valor: string;
  nota: string | null;
}

/** Parámetros que el administrador puede cambiar desde el modo demostración. */
export type ParametroEditable = 'metodo_cuota' | 'mora_modalidad' | 'liberacion_cupo';
