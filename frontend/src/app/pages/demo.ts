import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Aviso } from '../components/aviso';
import { ParametroEditable } from '../core/contrato';
import { formatearFecha } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
import { DemoService } from '../services/demo.service';

interface OpcionParametro {
  valor: string;
  texto: string;
}

interface ConfigParametro {
  clave: ParametroEditable;
  titulo: string;
  ayuda: string;
  opciones: OpcionParametro[];
}

const PARAMETROS: ConfigParametro[] = [
  {
    clave: 'metodo_cuota',
    titulo: 'Método de cuota',
    ayuda:
      'Solo afecta a los préstamos que se aprueben desde ahora; los ya creados conservan su método.',
    opciones: [
      { valor: 'CAPITAL_CONSTANTE', texto: 'Capital constante (la cuota baja cada mes)' },
      { valor: 'CUOTA_FIJA', texto: 'Cuota fija (todas las cuotas iguales)' },
    ],
  },
  {
    clave: 'mora_modalidad',
    titulo: 'Modalidad de mora',
    ayuda: 'Se calcula al consultar: cambia la mora de todos los clientes con deuda vencida.',
    opciones: [
      { valor: 'COMPUESTA', texto: 'Compuesta (1% diario sobre el monto acumulado)' },
      { valor: 'SIMPLE', texto: 'Simple (1% diario sobre la cuota)' },
    ],
  },
  {
    clave: 'liberacion_cupo',
    titulo: 'Liberación del cupo',
    ayuda: 'Cambia el capital vigente y el disponible de todos los clientes.',
    opciones: [
      { valor: 'AL_CANCELAR', texto: 'Al cancelar el préstamo completo' },
      { valor: 'CAPITAL_AMORTIZADO', texto: 'Según el capital ya amortizado' },
    ],
  },
];

// HU-T1 Modo demostración (solo ADMIN): fecha simulada, parámetros y recálculo de estados.
@Component({
  selector: 'app-pagina-demo',
  imports: [FormsModule, Aviso],
  template: `
    <h1 class="text-2xl font-semibold text-slate-900">Modo demostración</h1>
    <p class="mt-1 text-sm text-slate-600">
      Solo para la presentación. Los cambios de fecha y de estados afectan a todos los usuarios del
      sistema: al avanzar la fecha, las cuotas pasan a vencidas y los clientes a Moroso o
      Extrajudicial, y eso no se revierte al volver atrás. Todo se deshace con «Reiniciar datos de
      demostración» (más abajo), que borra los cambios de todos los usuarios y deja los datos como
      al inicio.
    </p>

    <div class="mt-4 space-y-2">
      <app-aviso [mensaje]="error()" />
      <app-aviso tipo="info" [mensaje]="exito()" />
    </div>

    <section class="mt-6 rounded-md border border-slate-200 bg-white p-4">
      <h2 class="font-semibold text-slate-900">Fecha simulada</h2>
      <p class="mt-1 text-sm text-slate-600">
        Fecha que usa el sistema:
        <strong>{{
          fechaActual() ? formatear(fechaActual()) + ' (simulada)' : 'la fecha real'
        }}</strong>
      </p>
      <div class="mt-3 flex flex-wrap items-end gap-3">
        <label class="text-sm font-medium text-slate-700">
          Nueva fecha
          <input
            type="date"
            name="fecha"
            min="2000-01-01"
            max="2100-12-31"
            [(ngModel)]="fecha"
            [disabled]="ocupado()"
            class="mt-1 block rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
          />
        </label>
        <button
          type="button"
          (click)="fijarFecha()"
          [disabled]="ocupado() || !fechaEnRango()"
          class="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Fijar fecha simulada
        </button>
        <button
          type="button"
          (click)="volverAFechaReal()"
          [disabled]="ocupado()"
          class="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Volver a la fecha real
        </button>
      </div>
    </section>

    <section class="mt-6 rounded-md border border-slate-200 bg-white p-4">
      <h2 class="font-semibold text-slate-900">Parámetros</h2>
      <div class="mt-3 grid gap-4 md:grid-cols-3">
        @for (p of parametros; track p.clave) {
          <label class="block text-sm font-medium text-slate-700">
            {{ p.titulo }}
            <select
              #selector
              (change)="cambiarParametro(p.clave, selector)"
              [disabled]="ocupado() || !cargado()"
              class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
            >
              @for (o of p.opciones; track o.valor) {
                <option [value]="o.valor" [selected]="valores()[p.clave] === o.valor">
                  {{ o.texto }}
                </option>
              }
            </select>
            <span class="mt-1 block text-xs font-normal text-slate-500">{{ p.ayuda }}</span>
          </label>
        }
      </div>
    </section>

    <section class="mt-6 rounded-md border border-slate-200 bg-white p-4">
      <h2 class="font-semibold text-slate-900">Estados de los clientes</h2>
      <p class="mt-1 text-sm text-slate-600">
        Recalcula cuotas vencidas, Moroso y Extrajudicial de todos los clientes con la fecha actual
        del sistema. Úsalo después de cambiar la fecha.
      </p>
      <button
        type="button"
        (click)="actualizarEstados()"
        [disabled]="ocupado()"
        class="mt-3 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {{ ocupado() ? 'Procesando…' : 'Actualizar estados ahora' }}
      </button>
    </section>

    <section class="mt-6 rounded-md border border-red-200 bg-white p-4">
      <h2 class="font-semibold text-slate-900">Reiniciar datos de demostración</h2>
      <p class="mt-1 text-sm text-slate-600">
        Borra todos los clientes, préstamos y cuotas, vuelve a cargar los 7 clientes demo y deja el
        sistema con la fecha real. No cambia los parámetros de arriba ni la bitácora.
      </p>
      @if (!confirmandoReinicio()) {
        <button
          type="button"
          (click)="pedirConfirmacion()"
          [disabled]="ocupado() || !cargado()"
          class="mt-3 rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reiniciar datos de demostración
        </button>
      } @else {
        <div class="mt-3 rounded border border-red-300 bg-red-50 p-3" role="alertdialog">
          <p class="text-sm font-medium text-red-900">
            Esto borra los cambios de todos los usuarios y deja los datos demo como al inicio.
          </p>
          <div class="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              (click)="reiniciarDatos()"
              [disabled]="ocupado()"
              class="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {{ ocupado() ? 'Reiniciando…' : 'Sí, reiniciar' }}
            </button>
            <button
              type="button"
              (click)="cancelarReinicio()"
              [disabled]="ocupado()"
              class="rounded border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      }
    </section>
  `,
})
export class Demo implements OnInit {
  private readonly demo = inject(DemoService);

  protected readonly parametros = PARAMETROS;
  protected readonly formatear = formatearFecha;
  protected readonly fechaActual = this.demo.fechaReferencia;
  protected readonly fecha = signal('');
  protected readonly valores = signal<Record<string, string>>({});
  protected readonly cargado = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly exito = signal<string | null>(null);
  protected readonly confirmandoReinicio = signal(false);

  async ngOnInit(): Promise<void> {
    await this.ejecutar(async () => {
      await this.demo.cargarFechaReferencia();
      const lista = await this.demo.parametros();
      this.valores.set(Object.fromEntries(lista.map((p) => [p.clave, p.valor])));
      this.fecha.set(this.fechaActual());
      this.cargado.set(true);
    });
  }

  /** Fecha escrita y dentro de 2000-01-01 a 2100-12-31 (evita años de 6 dígitos). */
  protected fechaEnRango(): boolean {
    const fecha = this.fecha();
    return /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha >= '2000-01-01' && fecha <= '2100-12-31';
  }

  protected async fijarFecha(): Promise<void> {
    const fecha = this.fecha();
    await this.ejecutar(async () => {
      await this.demo.fijarFechaReferencia(fecha);
      this.exito.set(
        `Fecha simulada fijada en ${formatearFecha(fecha)}. Pulsa «Actualizar estados ahora» para ver los cambios. Los estados ya recalculados no se revierten; usa «Reiniciar datos de demostración» para deshacerlos.`,
      );
    });
  }

  protected async volverAFechaReal(): Promise<void> {
    await this.ejecutar(async () => {
      await this.demo.volverAFechaReal();
      this.fecha.set(this.fechaActual());
      this.exito.set(
        'El sistema vuelve a usar la fecha real. Los estados ya recalculados no se revierten; usa «Reiniciar datos de demostración» para deshacerlos.',
      );
    });
  }

  protected async cambiarParametro(
    clave: ParametroEditable,
    selector: HTMLSelectElement,
  ): Promise<void> {
    const valor = selector.value;
    const anterior = this.valores()[clave] ?? '';
    await this.ejecutar(
      async () => {
        await this.demo.actualizarParametro(clave, valor);
        this.valores.update((v) => ({ ...v, [clave]: valor }));
        this.exito.set('Parámetro actualizado.');
      },
      // Si falla, el selector vuelve al valor que sigue vigente
      () => (selector.value = anterior),
    );
  }

  protected async actualizarEstados(): Promise<void> {
    await this.ejecutar(async () => {
      await this.demo.actualizarEstados();
      this.exito.set('Estados actualizados con la fecha actual del sistema.');
    });
  }

  protected pedirConfirmacion(): void {
    this.error.set(null);
    this.exito.set(null);
    this.confirmandoReinicio.set(true);
  }

  protected cancelarReinicio(): void {
    this.confirmandoReinicio.set(false);
  }

  protected async reiniciarDatos(): Promise<void> {
    await this.ejecutar(async () => {
      const resumen = await this.demo.reiniciarDatos();
      this.fecha.set('');
      this.confirmandoReinicio.set(false);
      this.exito.set(
        `Datos de demostración reiniciados: ${resumen.clientes} clientes, ${resumen.prestamos} préstamos y ${resumen.cuotas} cuotas. El sistema usa la fecha real.`,
      );
    });
  }

  private async ejecutar(accion: () => Promise<void>, alFallar?: () => void): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    this.exito.set(null);
    try {
      await accion();
    } catch (e) {
      this.error.set(mensajeDeError(e));
      alFallar?.();
    } finally {
      this.ocupado.set(false);
    }
  }
}
