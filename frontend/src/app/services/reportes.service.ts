import { inject, Injectable } from '@angular/core';
import { resultado, rpc, SUPABASE } from '../core/supabase';
import {
  FechaISO,
  FilaReporteMorosos,
  FilaReporteSedes,
  RegistroBitacora,
  RegistroBitacoraDetallado,
  Sede,
} from '../core/contrato';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private readonly db = inject(SUPABASE);

  /** fn_reporte_morosos → morosos y extrajudiciales; sin sede = todas. */
  async morosos(sedeId: number | null = null): Promise<FilaReporteMorosos[]> {
    return rpc(this.db, 'fn_reporte_morosos', { p_sede: sedeId });
  }

  /** fn_reporte_sedes → una fila por sede; sin fechas = todo el periodo. */
  async porSede(
    desde: FechaISO | null = null,
    hasta: FechaISO | null = null,
  ): Promise<FilaReporteSedes[]> {
    return rpc(this.db, 'fn_reporte_sedes', { p_desde: desde, p_hasta: hasta });
  }

  async sedes(): Promise<Sede[]> {
    return resultado(await this.db.from('sedes').select('id, nombre, ciudad').order('id'));
  }

  /** Últimos registros de auditoría. */
  async bitacora(limite = 100): Promise<RegistroBitacora[]> {
    return resultado(
      await this.db
        .from('bitacora')
        .select('fecha, accion, entidad, entidad_id, detalle, trabajador_id, sede_id')
        .order('fecha', { ascending: false })
        .limit(limite),
    );
  }

  /**
   * Bitácora de auditoría con trabajadora y sede (HU-16). Fechas 'AAAA-MM-DD' (hora de Lima).
   * Solo lectura: la bitácora no se edita desde la aplicación.
   */
  async listarBitacora(
    filtros: {
      desde?: FechaISO;
      hasta?: FechaISO;
      accion?: string;
      sedeId?: number;
      limite?: number;
    } = {},
  ): Promise<RegistroBitacoraDetallado[]> {
    let consulta = this.db
      .from('bitacora')
      .select(
        'fecha, accion, entidad, entidad_id, detalle, trabajador_id, sede_id, trabajadores(nombre), sedes(nombre)',
      );
    if (filtros.desde) consulta = consulta.gte('fecha', `${filtros.desde}T00:00:00-05:00`);
    if (filtros.hasta) consulta = consulta.lte('fecha', `${filtros.hasta}T23:59:59.999-05:00`);
    if (filtros.accion) consulta = consulta.eq('accion', filtros.accion);
    if (filtros.sedeId !== undefined) consulta = consulta.eq('sede_id', filtros.sedeId);
    const filas = resultado(
      await consulta.order('fecha', { ascending: false }).limit(filtros.limite ?? 200),
    );
    return filas as unknown as RegistroBitacoraDetallado[]; // PostgREST devuelve cada relación como objeto
  }
}
