import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Aviso } from '../../components/aviso';
import { FilaReporteSedes } from '../../core/contrato';
import { MontoPipe } from '../../core/formato';
import { mensajeDeError } from '../../core/supabase';
import { ReportesService } from '../../services/reportes.service';

type Total = Omit<FilaReporteSedes, 'sede'>;

const CAMPOS_MONTO = [
  'capital_colocado',
  'capital_vigente',
  'intereses_proyectados',
  'ingresos_cobrados',
] as const;
const CAMPOS_CONTEO = [
  'clientes_morosos',
  'clientes_extrajudiciales',
  'clientes_nuevos',
  'prestamos_otorgados',
] as const;

// HU-17 Reporte por sede con filtro de fechas y total consolidado. Solo ADMIN (ruta con rolGuard).
@Component({
  selector: 'app-reporte-por-sede',
  imports: [FormsModule, Aviso, MontoPipe],
  template: `
    <div class="flex flex-wrap items-end gap-3">
      <label class="text-sm font-medium text-slate-700">
        Desde
        <input
          type="date"
          [(ngModel)]="desde"
          class="mt-1 block rounded border border-slate-300 px-3 py-2"
        />
      </label>
      <label class="text-sm font-medium text-slate-700">
        Hasta
        <input
          type="date"
          [(ngModel)]="hasta"
          class="mt-1 block rounded border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="button"
        (click)="cargar()"
        [disabled]="cargando()"
        class="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {{ cargando() ? 'Consultando…' : 'Consultar' }}
      </button>
      <button
        type="button"
        (click)="limpiar()"
        [disabled]="cargando() || (!desde() && !hasta())"
        class="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Todo el periodo
      </button>
    </div>

    <div class="mt-4 space-y-2">
      <app-aviso [mensaje]="error()" />
      <app-aviso
        tipo="info"
        mensaje="Los ingresos cobrados reflejan solo datos precargados: el registro de pagos es del Sprint 2. Por eso se muestran también los intereses proyectados."
      />
    </div>

    <div class="mt-4 overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th class="px-3 py-2">Sede</th>
            <th class="px-3 py-2 text-right">Morosos</th>
            <th class="px-3 py-2 text-right">Extrajudiciales</th>
            <th class="px-3 py-2 text-right">Clientes nuevos</th>
            <th class="px-3 py-2 text-right">Préstamos otorgados</th>
            <th class="px-3 py-2 text-right">Capital colocado</th>
            <th class="px-3 py-2 text-right">Capital vigente</th>
            <th class="px-3 py-2 text-right">Intereses proyectados</th>
            <th class="px-3 py-2 text-right">Ingresos cobrados</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          @for (f of filas(); track f.sede) {
            <tr>
              <td class="px-3 py-2 font-medium text-slate-900">{{ f.sede }}</td>
              <td class="px-3 py-2 text-right" [class.text-amber-700]="f.clientes_morosos > 0">
                {{ f.clientes_morosos }}
              </td>
              <td
                class="px-3 py-2 text-right"
                [class.text-red-700]="f.clientes_extrajudiciales > 0"
              >
                {{ f.clientes_extrajudiciales }}
              </td>
              <td class="px-3 py-2 text-right">{{ f.clientes_nuevos }}</td>
              <td class="px-3 py-2 text-right">{{ f.prestamos_otorgados }}</td>
              <td class="px-3 py-2 text-right">{{ f.capital_colocado | monto }}</td>
              <td class="px-3 py-2 text-right">{{ f.capital_vigente | monto }}</td>
              <td class="px-3 py-2 text-right">{{ f.intereses_proyectados | monto }}</td>
              <td class="px-3 py-2 text-right">{{ f.ingresos_cobrados | monto }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="9" class="px-3 py-8 text-center text-slate-400">
                {{ cargando() ? 'Cargando reporte…' : 'Sin datos.' }}
              </td>
            </tr>
          }
        </tbody>
        @if (total(); as t) {
          <tfoot class="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
            <tr>
              <td class="px-3 py-2">Total consolidado</td>
              <td class="px-3 py-2 text-right">{{ t.clientes_morosos }}</td>
              <td class="px-3 py-2 text-right">{{ t.clientes_extrajudiciales }}</td>
              <td class="px-3 py-2 text-right">{{ t.clientes_nuevos }}</td>
              <td class="px-3 py-2 text-right">{{ t.prestamos_otorgados }}</td>
              <td class="px-3 py-2 text-right">{{ t.capital_colocado | monto }}</td>
              <td class="px-3 py-2 text-right">{{ t.capital_vigente | monto }}</td>
              <td class="px-3 py-2 text-right">{{ t.intereses_proyectados | monto }}</td>
              <td class="px-3 py-2 text-right">{{ t.ingresos_cobrados | monto }}</td>
            </tr>
          </tfoot>
        }
      </table>
    </div>

    <p class="mt-3 text-xs text-slate-500">
      El rango de fechas filtra clientes nuevos, préstamos otorgados, capital colocado e ingresos
      cobrados. Morosos, extrajudiciales, capital vigente e intereses proyectados son la situación a
      la fecha actual del sistema.
    </p>
  `,
})
export class ReportePorSede implements OnInit {
  private readonly reportes = inject(ReportesService);

  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly filas = signal<FilaReporteSedes[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Total consolidado: conteos sumados; montos sumados en céntimos para evitar errores de coma flotante. */
  protected readonly total = computed<Total | null>(() => {
    const filas = this.filas();
    if (filas.length === 0) return null;
    const total = {} as Total;
    for (const campo of CAMPOS_CONTEO) {
      total[campo] = filas.reduce((suma, f) => suma + Number(f[campo]), 0);
    }
    for (const campo of CAMPOS_MONTO) {
      total[campo] = filas.reduce((suma, f) => suma + Math.round(Number(f[campo]) * 100), 0) / 100;
    }
    return total;
  });

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  protected async limpiar(): Promise<void> {
    this.desde.set('');
    this.hasta.set('');
    await this.cargar();
  }

  protected async cargar(): Promise<void> {
    const desde = this.desde() || null;
    const hasta = this.hasta() || null;
    if (desde && hasta && desde > hasta) {
      this.error.set('La fecha «Desde» no puede ser posterior a la fecha «Hasta».');
      return;
    }
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.filas.set(await this.reportes.porSede(desde, hasta));
    } catch (e) {
      this.filas.set([]);
      this.error.set(mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }
}