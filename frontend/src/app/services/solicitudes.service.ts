import { inject, Injectable } from '@angular/core';
import {
  EstadoSolicitud,
  FechaISO,
  ResumenCapitalDia,
  SolicitudCapitalDetalle,
  Uuid,
} from '../core/contrato';
import { resultado, rpc, SUPABASE } from '../core/supabase';

const COLUMNAS =
  '*, solicitante:trabajadores!solicitudes_capital_trabajador_id_fkey(nombre), ' +
  'resolutor:trabajadores!solicitudes_capital_resuelto_por_fkey(nombre), sedes(nombre)';

/**
 * Solicitudes de capital diario. Se lee con .from() (la base solo deja ver al trabajador lo suyo y al
 * administrador todo) y se escribe únicamente con las funciones: nunca insert/update directo.
 */
@Injectable({ providedIn: 'root' })
export class SolicitudesService {
  private readonly db = inject(SUPABASE);

  /** fn_resumen_capital_dia → lo solicitado, aprobado y disponible hoy del trabajador. */
  async resumenDia(): Promise<ResumenCapitalDia> {
    const [fila] = await rpc(this.db, 'fn_resumen_capital_dia', {});
    return fila;
  }

  /** fn_solicitar_capital → id de la solicitud. El límite diario lo valida la base de datos. */
  async solicitar(monto: number, comentario: string | null): Promise<Uuid> {
    return rpc(this.db, 'fn_solicitar_capital', { p_monto: monto, p_comentario: comentario });
  }

  /** fn_resolver_solicitud → aprueba o rechaza (solo administrador). */
  async resolver(solicitud: Uuid, aprobar: boolean, comentario: string | null): Promise<void> {
    await rpc(this.db, 'fn_resolver_solicitud', {
      p_solicitud: solicitud,
      p_aprobar: aprobar,
      p_comentario: comentario,
    });
  }

  /**
   * Solicitudes, de la más reciente a la más antigua. Para el trabajador la base devuelve solo las suyas;
   * para el administrador, las de todos (con filtros opcionales).
   */
  async listar(
    filtros: { estado?: EstadoSolicitud; sedeId?: number; fecha?: FechaISO } = {},
    limite = 200,
  ): Promise<SolicitudCapitalDetalle[]> {
    let consulta = this.db.from('solicitudes_capital').select(COLUMNAS);
    if (filtros.estado) consulta = consulta.eq('estado', filtros.estado);
    if (filtros.sedeId !== undefined) consulta = consulta.eq('sede_id', filtros.sedeId);
    if (filtros.fecha) consulta = consulta.eq('fecha', filtros.fecha);
    const filas = resultado(await consulta.order('creado_en', { ascending: false }).limit(limite));
    return filas as unknown as SolicitudCapitalDetalle[]; // PostgREST devuelve cada relación como objeto
  }
}
