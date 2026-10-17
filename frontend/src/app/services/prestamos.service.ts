import { inject, Injectable } from '@angular/core';
import { resultado, rpc, SUPABASE } from '../core/supabase';
import {
  AprobarPrestamoParams,
  EvaluacionPrestamo,
  EstadoPrestamo,
  EvaluarPrestamoParams,
  PrestamoConCuotas,
  PrestamoDetalle,
  PrestamoListado,
  Uuid,
} from '../core/contrato';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class PrestamosService {
  private readonly db = inject(SUPABASE);
  private readonly auth = inject(AuthService);

  /** fn_evaluar_prestamo → informe de evaluación. No crea nada. */
  async evaluar(params: EvaluarPrestamoParams): Promise<EvaluacionPrestamo> {
    return rpc(this.db, 'fn_evaluar_prestamo', params);
  }

  /** fn_aprobar_prestamo → id del préstamo creado con su cronograma. Irreversible. */
  async aprobar(datos: Omit<AprobarPrestamoParams, 'p_trabajador'>): Promise<Uuid> {
    return rpc(this.db, 'fn_aprobar_prestamo', {
      ...datos,
      p_trabajador: this.auth.trabajadorId(),
    });
  }

  /** Préstamo con su cliente y su cronograma. */
  async obtener(id: Uuid): Promise<PrestamoDetalle> {
    return resultado(
      await this.db.from('prestamos').select('*, clientes(*), cuotas(*)').eq('id', id).single(),
    );
  }

  /** Préstamos de un cliente, del más reciente al más antiguo. */
  async listarPorCliente(clienteId: Uuid): Promise<PrestamoConCuotas[]> {
    return resultado(
      await this.db
        .from('prestamos')
        .select('*, cuotas(*)')
        .eq('cliente_id', clienteId)
        .order('fecha_desembolso', { ascending: false }),
    );
  }

  /** Lista préstamos con su cliente y sede (HU-10), del más reciente al más antiguo. Solo lectura. */
  async listar(
    filtros: { estado?: EstadoPrestamo; sedeId?: number; clienteId?: Uuid } = {},
    limite = 200,
  ): Promise<PrestamoListado[]> {
    let consulta = this.db.from('prestamos').select('*, clientes(*), sedes(nombre)');
    if (filtros.estado) consulta = consulta.eq('estado', filtros.estado);
    if (filtros.sedeId !== undefined) consulta = consulta.eq('sede_id', filtros.sedeId);
    if (filtros.clienteId) consulta = consulta.eq('cliente_id', filtros.clienteId);
    const filas = resultado(
      await consulta
        .order('fecha_desembolso', { ascending: false })
        .order('creado_en', { ascending: false })
        .limit(limite),
    );
    return filas as unknown as PrestamoListado[]; // PostgREST devuelve cada relación como objeto
  }
}
