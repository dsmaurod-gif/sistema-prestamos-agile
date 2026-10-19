import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Cliente, EvaluacionPrestamo } from '../core/contrato';
import { formatearFecha, formatearMonto } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
import {
  bloquearNoEnteros,
  limpiarCampo,
  limpiarMonto,
  limpiarNombre,
  soloDigitos,
} from '../core/validaciones';
import { Aviso } from '../components/aviso';
import { Icono } from '../components/icono';
import { ClientesService } from '../services/clientes.service';
import { PrestamosService } from '../services/prestamos.service';

/** Búsqueda de cliente: si empieza con un dígito es un DNI (solo dígitos, 8); si no, un nombre (solo letras). */
const limpiarBusquedaCliente = (valor: string): string =>
  /^\s*\d/.test(valor) ? soloDigitos(valor, 8) : limpiarNombre(valor, 60);

/** HU-06: captura una solicitud y muestra el informe calculado por la base de datos. */
@Component({
  selector: 'app-pagina-prestamo-nuevo',
  imports: [Aviso, Icono],
  template: `
    <div class="mx-auto max-w-5xl space-y-6">
      <header>
        <p class="text-xs font-semibold uppercase tracking-widest text-vino-700">Préstamos</p>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-900">Nuevo préstamo</h1>
        <p class="mt-1 text-slate-500">
          Selecciona un cliente, indica el monto y el plazo, y consulta sus condiciones antes de aprobar.
        </p>
      </header>

      <!-- Pasos -->
      <ol class="flex items-center" aria-label="Pasos de la solicitud">
        @for (p of pasos; track p.n) {
          <li class="flex items-center" [class]="p.n < 4 ? 'flex-1' : ''">
            <div class="flex items-center gap-2.5">
              <span
                class="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold transition"
                [class]="
                  pasoActual() > p.n
                    ? 'bg-vino-700 text-white'
                    : pasoActual() === p.n
                      ? 'bg-vino-700 text-white ring-4 ring-vino-100'
                      : 'bg-slate-200 text-slate-500'
                "
              >
                @if (pasoActual() > p.n) {
                  <app-icono nombre="ok" class="h-5 w-5" />
                } @else {
                  {{ p.n }}
                }
              </span>
              <span class="hidden text-sm font-medium sm:inline" [class]="pasoActual() >= p.n ? 'text-slate-900' : 'text-slate-400'">{{ p.texto }}</span>
            </div>
            @if (p.n < 4) {
              <span class="mx-3 h-0.5 flex-1 rounded" [class]="pasoActual() > p.n ? 'bg-vino-700' : 'bg-slate-200'"></span>
            }
          </li>
        }
      </ol>

      <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 class="text-lg font-bold text-slate-900">Datos de la solicitud</h2>

        <!-- Cliente -->
        @if (clienteSeleccionado(); as cliente) {
          <div class="animar-aparece mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-vino-200 bg-vino-50/60 px-5 py-4">
            <div class="flex items-center gap-4">
              <span class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-vino-100 text-vino-800">
                <app-icono nombre="persona" class="h-6 w-6" />
              </span>
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-vino-700">Cliente seleccionado</p>
                <p class="text-lg font-bold text-slate-900">{{ cliente.nombres }} {{ cliente.apellidos }}</p>
                <p class="text-sm text-slate-600">
                  DNI <span class="font-mono">{{ cliente.dni }}</span>
                  <span class="ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold" [class]="estadoClase(cliente.estado)">{{ nombreEstado(cliente.estado) }}</span>
                </p>
              </div>
            </div>
            <button type="button" (click)="quitarCliente()" class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-vino-300 hover:text-vino-800">
              Cambiar cliente
            </button>
          </div>
        } @else {
          <div class="mt-5">
            <label class="block text-sm font-medium text-slate-700" for="inp-buscar-cliente">Buscar cliente por DNI o nombre</label>
            <div class="mt-1.5 flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 transition focus-within:border-vino-500 focus-within:ring-4 focus-within:ring-vino-100">
              <app-icono nombre="buscar" class="h-5 w-5 text-slate-400" />
              <input
                id="inp-buscar-cliente"
                type="search"
                maxlength="60"
                autocomplete="off"
                [value]="busqueda()"
                (input)="cambiarBusqueda($event)"
                (keydown.enter)="buscarCliente()"
                placeholder="Escribe un DNI o un nombre; las coincidencias aparecen abajo"
                class="min-w-0 flex-1 bg-transparent py-3 text-slate-900 outline-none placeholder:text-slate-400"
              />
              @if (buscando()) {
                <span class="text-xs text-slate-400">Buscando…</span>
              }
            </div>
            <app-aviso [mensaje]="errorBusqueda()" />

            @if (resultados().length > 0) {
              <ul class="animar-aparece mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                @for (cliente of resultados(); track cliente.id) {
                  <li>
                    <button type="button" (click)="seleccionarCliente(cliente)" class="flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-vino-50/60">
                      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-vino-100 text-xs font-bold text-vino-800">{{ cliente.nombres[0] }}{{ cliente.apellidos[0] }}</span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-semibold text-slate-900">{{ cliente.nombres }} {{ cliente.apellidos }}</span>
                        <span class="block text-sm text-slate-500">DNI {{ cliente.dni }}</span>
                      </span>
                      <span class="rounded-full px-2.5 py-1 text-xs font-semibold" [class]="estadoClase(cliente.estado)">{{ nombreEstado(cliente.estado) }}</span>
                    </button>
                  </li>
                }
              </ul>
            } @else if (busquedaRealizada() && !buscando() && !errorBusqueda()) {
              <p class="mt-3 text-sm text-slate-600">No se encontraron clientes con ese DNI o nombre.</p>
            } @else {
              <p class="mt-2 text-xs text-slate-400">DNI: 8 dígitos. Nombre: solo letras.</p>
            }
          </div>
        }

        <!-- Monto y plazo: aparecen al elegir al cliente -->
        @if (clienteSeleccionado()) {
          <div class="animar-paso mt-6 border-t border-slate-100 pt-6">
            <div class="grid gap-5 sm:grid-cols-2">
              <div>
                <label class="block text-sm font-medium text-slate-700" for="inp-monto">Monto solicitado (S/)</label>
                <div class="mt-1.5 flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 transition focus-within:border-vino-500 focus-within:ring-4 focus-within:ring-vino-100">
                  <span class="font-semibold text-slate-400">S/</span>
                  <input
                    id="inp-monto"
                    type="text"
                    inputmode="decimal"
                    maxlength="9"
                    autocomplete="off"
                    placeholder="0.00"
                    [value]="monto()"
                    (input)="cambiarMonto($event)"
                    class="w-full bg-transparent py-3 text-lg font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-300"
                  />
                </div>
                <p class="mt-1 text-xs text-slate-400">Hasta 2 decimales. El tope lo valida la evaluación.</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700" for="inp-plazo">Plazo (meses)</label>
                <input
                  id="inp-plazo"
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  inputmode="numeric"
                  [value]="plazo()"
                  (keydown)="bloquearTeclas($event)"
                  (input)="cambiarPlazo($event)"
                  placeholder="Ej. 6"
                  class="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-300 focus:border-vino-500 focus:ring-4 focus:ring-vino-100"
                />
                <p class="mt-1 text-xs text-slate-400">Entre 1 y 60 meses.</p>
              </div>
            </div>

            <app-aviso [mensaje]="errorEvaluacion()" />
            <button
              type="button"
              (click)="evaluar()"
              [disabled]="evaluando() || !puedeEvaluar()"
              class="mt-6 flex items-center gap-2 rounded-xl bg-vino-700 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-vino-700/25 transition hover:bg-vino-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              <app-icono nombre="documento" class="h-5 w-5" />
              {{ evaluando() ? 'Evaluando…' : 'Evaluar solicitud' }}
            </button>
          </div>
        }
      </section>

      <!-- Informe de evaluación -->
      @if (evaluacion(); as informe) {
        <section class="animar-paso overflow-hidden rounded-2xl border bg-white shadow-sm" [class]="informe.aprobable ? 'border-emerald-200' : 'border-red-200'" aria-live="polite">
          <div class="flex flex-wrap items-center gap-4 px-6 py-5 sm:px-8" [class]="informe.aprobable ? 'bg-emerald-50' : 'bg-red-50'">
            <span class="grid h-12 w-12 shrink-0 place-items-center rounded-full" [class]="informe.aprobable ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'">
              <app-icono [nombre]="informe.aprobable ? 'ok' : 'alerta'" class="h-7 w-7" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-xl font-bold" [class]="informe.aprobable ? 'text-emerald-900' : 'text-red-900'">Informe de evaluación</h2>
              <p class="text-sm" [class]="informe.aprobable ? 'text-emerald-700' : 'text-red-700'">
                {{ informe.aprobable ? 'La solicitud cumple todas las reglas de crédito.' : 'La solicitud no puede aprobarse.' }}
              </p>
            </div>
            <span class="rounded-full px-4 py-1.5 text-sm font-bold" [class]="informe.aprobable ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'">{{ informe.aprobable ? 'Aprobable' : 'Rechazado' }}</span>
          </div>

          <div class="p-6 sm:p-8">
            @if (!informe.aprobable) {
              <div class="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
                <h3 class="font-semibold">Motivos del rechazo</h3>
                <ul class="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                  @for (motivo of informe.motivos; track $index) { <li>{{ motivo }}</li> }
                </ul>
              </div>
            } @else if (informe.motivos.length > 0) {
              <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                @for (motivo of informe.motivos; track $index) { <p>{{ motivo }}</p> }
              </div>
            }

            <dl class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div class="rounded-xl bg-slate-50 p-4"><dt class="text-xs text-slate-500">Estado del cliente</dt><dd class="mt-1"><span class="rounded-full px-2.5 py-1 text-xs font-semibold" [class]="estadoClase(informe.estado_cliente)">{{ nombreEstado(informe.estado_cliente) }}</span></dd></div>
              <div class="rounded-xl bg-slate-50 p-4"><dt class="text-xs text-slate-500">Capital vigente</dt><dd class="mt-1 text-lg font-bold text-slate-900">{{ montoTexto(informe.capital_vigente) }}</dd></div>
              <div class="rounded-xl bg-slate-50 p-4"><dt class="text-xs text-slate-500">Disponible</dt><dd class="mt-1 text-lg font-bold text-slate-900">{{ montoTexto(informe.disponible) }}</dd></div>
              <div class="rounded-xl bg-slate-50 p-4"><dt class="text-xs text-slate-500">Monto máximo</dt><dd class="mt-1 text-lg font-bold text-slate-900">{{ montoTexto(informe.monto_maximo) }}</dd></div>
              <div class="rounded-xl bg-vino-50 p-4"><dt class="text-xs text-vino-700">Primera cuota</dt><dd class="mt-1 text-lg font-bold text-vino-900">{{ montoTexto(informe.primera_cuota) }}</dd></div>
              <div class="rounded-xl bg-vino-50 p-4"><dt class="text-xs text-vino-700">Total a pagar</dt><dd class="mt-1 text-lg font-bold text-vino-900">{{ montoTexto(informe.total_a_pagar) }}</dd></div>
              <div class="rounded-xl bg-vino-50 p-4"><dt class="text-xs text-vino-700">Total de intereses</dt><dd class="mt-1 text-lg font-bold text-vino-900">{{ montoTexto(informe.total_intereses) }}</dd></div>
              <div class="rounded-xl bg-vino-50 p-4"><dt class="text-xs text-vino-700">Primer vencimiento</dt><dd class="mt-1 text-lg font-bold text-vino-900">{{ fechaTexto(informe.primer_vencimiento) }}</dd></div>
            </dl>

            @if (informe.aprobable) {
              <div class="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <h3 class="text-lg font-bold text-slate-900">Resumen antes de aprobar</h3>
                <p class="mt-1 text-sm text-slate-600">Verifica las condiciones mostradas y confirma la conformidad del cliente.</p>
                <dl class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div><dt class="text-xs text-slate-500">Monto</dt><dd class="font-semibold text-slate-900">{{ montoTexto(montoSolicitado()) }}</dd></div>
                  <div><dt class="text-xs text-slate-500">Plazo</dt><dd class="font-semibold text-slate-900">{{ plazo() }} meses</dd></div>
                  <div><dt class="text-xs text-slate-500">Cuota</dt><dd class="font-semibold text-slate-900">{{ montoTexto(informe.primera_cuota) }}</dd></div>
                  <div><dt class="text-xs text-slate-500">Total a pagar</dt><dd class="font-semibold text-slate-900">{{ montoTexto(informe.total_a_pagar) }}</dd></div>
                  <div><dt class="text-xs text-slate-500">Primer vencimiento</dt><dd class="font-semibold text-slate-900">{{ fechaTexto(informe.primer_vencimiento) }}</dd></div>
                </dl>
                <label class="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    [checked]="clienteConforme()"
                    (change)="cambiarConformidad($event)"
                    class="mt-0.5 h-5 w-5 rounded border-slate-300 accent-vino-700"
                  />
                  <span>El cliente está conforme con las condiciones y firmará el contrato impreso</span>
                </label>
                <app-aviso [mensaje]="errorAprobacion()" />
                <app-aviso tipo="info" [mensaje]="prestamoCreado() ? 'Préstamo aprobado correctamente.' : null" />
                <button
                  type="button"
                  (click)="aprobar()"
                  [disabled]="aprobando() || !clienteConforme() || prestamoCreado() !== null"
                  class="mt-5 flex items-center gap-2 rounded-xl bg-vino-700 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-vino-700/25 transition hover:bg-vino-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  <app-icono nombre="escudo" class="h-5 w-5" />
                  {{ aprobando() ? 'Aprobando…' : 'Aprobar préstamo' }}
                </button>
                @if (prestamoCreado()) {
                  <p class="mt-2 text-xs text-slate-500">Código del préstamo: {{ prestamoCreado() }}</p>
                }
              </div>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class PrestamoNuevo implements OnInit, OnDestroy {
  private readonly clientes = inject(ClientesService);
  private readonly prestamos = inject(PrestamosService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private temporizador: ReturnType<typeof setTimeout> | undefined;

  protected readonly pasos = [
    { n: 1, texto: 'Cliente' },
    { n: 2, texto: 'Condiciones' },
    { n: 3, texto: 'Informe' },
    { n: 4, texto: 'Aprobación' },
  ];
  protected readonly pasoActual = computed(() => {
    if (this.prestamoCreado()) return 5;
    if (this.evaluacion()?.aprobable) return 4;
    if (this.evaluacion()) return 3;
    return this.clienteSeleccionado() ? 2 : 1;
  });

  async ngOnInit(): Promise<void> {
    // Desde la ficha del cliente llega ?cliente=<id>: se deja elegido
    const id = this.route.snapshot.queryParamMap.get('cliente');
    if (!id) return;
    try {
      this.seleccionarCliente(await this.clientes.obtener(id));
    } catch (error) {
      this.errorBusqueda.set(mensajeDeError(error));
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.temporizador);
  }

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
  /** Número de la última búsqueda: una respuesta vieja no pisa a la nueva. */
  private consultaBusqueda = 0;

  protected cambiarBusqueda(evento: Event): void {
    this.busqueda.set(limpiarCampo(evento, limpiarBusquedaCliente));
    this.busquedaRealizada.set(false);
    this.errorBusqueda.set(null);
    this.resultados.set([]);
    // Sugerencias mientras se escribe (a partir de 3 caracteres, o un DNI completo)
    clearTimeout(this.temporizador);
    if (this.busqueda().trim().length >= 3) {
      this.temporizador = setTimeout(() => void this.buscarCliente(), 350);
    }
  }

  protected readonly bloquearTeclas = bloquearNoEnteros;

  protected cambiarMonto(evento: Event): void {
    this.monto.set(limpiarCampo(evento, limpiarMonto));
    this.evaluacion.set(null);
    this.errorEvaluacion.set(null);
    this.reiniciarAprobacion();
  }

  protected cambiarPlazo(evento: Event): void {
    this.plazo.set(limpiarCampo(evento, (valor) => soloDigitos(valor, 2)));
    this.evaluacion.set(null);
    this.errorEvaluacion.set(null);
    this.reiniciarAprobacion();
  }

  protected async buscarCliente(): Promise<void> {
    clearTimeout(this.temporizador);
    const texto = this.busqueda().trim();
    if (!texto) return;
    const numero = ++this.consultaBusqueda;
    this.buscando.set(true);
    this.errorBusqueda.set(null);
    try {
      const encontrados = await this.clientes.buscar(texto);
      if (numero !== this.consultaBusqueda) return;
      this.resultados.set(encontrados);
      this.busquedaRealizada.set(true);
    } catch (error) {
      if (numero === this.consultaBusqueda) this.errorBusqueda.set(mensajeDeError(error));
    } finally {
      if (numero === this.consultaBusqueda) this.buscando.set(false);
    }
  }

  protected seleccionarCliente(cliente: Cliente): void {
    this.clienteSeleccionado.set(cliente);
    this.resultados.set([]);
    this.busqueda.set('');
    this.busquedaRealizada.set(false);
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
    let id: string | null = null;
    try {
      id = await this.prestamos.aprobar({
        p_cliente: cliente.id,
        p_monto: monto,
        p_plazo: plazo,
        p_cliente_conforme: true,
      });
      // Con el préstamo creado el botón queda bloqueado: no se puede aprobar dos veces
      this.prestamoCreado.set(id);
    } catch (error) {
      this.errorAprobacion.set(mensajeDeError(error));
    } finally {
      this.aprobando.set(false);
    }
    // Solo si la aprobación salió bien: al detalle, desde donde se imprime el contrato
    if (id) await this.router.navigate(['/prestamos'], { queryParams: { id } });
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
