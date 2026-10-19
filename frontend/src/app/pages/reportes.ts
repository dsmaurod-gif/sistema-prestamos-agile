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
    <h1 class="text-2xl font-semibold text-slate-900">Reportes</h1>

    <div class="mt-4 flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
      @for (p of pestanas; track p.id) {
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="activa() === p.id"
          (click)="activa.set(p.id)"
          class="-mb-px rounded-t border px-4 py-2 text-sm"
          [class]="
            activa() === p.id
              ? 'border-slate-200 border-b-white bg-white font-semibold text-slate-900'
              : 'border-transparent text-slate-600 hover:text-slate-900'
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