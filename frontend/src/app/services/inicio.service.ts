import { inject, Injectable } from '@angular/core';
import { EstadoCliente, EstadoPrestamo } from '../core/contrato';
import { resultado, SUPABASE } from '../core/supabase';

export interface ResumenInicio {
  clientes: { total: number; alDia: number; morosos: number; extrajudiciales: number };
  prestamos: {
    total: number;
    vigentes: number;
    /** Suma del monto desembolsado de los préstamos vigentes. */
    montoVigente: number;
    porSede: { sede: string; total: number }[];
  };
}

/** Cifras de la pantalla de inicio. Solo lectura: cuenta y suma filas ya guardadas. */
@Injectable({ providedIn: 'root' })
export class InicioService {
  private readonly db = inject(SUPABASE);

  /** Con sedeId solo cuenta lo de esa sede (clientes registrados allí y préstamos otorgados allí). */
  async resumen(sedeId: number | null = null): Promise<ResumenInicio> {
    let consultaClientes = this.db.from('clientes').select('estado');
    if (sedeId !== null) consultaClientes = consultaClientes.eq('sede_registro_id', sedeId);
    const clientes = resultado<{ estado: EstadoCliente }[]>(await consultaClientes);
    let consultaPrestamos = this.db.from('prestamos').select('estado, monto, sedes(nombre)');
    if (sedeId !== null) consultaPrestamos = consultaPrestamos.eq('sede_id', sedeId);
    const filas = resultado(await consultaPrestamos) as unknown as {
      estado: EstadoPrestamo;
      monto: number;
      sedes: { nombre: string } | null;
    }[];
    // PostgREST devuelve la sede como objeto (a veces como lista de un elemento según la versión)
    const sedeDe = (fila: (typeof filas)[number]): string => {
      const sede = fila.sedes as unknown;
      const objeto = Array.isArray(sede) ? sede[0] : sede;
      return (objeto as { nombre?: string } | null)?.nombre ?? 'Sin sede';
    };

    const porSede = new Map<string, number>();
    let montoCentimos = 0;
    let vigentes = 0;
    for (const fila of filas) {
      const sede = sedeDe(fila).replace(/^Sede\s+/, '');
      porSede.set(sede, (porSede.get(sede) ?? 0) + 1);
      if (fila.estado === 'VIGENTE') {
        vigentes++;
        montoCentimos += Math.round(Number(fila.monto) * 100);
      }
    }

    return {
      clientes: {
        total: clientes.length,
        alDia: clientes.filter((c) => c.estado === 'AL_DIA').length,
        morosos: clientes.filter((c) => c.estado === 'MOROSO').length,
        extrajudiciales: clientes.filter((c) => c.estado === 'EXTRAJUDICIAL').length,
      },
      prestamos: {
        total: filas.length,
        vigentes,
        montoVigente: montoCentimos / 100,
        porSede: [...porSede.entries()]
          .map(([sede, total]) => ({ sede, total }))
          .sort((a, b) => b.total - a.total),
      },
    };
  }
}
