import { inject, Injectable } from '@angular/core';
import { ErrorBaseDatos, resultado, rpc, SUPABASE } from '../core/supabase';
import {
  Cliente,
  DeudaCliente,
  RegistrarClienteParams,
  RespuestaConsultaDni,
  RespuestaConsultaRuc,
  Uuid,
} from '../core/contrato';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly db = inject(SUPABASE);
  private readonly auth = inject(AuthService);

  /** fn_registrar_cliente → id del cliente nuevo. p_ruc y p_razon_social son opcionales. */
  async registrar(datos: Omit<RegistrarClienteParams, 'p_trabajador'>): Promise<Uuid> {
    return rpc(this.db, 'fn_registrar_cliente', {
      ...datos,
      p_trabajador: this.auth.trabajadorId(),
    });
  }

  /** Busca por DNI exacto o por parte del nombre o apellido (máximo 20). */
  async buscar(texto: string): Promise<Cliente[]> {
    // Quita los caracteres que romperían el filtro de PostgREST
    const q = texto.trim().replace(/[,()"\\%*]/g, '');
    if (!q) return [];
    return resultado(
      await this.db
        .from('clientes')
        .select('*')
        .or(`dni.eq.${q},apellidos.ilike.%${q}%,nombres.ilike.%${q}%`)
        .limit(20),
    );
  }

  /** Clientes más recientes (todas las sedes) para la lista inicial de la pantalla de clientes. */
  async listarRecientes(limite = 50): Promise<Cliente[]> {
    return resultado(
      await this.db.from('clientes').select('*').order('creado_en', { ascending: false }).limit(limite),
    );
  }

  async obtener(id: Uuid): Promise<Cliente> {
    return resultado(await this.db.from('clientes').select('*').eq('id', id).single());
  }

  /** fn_deuda_cliente → deuda vencida y mora del cliente. */
  async deuda(clienteId: Uuid): Promise<DeudaCliente> {
    const [fila] = await rpc(this.db, 'fn_deuda_cliente', { p_cliente: clienteId });
    return fila;
  }

  /** fn_capital_vigente → capital vigente del cliente. */
  async capitalVigente(clienteId: Uuid): Promise<number> {
    return rpc(this.db, 'fn_capital_vigente', { p_cliente: clienteId });
  }

  /**
   * Edge Function consultar-dni (RENIEC). Si el servicio no está disponible lanza un error:
   * la pantalla debe ofrecer el ingreso manual con doble confirmación (HU-03 CA5).
   */
  async consultarDni(dni: string): Promise<RespuestaConsultaDni> {
    const { data, error } = await this.db.functions.invoke<RespuestaConsultaDni>('consultar-dni', {
      body: { dni },
    });
    if (error || !data) throw new ErrorBaseDatos('Servicio de consulta de DNI no disponible');
    return data;
  }

  /**
   * Edge Function consultar-ruc (SUNAT). Si el servicio no está disponible lanza un error.
   * La pantalla debe rechazar el RUC si estado ≠ ACTIVO o condición ≠ HABIDO.
   */
  async consultarRuc(ruc: string): Promise<RespuestaConsultaRuc> {
    const { data, error } = await this.db.functions.invoke<RespuestaConsultaRuc>('consultar-ruc', {
      body: { ruc },
    });
    if (error || !data) throw new ErrorBaseDatos('Servicio de consulta de RUC no disponible');
    return data;
  }
}
