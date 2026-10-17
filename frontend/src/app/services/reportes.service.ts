import { inject, Injectable } from '@angular/core';
import { resultado, rpc, SUPABASE } from '../core/supabase';
import {
  FechaISO,
  FilaReporteMorosos,
  FilaReporteSedes,
  RegistroBitacora,
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
}
