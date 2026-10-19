import { Component, inject, OnInit, signal } from '@angular/core';
import { Aviso } from '../components/aviso';
import { Sede } from '../core/contrato';
import { mensajeDeError } from '../core/supabase';
import { ReportesService } from '../services/reportes.service';
import { Bitacora } from './reportes/bitacora';
import { ReporteMorosos } from './reportes/morosos';
import { ReportePorSede } from './reportes/por-sede';

type Pestana = 'morosos' | 'sedes' | 'bitacora';

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'morosos', texto: 'Morosos y extrajudiciales' },
  { id: 'sedes', texto: 'Por sede' },
  { id: 'bitacora', texto: 'Bitácora' },
];

@Component({
  selector: 'app-pagina-reportes',
  imports: [Aviso, ReporteMorosos, ReportePorSede, Bitacora],
  template: `
    <header>
      <p class="text-xs font-semibold uppercase tracking-widest text-vino-700">Administración</p>
      <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-900">Reportes</h1>
      <p class="mt-1 text-slate-500">Morosidad, desempeño por sede y bitácora de auditoría.</p>
    </header>

    <div class="mt-6 inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="tablist">
      @for (p of pestanas; track p.id) {
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="activa() === p.id"
          (click)="activa.set(p.id)"
          class="rounded-lg px-4 py-2 text-sm font-medium transition"
          [class]="
            activa() === p.id ? 'bg-vino-700 text-white shadow' : 'text-slate-600 hover:bg-vino-50 hover:text-vino-800'
          "
        >
          {{ p.texto }}
        </button>
      }
    </div>

    <div class="mt-4">
      <app-aviso [mensaje]="error()" />
    </div>

    <section class="mt-4">
      @switch (activa()) {
        @case ('morosos') {
          <app-reporte-morosos [sedes]="sedes()" />
        }
        @case ('sedes') {
          <app-reporte-por-sede />
        }
        @case ('bitacora') {
          <app-bitacora [sedes]="sedes()" />
        }
      }
    </section>
  `,
})
export class Reportes implements OnInit {
  private readonly reportes = inject(ReportesService);

  protected readonly pestanas = PESTANAS;
  protected readonly activa = signal<Pestana>('morosos');
  protected readonly sedes = signal<Sede[]>([]);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.sedes.set(await this.reportes.sedes());
    } catch (e) {
      this.error.set(mensajeDeError(e));
    }
  }
}