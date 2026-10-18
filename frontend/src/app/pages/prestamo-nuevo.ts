import { Component, inject, signal } from '@angular/core';
import { Cliente, EvaluacionPrestamo } from '../core/contrato';
import { formatearFecha, formatearMonto } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
import { Aviso } from '../components/aviso';
import { ClientesService } from '../services/clientes.service';
import { PrestamosService } from '../services/prestamos.service';

/** HU-06: captura una solicitud y muestra el informe calculado por la base de datos. */
@Component({
  selector: 'app-pagina-prestamo-nuevo',
  imports: [Aviso],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900">Evaluar solicitud de préstamo</h1>
        <p class="mt-1 text-sm text-slate-600">Selecciona un cliente, indica el monto y el plazo para consultar sus condiciones.</p>
      </div>

      <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-slate-900">Datos de la solicitud</h2>
        <div class="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Buscar cliente por DNI o nombre</span>
            <input type="search" [value]="busqueda()" (input)="cambiarBusqueda($event)" (keydown.enter)="buscarCliente()" placeholder="Ej. 70000001" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200" />
          </label>
          <button type="button" (click)="buscarCliente()" [disabled]="buscando() || !busqueda().trim()" class="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
            {{ buscando() ? 'Buscando...' : 'Buscar' }}
          </button>
        </div>
        <app-aviso [mensaje]="errorBusqueda()" />

        @if (resultados().length > 0) {
          <div class="mt-3 divide-y divide-slate-200 rounded-md border border-slate-200">
            @for (cliente of resultados(); track cliente.id) {
              <button type="button" (click)="seleccionarCliente(cliente)" class="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                <span class="font-medium text-slate-900">{{ cliente.nombres }} {{ cliente.apellidos }}</span>
                <span class="ml-2 text-slate-500">DNI {{ cliente.dni }}</span>
              </button>
            }
          </div>
        } @else if (busquedaRealizada() && !buscando() && !errorBusqueda()) {
          <p class="mt-3 text-sm text-slate-600">No se encontraron clientes.</p>
        }

        @if (clienteSeleccionado(); as cliente) {
          <div class="mt-4 flex items-center justify-between rounded-md border border-sky-200 bg-sky-50 px-4 py-3">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-sky-700">Cliente seleccionado</p>
              <p class="font-medium text-slate-900">{{ cliente.nombres }} {{ cliente.apellidos }}</p>
              <p class="text-sm text-slate-600">DNI {{ cliente.dni }}</p>
            </div>
            <button type="button" (click)="quitarCliente()" class="text-sm text-sky-800 underline hover:no-underline">Cambiar</button>
          </div>
        }

        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Monto solicitado (S/)</span>
            <input type="number" min="1" step="0.01" [value]="monto()" (input)="cambiarMonto($event)" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200" />
          </label>
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Plazo (meses)</span>
            <input type="number" min="1" max="60" step="1" [value]="plazo()" (input)="cambiarPlazo($event)" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200" />
            <span class="mt-1 block text-xs text-slate-500">Entre 1 y 60 meses.</span>
          </label>
        </div>
        <app-aviso [mensaje]="errorEvaluacion()" />
        <button type="button" (click)="evaluar()" [disabled]="evaluando() || !puedeEvaluar()" class="mt-5 rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50">
          {{ evaluando() ? 'Evaluando...' : 'Evaluar solicitud' }}
        </button>
      </section>

      @if (evaluacion(); as informe) {
        <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" aria-live="polite">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-lg font-semibold text-slate-900">Informe de evaluación</h2>
            <span class="rounded-full px-3 py-1 text-sm font-semibold" [class]="informe.aprobable ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'">{{ informe.aprobable ? 'Aprobable' : 'Rechazado' }}</span>
          </div>

          @if (!informe.aprobable) {
            <div class="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-900">
              <h3 class="font-medium">Motivos del rechazo</h3>
              <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
                @for (motivo of informe.motivos; track $index) { <li>{{ motivo }}</li> }
              </ul>
            </div>
          } @else if (informe.motivos.length > 0) {
            <div class="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              @for (motivo of informe.motivos; track $index) { <p>{{ motivo }}</p> }
            </div>
          }

          <dl class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div class="rounded-md bg-slate-50 p-3"><dt class="text-xs text-slate-500">Estado del cliente</dt><dd class="mt-1"><span class="rounded-full px-2.5 py-1 text-xs font-semibold" [class]="estadoClase(informe.estado_cliente)">{{ nombreEstado(informe.estado_cliente) }}</span></dd></div>
            <div class="rounded-md bg-slate-50 p-3"><dt class="text-xs text-slate-500">Capital vigente</dt><dd class="mt-1 font-medium text-slate-900">{{ montoTexto(informe.capital_vigente) }}</dd></div>
            <div class="rounded-md bg-slate-50 p-3"><dt class="text-xs text-slate-500">Disponible</dt><dd class="mt-1 font-medium text-slate-900">{{ montoTexto(informe.disponible) }}</dd></div>
            <div class="rounded-md bg-slate-50 p-3"><dt class="text-xs text-slate-500">Monto máximo</dt><dd class="mt-1 font-medium text-slate-900">{{ montoTexto(informe.monto_maximo) }}</dd></div>
            <div class="rounded-md bg-slate-50 p-3"><dt class="text-xs text-slate-500">Primera cuota</dt><dd class="mt-1 font-medium text-slate-900">{{ montoTexto(informe.primera_cuota) }}</dd></div>
            <div class="rounded-md bg-slate-50 p-3"><dt class="text-xs text-slate-500">Total a pagar</dt><dd class="mt-1 font-medium text-slate-900">{{ montoTexto(informe.total_a_pagar) }}</dd></div>
            <div class="rounded-md bg-slate-50 p-3"><dt class="text-xs text-slate-500">Total de intereses</dt><dd class="mt-1 font-medium text-slate-900">{{ montoTexto(informe.total_intereses) }}</dd></div>
            <div class="rounded-md bg-slate-50 p-3"><dt class="text-xs text-slate-500">Primer vencimiento</dt><dd class="mt-1 font-medium text-slate-900">{{ fechaTexto(informe.primer_vencimiento) }}</dd></div>
          </dl>

          @if (informe.aprobable) {
            <div class="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4">
              <h3 class="font-medium text-emerald-900">Resumen antes de aprobar</h3>
              <p class="mt-1 text-sm text-emerald-800">
                Verifica las condiciones mostradas y confirma la conformidad del cliente.
              </p>
              <dl class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div><dt class="text-xs text-emerald-700">Monto</dt><dd class="font-medium text-slate-900">{{ montoTexto(montoSolicitado()) }}</dd></div>
                <div><dt class="text-xs text-emerald-700">Plazo</dt><dd class="font-medium text-slate-900">{{ plazo() }} meses</dd></div>
                <div><dt class="text-xs text-emerald-700">Cuota</dt><dd class="font-medium text-slate-900">{{ montoTexto(informe.primera_cuota) }}</dd></div>
                <div><dt class="text-xs text-emerald-700">Total a pagar</dt><dd class="font-medium text-slate-900">{{ montoTexto(informe.total_a_pagar) }}</dd></div>
                <div><dt class="text-xs text-emerald-700">Primer vencimiento</dt><dd class="font-medium text-slate-900">{{ fechaTexto(informe.primer_vencimiento) }}</dd></div>
              </dl>
              <label class="mt-4 flex items-start gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  [checked]="clienteConforme()"
                  (change)="cambiarConformidad($event)"
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
                />
                <span>El cliente está conforme y firmó el contrato</span>
              </label>
              <app-aviso [mensaje]="errorAprobacion()" />
              <app-aviso tipo="info" [mensaje]="prestamoCreado() ? 'Préstamo aprobado correctamente.' : null" />
              <button
                type="button"
                (click)="aprobar()"
                [disabled]="aprobando() || !clienteConforme() || prestamoCreado() !== null"
                class="mt-4 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {{ aprobando() ? 'Aprobando...' : 'Aprobar préstamo' }}
              </button>
              @if (prestamoCreado()) {
                <p class="mt-2 text-xs text-emerald-800">Código del préstamo: {{ prestamoCreado() }}</p>
              }
            </div>
          }
        </section>
      }
    </div>
  `,
})
export class PrestamoNuevo {
  private readonly clientes = inject(ClientesService);
  private readonly prestamos = inject(PrestamosService);

  protected readonly busqueda = signal('');
  protected readonly resultados = signal<Cliente[]>([]);
  protected readonly clienteSeleccionado = signal<Cliente | null>(null);
  protected readonly monto = signal('');
  protected readonly plazo = signal('');
  protected readonly evaluacion = signal<EvaluacionPrestamo | null>(null);
  protected readonly errorBusqueda = signal<string | null>(null);
  protected readonly errorEvaluacion = signal<string | null>(null);
  protected readonly errorAprobacion = signal<string | null>(null);
  protected readonly buscando = signal(false);
  protected readonly evaluando = signal(false);
  protected readonly aprobando = signal(false);
  protected readonly clienteConforme = signal(false);
  protected readonly prestamoCreado = signal<string | null>(null);
  protected readonly busquedaRealizada = signal(false);

  protected cambiarBusqueda(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
    this.busquedaRealizada.set(false);
    this.errorBusqueda.set(null);
  }

  protected cambiarMonto(evento: Event): void {
    this.monto.set((evento.target as HTMLInputElement).value);
    this.evaluacion.set(null);
    this.errorEvaluacion.set(null);
    this.reiniciarAprobacion();
  }

  protected cambiarPlazo(evento: Event): void {
    this.plazo.set((evento.target as HTMLInputElement).value);
    this.evaluacion.set(null);
    this.errorEvaluacion.set(null);
    this.reiniciarAprobacion();
  }

  protected async buscarCliente(): Promise<void> {
    const texto = this.busqueda().trim();
    if (!texto || this.buscando()) return;
    this.buscando.set(true);
    this.errorBusqueda.set(null);
    this.resultados.set([]);
    this.busquedaRealizada.set(true);
    try {
      this.resultados.set(await this.clientes.buscar(texto));
    } catch (error) {
      this.errorBusqueda.set(mensajeDeError(error));
    } finally {
      this.buscando.set(false);
    }
  }

  protected seleccionarCliente(cliente: Cliente): void {
    this.clienteSeleccionado.set(cliente);
    this.resultados.set([]);
    this.evaluacion.set(null);
    this.errorEvaluacion.set(null);
    this.reiniciarAprobacion();
  }

  protected quitarCliente(): void {
    this.clienteSeleccionado.set(null);
    this.evaluacion.set(null);
    this.errorEvaluacion.set(null);
    this.reiniciarAprobacion();
  }

  protected puedeEvaluar(): boolean {
    const monto = Number(this.monto());
    const plazo = Number(this.plazo());
    return Boolean(this.clienteSeleccionado()) && Number.isFinite(monto) && monto > 0 && Number.isInteger(plazo);
  }

  protected async evaluar(): Promise<void> {
    const cliente = this.clienteSeleccionado();
    const monto = Number(this.monto());
    const plazo = Number(this.plazo());
    if (!cliente || !this.puedeEvaluar() || this.evaluando()) return;
    this.evaluando.set(true);
    this.errorEvaluacion.set(null);
    this.evaluacion.set(null);
    this.reiniciarAprobacion();
    try {
      this.evaluacion.set(await this.prestamos.evaluar({ p_cliente: cliente.id, p_monto: monto, p_plazo: plazo }));
    } catch (error) {
      this.errorEvaluacion.set(mensajeDeError(error));
    } finally {
      this.evaluando.set(false);
    }
  }

  protected cambiarConformidad(evento: Event): void {
    this.clienteConforme.set((evento.target as HTMLInputElement).checked);
    this.errorAprobacion.set(null);
  }

  protected async aprobar(): Promise<void> {
    const cliente = this.clienteSeleccionado();
    const informe = this.evaluacion();
    const monto = Number(this.monto());
    const plazo = Number(this.plazo());
    if (!cliente || !informe?.aprobable || !this.clienteConforme() || this.aprobando()) return;

    this.aprobando.set(true);
    this.errorAprobacion.set(null);
    try {
      this.prestamoCreado.set(
        await this.prestamos.aprobar({
          p_cliente: cliente.id,
          p_monto: monto,
          p_plazo: plazo,
          p_cliente_conforme: true,
        }),
      );
    } catch (error) {
      this.errorAprobacion.set(mensajeDeError(error));
    } finally {
      this.aprobando.set(false);
    }
  }

  private reiniciarAprobacion(): void {
    this.clienteConforme.set(false);
    this.prestamoCreado.set(null);
    this.errorAprobacion.set(null);
  }

  protected montoTexto(valor: number | null): string {
    return valor === null ? '—' : formatearMonto(valor);
  }

  protected montoSolicitado(): number {
    return Number(this.monto());
  }

  protected fechaTexto(valor: string | null): string {
    return valor ? formatearFecha(valor) : '—';
  }

  protected nombreEstado(estado: Cliente['estado']): string {
    return { AL_DIA: 'Al día', MOROSO: 'Moroso', EXTRAJUDICIAL: 'Extrajudicial' }[estado];
  }

  protected estadoClase(estado: Cliente['estado']): string {
    return {
      AL_DIA: 'bg-emerald-100 text-emerald-800',
      MOROSO: 'bg-amber-100 text-amber-900',
      EXTRAJUDICIAL: 'bg-red-100 text-red-800',
    }[estado];
  }
}
