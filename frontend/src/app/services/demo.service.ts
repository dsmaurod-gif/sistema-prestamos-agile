import { inject, Injectable, signal } from '@angular/core';
import { ErrorBaseDatos, resultado, rpc, SUPABASE } from '../core/supabase';
import {
  FechaISO,
  Parametro,
  ParametroEditable,
  InfoRespaldo,
  ResumenDatos,
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

  /**
   * Fija la fecha simulada ('AAAA-MM-DD'); con '' se vuelve a la fecha real.
   * Comprueba que la base modificó el registro y deja en la señal el valor realmente guardado.
   */
  async fijarFechaReferencia(fecha: FechaISO): Promise<void> {
    const filas = resultado<Pick<Parametro, 'valor'>[]>(
      await this.db
        .from('parametros')
        .update({ valor: fecha })
        .eq('clave', 'fecha_referencia')
        .select('valor'),
    );
    if (filas.length !== 1) {
      throw new ErrorBaseDatos(
        'No se pudo actualizar la fecha de referencia: la base no modificó ningún registro.',
      );
    }
    await this.cargarFechaReferencia();
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

  /** sp_demo_vaciar → borra clientes, préstamos, cuotas y solicitudes; guarda un respaldo antes. */
  async vaciarDatos(): Promise<ResumenDatos> {
    const resumen = await rpc(this.db, 'sp_demo_vaciar', {});
    this.fecha.set('');
    return resumen;
  }

  /** sp_demo_restaurar → devuelve el último respaldo (y guarda el estado actual). */
  async restaurarDatos(): Promise<ResumenDatos> {
    return rpc(this.db, 'sp_demo_restaurar', {});
  }

  /** fn_respaldo_demo_info → qué respaldo hay disponible. */
  async infoRespaldo(): Promise<InfoRespaldo> {
    return rpc(this.db, 'fn_respaldo_demo_info', {});
  }
}
