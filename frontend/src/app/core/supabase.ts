import { InjectionToken } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { FuncionesRpc } from './contrato';

/** Cliente de Supabase. Solo lo inyectan los servicios, nunca los componentes. */
export const SUPABASE = new InjectionToken<SupabaseClient>('SUPABASE', {
  providedIn: 'root',
  factory: () => createClient(environment.supabaseUrl, environment.supabasePublishableKey),
});

/** Error devuelto por la base de datos; su mensaje se muestra tal cual al usuario. */
export class ErrorBaseDatos extends Error {}

/** Devuelve los datos de una respuesta de Supabase o lanza el error de la base de datos. */
export function resultado<T>(respuesta: { data: T | null; error: { message: string } | null }): T {
  if (respuesta.error) throw new ErrorBaseDatos(respuesta.error.message);
  return respuesta.data as T;
}

/** Llama a una función del contrato con sus parámetros y su respuesta tipados. */
export async function rpc<F extends keyof FuncionesRpc>(
  db: SupabaseClient,
  funcion: F,
  params: FuncionesRpc[F]['params'],
): Promise<FuncionesRpc[F]['respuesta']> {
  return resultado(await db.rpc(funcion, params));
}

/** Texto para mostrar en un aviso a partir de cualquier error capturado. */
export function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
