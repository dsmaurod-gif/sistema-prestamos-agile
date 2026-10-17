import { inject, Injectable } from '@angular/core';
import { resultado, rpc, SUPABASE } from '../core/supabase';
import { Cliente, DeudaCliente, RegistrarClienteParams, Uuid } from '../core/contrato';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly db = inject(SUPABASE);
  private readonly auth = inject(AuthService);

  /** fn_registrar_cliente → id del cliente nuevo. */
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
}
