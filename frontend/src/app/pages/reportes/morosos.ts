import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Aviso } from '../../components/aviso';
import { EstadoCliente, FilaReporteMorosos, Sede } from '../../core/contrato';
import { FechaPipe, formatearFecha, MontoPipe } from '../../core/formato';
import { mensajeDeError } from '../../core/supabase';
import { ReportesService } from '../../services/reportes.service';

type FiltroEstado = '' | 'MOROSO' | 'EXTRAJUDICIAL';

const ESTADO_TEXTO: Record<EstadoCliente, string> = {
  AL_DIA: 'Al día',
  MOROSO: 'Moroso',
  EXTRAJUDICIAL: 'Extrajudicial',
};

const ESTADO_BADGE: Record<EstadoCliente, string> = {
  AL_DIA: 'bg-green-100 text-green-800',
  MOROSO: 'bg-amber-100 text-amber-900',
  EXTRAJUDICIAL: 'bg-red-100 text-red-800',
};

const COLUMNAS_CSV = [
  'DNI',
  'Cliente',
  'Teléfono',
  'Estado',
  'Cuotas vencidas',
  'Días de atraso',
  'Deuda vencida (S/)',
  'Mora (S/)',
  'Total a regularizar (S/)',
  'Último pago',
  'Sede',
];

/** Campo CSV entre comillas; las comillas internas se duplican. */
function campoCsv(valor: string | number | null): string {
  return `"${String(valor ?? '').replace(/"/g, '""')}"`;
}

/** Número con 2 decimales y punto, sin separador de miles: Excel lo suma como número. */
function numeroCsv(valor: number): string {
  return Number(valor).toFixed(2);
}

// HU-15 Reporte de morosos y extrajudiciales, con filtros por estado y sede y exportación CSV.
@Component({
  selector: 'app-reporte-morosos',
  imports: [FormsModule, Aviso, MontoPipe, FechaPipe],
  template: `
    <div class="flex flex-wrap items-end gap-3">
      <label class="text-sm font-medium text-slate-700">
        Estado
        <select [(ngModel)]="estado" class="mt-1 block rounded-xl border border-slate-300 bg-white px-3.5 py-2.5">
          <option value="">Morosos y extrajudiciales</option>
          <option value="MOROSO">Solo morosos</option>
          <option value="EXTRAJUDICIAL">Solo extrajudiciales</option>
        </select>
      </label>
      <label class="text-sm font-medium text-slate-700">
        Sede
        <select
          [ngModel]="sedeId()"
          (ngModelChange)="cambiarSede($event)"
          [disabled]="cargando()"
          class="mt-1 block rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 disabled:bg-slate-100"
        >
          <option [ngValue]="null">Todas las sedes</option>
          @for (s of sedes(); track s.id) {
            <option [ngValue]="s.id">{{ s.nombre }}</option>
          }
        </select>
      </label>
      <button
        type="button"
        (click)="exportarCsv()"
        [disabled]="cargando() || filasVisibles().length === 0"
        class="rounded bg-vino-700 px-4 py-2 text-sm font-medium text-white hover:bg-vino-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Exportar CSV
      </button>
    </div>

    <div class="mt-4">
      <app-aviso [mensaje]="error()" />
    </div>

    <p class="mt-4 text-sm text-slate-600">
      {{ filasVisibles().length }} cliente(s) · Total a regularizar:
      <strong class="text-slate-900">{{ totalRegularizar() | monto }}</strong>
    </p>

    <div class="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th class="px-3 py-2">DNI</th>
            <th class="px-3 py-2">Cliente</th>
            <th class="px-3 py-2">Teléfono</th>
            <th class="px-3 py-2">Estado</th>
            <th class="px-3 py-2 text-right">Días de atraso</th>
            <th class="px-3 py-2 text-right">Deuda vencida</th>
            <th class="px-3 py-2 text-right">Mora</th>
            <th class="px-3 py-2 text-right">Total a regularizar</th>
            <th class="px-3 py-2">Último pago</th>
            <th class="px-3 py-2">Sede</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          @if (cargando()) {
            <tr>
              <td colspan="10" class="px-3 py-8 text-center text-slate-400">Cargando reporte…</td>
            </tr>
          } @else {
            @for (f of filasVisibles(); track f.dni) {
              <tr>
                <td class="px-3 py-2 font-mono">{{ f.dni }}</td>
                <td class="px-3 py-2">{{ f.cliente }}</td>
                <td class="px-3 py-2">{{ f.telefono }}</td>
                <td class="px-3 py-2">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-semibold"
                    [class]="estadoBadge[f.estado]"
                    >{{ estadoTexto[f.estado] }}</span
                  >
                </td>
                <td class="px-3 py-2 text-right">{{ f.dias_atraso }}</td>
                <td class="px-3 py-2 text-right">{{ f.deuda_vencida | monto }}</td>
                <td class="px-3 py-2 text-right">{{ f.mora | monto }}</td>
                <td class="px-3 py-2 text-right font-semibold">
                  {{ f.total_a_regularizar | monto }}
                </td>
                <td class="px-3 py-2">{{ (f.ultimo_pago | fecha) || 'Sin pagos' }}</td>
                <td class="px-3 py-2">{{ f.sedes ?? '—' }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="10" class="px-3 py-8 text-center text-slate-500">
                  No hay clientes morosos ni extrajudiciales con estos filtros.
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>
  `,
})
export class ReporteMorosos implements OnInit {
  private readonly reportes = inject(ReportesService);

  /** Sedes cargadas una sola vez por la página de reportes. */
  readonly sedes = input<Sede[]>([]);

  protected readonly estadoTexto = ESTADO_TEXTO;
  protected readonly estadoBadge = ESTADO_BADGE;
  protected readonly estado = signal<FiltroEstado>('');
  protected readonly sedeId = signal<number | null>(null);
  protected readonly filas = signal<FilaReporteMorosos[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Lo que se ve en la tabla es exactamente lo que se exporta (filtro de estado incluido). */
  protected readonly filasVisibles = computed(() => {
    const estado = this.estado();
    return estado ? this.filas().filter((f) => f.estado === estado) : this.filas();
  });

  /** Suma en céntimos para no arrastrar errores de coma flotante. */
  protected readonly totalRegularizar = computed(
    () =>
      this.filasVisibles().reduce((suma, f) => suma + Math.round(f.total_a_regularizar * 100), 0) /
      100,
  );

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  protected async cambiarSede(sedeId: number | null): Promise<void> {
    this.sedeId.set(sedeId);
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.filas.set(await this.reportes.morosos(this.sedeId()));
    } catch (e) {
      this.filas.set([]);
      this.error.set(mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected exportarCsv(): void {
    const lineas = this.filasVisibles().map((f) =>
      [
        campoCsv(f.dni),
        campoCsv(f.cliente),
        campoCsv(f.telefono),
        campoCsv(ESTADO_TEXTO[f.estado]),
        f.cuotas_vencidas,
        f.dias_atraso,
        numeroCsv(f.deuda_vencida),
        numeroCsv(f.mora),
        numeroCsv(f.total_a_regularizar),
        campoCsv(formatearFecha(f.ultimo_pago)),
        campoCsv(f.sedes),
      ].join(','),
    );
    const csv = [COLUMNAS_CSV.map(campoCsv).join(','), ...lineas].join('\r\n');
    // BOM para que Excel reconozca UTF-8 y muestre bien tildes y eñes
    const archivo = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `morosos_${this.sufijoArchivo()}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  private sufijoArchivo(): string {
    const sede = this.sedes().find((s) => s.id === this.sedeId());
    const partes = [
      sede ? sede.nombre.toLowerCase().replace(/\s+/g, '-') : 'todas-las-sedes',
      this.estado().toLowerCase() || 'todos',
      new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }),
    ];
    return partes.join('_');
  }
}
