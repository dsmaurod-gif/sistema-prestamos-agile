import { inject, Injectable, signal } from '@angular/core';
import { resultado, rpc, SUPABASE } from '../core/supabase';
import {
  FechaISO,
  Parametro,
  ParametroEditable,
  ResumenReinicioDemo,
  Uuid,
} from '../core/contrato';

/** Modo demostración (solo ADMIN): fecha simulada y parámetros editables. */
@Injectable({ providedIn: 'root' })
export class DemoService {
  private readonly db = inject(SUPABASE);
  private readonly fecha = signal<FechaISO>('');

  /** Fecha simulada actual; vacía = fecha real. */
  readonly fechaReferencia = this.fecha.asReadonly();

  async cargarFechaReferencia(): Promise<void> {
    const parametro = resultado<Pick<Parametro, 'valor'>>(
      await this.db.from('parametros').select('valor').eq('clave', 'fecha_referencia').single(),
    );
    this.fecha.set(parametro.valor);
  }

  async parametros(): Promise<Parametro[]> {
    return resultado(await this.db.from('parametros').select('clave, valor, nota').order('clave'));
  }

  /** Fija la fecha simulada ('AAAA-MM-DD'); con '' se vuelve a la fecha real. */
  async fijarFechaReferencia(fecha: FechaISO): Promise<void> {
    resultado(
      await this.db.from('parametros').update({ valor: fecha }).eq('clave', 'fecha_referencia'),
    );
    this.fecha.set(fecha);
  }

  async volverAFechaReal(): Promise<void> {
    await this.fijarFechaReferencia('');
  }

  async actualizarParametro(clave: ParametroEditable, valor: string): Promise<void> {
    resultado(await this.db.from('parametros').update({ valor }).eq('clave', clave));
  }

  /** fn_actualizar_estados → recalcula vencidas, Moroso y Extrajudicial; sin cliente = todos. */
  async actualizarEstados(clienteId: Uuid | null = null): Promise<void> {
    await rpc(this.db, 'fn_actualizar_estados', { p_cliente: clienteId });
  }

  /**
   * sp_demo_reiniciar → borra clientes, préstamos y cuotas y recarga los datos demo.
   * Solo ADMIN (la función lo comprueba). La fecha simulada vuelve a la real.
   */
  async reiniciarDatos(): Promise<ResumenReinicioDemo> {
    const resumen = await rpc(this.db, 'sp_demo_reiniciar', {});
    this.fecha.set('');
    return resumen;
  }
}
