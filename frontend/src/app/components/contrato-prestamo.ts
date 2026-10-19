import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { Uuid } from '../core/contrato';
import { FechaPipe, MontoPipe } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
import { PrestamoContrato, PrestamosService } from '../services/prestamos.service';
import { Aviso } from './aviso';

const METODO_TEXTO: Record<string, string> = {
  CAPITAL_CONSTANTE: 'Capital constante (amortización igual cada mes)',
  CUOTA_FIJA: 'Cuota fija',
};

/** Suma en céntimos para que los totales no arrastren errores de coma flotante. */
function sumar(valores: number[]): number {
  return valores.reduce((suma, v) => suma + Math.round(Number(v) * 100), 0) / 100;
}

/**
 * HU-09 Contrato y cronograma imprimible. Uso en el detalle del préstamo (pantalla de C):
 *   <app-contrato-prestamo [prestamoId]="prestamo.id" />
 * Todo sale de datos guardados del préstamo (no de la fecha de hoy ni del estado de las cuotas),
 * así que imprimirlo otra vez produce el mismo documento (CA2).
 */
@Component({
  selector: 'app-contrato-prestamo',
  imports: [Aviso, MontoPipe, FechaPipe],
  // Sin encapsulación: las reglas @media print deben alcanzar al body de la página
  encapsulation: ViewEncapsulation.None,
  styles: `
    @media print {
      @page {
        size: A4;
        margin: 15mm;
      }
      body * {
        visibility: hidden;
      }
      .contrato-impresion,
      .contrato-impresion * {
        visibility: visible;
      }
      .contrato-impresion {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }
      .contrato-impresion tr {
        break-inside: avoid;
      }
      .no-imprimir {
        display: none !important;
      }
    }
  `,
  template: `
    <app-aviso [mensaje]="error()" />

    @if (cargando()) {
      <p class="py-6 text-center text-sm text-slate-400">Cargando contrato…</p>
    }

    @if (prestamo(); as p) {
      <div class="no-imprimir mb-3 flex justify-end">
        <button
          type="button"
          (click)="imprimir()"
          class="rounded-xl bg-vino-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-vino-800"
        >
          Imprimir contrato
        </button>
      </div>

      <article
        class="contrato-impresion rounded-md border border-slate-200 bg-white p-8 text-sm text-slate-900"
      >
        <header class="border-b border-slate-300 pb-4 text-center">
          <h2 class="text-xl font-bold uppercase">Contrato de préstamo y cronograma de pagos</h2>
          <p class="mt-1 text-xs text-slate-600">N.° {{ numero() }}</p>
        </header>

        <section class="mt-4 grid grid-cols-2 gap-x-8 gap-y-1">
          <p>
            <span class="text-slate-600">Cliente:</span> <strong>{{ nombreCliente() }}</strong>
          </p>
          <p>
            <span class="text-slate-600">DNI:</span> <strong>{{ p.clientes.dni }}</strong>
          </p>
          <p><span class="text-slate-600">Sede:</span> {{ p.sedes?.nombre }}</p>
          <p><span class="text-slate-600">Atendido por:</span> {{ p.trabajadores?.nombre }}</p>
          <p>
            <span class="text-slate-600">Fecha del préstamo:</span>
            {{ p.fecha_desembolso | fecha }}
          </p>
          <p>
            <span class="text-slate-600">Monto prestado:</span>
            <strong>{{ p.monto | monto }}</strong>
          </p>
          <p><span class="text-slate-600">Plazo:</span> {{ p.plazo_meses }} meses</p>
          <p><span class="text-slate-600">Tasa:</span> {{ tasa() }}% TEA (tasa efectiva anual)</p>
          <p class="col-span-2">
            <span class="text-slate-600">Método de cuota:</span> {{ metodo() }}
          </p>
        </section>

        <h3 class="mt-6 font-semibold">Cronograma de pagos</h3>
        <table class="mt-2 w-full border-collapse text-xs">
          <thead>
            <tr class="border-b border-slate-400 text-left">
              <th class="py-1 pr-2">N.°</th>
              <th class="py-1 pr-2">Vencimiento</th>
              <th class="py-1 pr-2 text-right">Cuota</th>
              <th class="py-1 pr-2 text-right">Capital</th>
              <th class="py-1 pr-2 text-right">Interés</th>
              <th class="py-1 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            @for (c of p.cuotas; track c.numero) {
              <tr class="border-b border-slate-200">
                <td class="py-1 pr-2">{{ c.numero }}</td>
                <td class="py-1 pr-2">{{ c.fecha_vencimiento | fecha }}</td>
                <td class="py-1 pr-2 text-right">{{ c.cuota | monto }}</td>
                <td class="py-1 pr-2 text-right">{{ c.capital | monto }}</td>
                <td class="py-1 pr-2 text-right">{{ c.interes | monto }}</td>
                <td class="py-1 text-right">{{ c.saldo | monto }}</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr class="border-t-2 border-slate-400 font-semibold">
              <td class="py-1 pr-2" colspan="2">Totales</td>
              <td class="py-1 pr-2 text-right">{{ totales().cuota | monto }}</td>
              <td class="py-1 pr-2 text-right">{{ totales().capital | monto }}</td>
              <td class="py-1 pr-2 text-right">{{ totales().interes | monto }}</td>
              <td class="py-1"></td>
            </tr>
          </tfoot>
        </table>

        <section class="mt-6 rounded border border-slate-300 p-3 text-xs leading-relaxed">
          <p class="font-semibold">Condiciones de morosidad</p>
          <p class="mt-1">
            Cada cuota vence cada 30 días contados desde la fecha del préstamo. Si una cuota no se
            paga en su fecha de vencimiento, desde el día siguiente el cliente pasa a la condición
            de
            <strong>Moroso</strong>, se cobra una mora del 1% por cada día de atraso y no podrá
            recibir nuevos préstamos mientras mantenga deuda vencida. Si permanece más de un año sin
            realizar ningún pago, su deuda se deriva a una empresa de cobranza extrajudicial.
          </p>
          <p class="mt-1">
            El préstamo es irreversible: una vez firmado no se anula ni se modifica.
          </p>
        </section>

        <section class="mt-16 grid grid-cols-2 gap-16 text-center text-xs">
          <div class="border-t border-slate-500 pt-1">
            {{ nombreCliente() }}<br />DNI {{ p.clientes.dni }}<br />Cliente
          </div>
          <div class="border-t border-slate-500 pt-1">
            {{ p.trabajadores?.nombre }}<br />{{ p.sedes?.nombre }}<br />Por la empresa
          </div>
        </section>
      </article>
    }
  `,
})
export class ContratoPrestamo {
  private readonly prestamos = inject(PrestamosService);

  readonly prestamoId = input.required<Uuid>();

  protected readonly prestamo = signal<PrestamoContrato | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly numero = computed(() => (this.prestamo()?.id ?? '').slice(0, 8).toUpperCase());
  protected readonly nombreCliente = computed(() => {
    const c = this.prestamo()?.clientes;
    return c ? `${c.nombres} ${c.apellidos}` : '';
  });
  protected readonly tasa = computed(() =>
    (Math.round(Number(this.prestamo()?.tea ?? 0) * 10000) / 100).toString(),
  );
  protected readonly metodo = computed(() => {
    const m = this.prestamo()?.metodo_cuota ?? '';
    return METODO_TEXTO[m] ?? m;
  });
  protected readonly totales = computed(() => {
    const cuotas = this.prestamo()?.cuotas ?? [];
    return {
      cuota: sumar(cuotas.map((c) => c.cuota)),
      capital: sumar(cuotas.map((c) => c.capital)),
      interes: sumar(cuotas.map((c) => c.interes)),
    };
  });

  constructor() {
    // Se recarga si cambia el préstamo que se muestra
    effect(() => {
      const id = this.prestamoId();
      void this.cargar(id);
    });
  }

  protected imprimir(): void {
    window.print();
  }

  private async cargar(id: Uuid): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.prestamo.set(null);
    try {
      this.prestamo.set(await this.prestamos.obtenerContrato(id));
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }
}