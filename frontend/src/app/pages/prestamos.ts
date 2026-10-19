import { Component, HostListener, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Aviso } from '../components/aviso';
import { ContratoPrestamo } from '../components/contrato-prestamo';
import { Icono } from '../components/icono';
import {
  Cliente,
  Cuota,
  EstadoPrestamo,
  PrestamoDetalle,
  PrestamoListado,
  Sede,
} from '../core/contrato';
import { formatearFecha, formatearMonto } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
import { limpiarCampo, limpiarNombre, soloDigitos } from '../core/validaciones';
import { ClientesService } from '../services/clientes.service';
import { PrestamosService } from '../services/prestamos.service';

type FiltroEstado = '' | EstadoPrestamo;

/** Máximo de préstamos que trae el listado (el resto se alcanza con los filtros). */
const LIMITE_LISTADO = 200;

/** Búsqueda de cliente: si empieza con un dígito es un DNI (solo dígitos, 8); si no, un nombre (solo letras). */
const limpiarBusquedaCliente = (valor: string): string =>
  /^\s*\d/.test(valor) ? soloDigitos(valor, 8) : limpiarNombre(valor, 60);

/** HU-10: listado filtrable de préstamos; el detalle con cronograma (HU-08) y el contrato (HU-09) se abren en una ventana. */
@Component({
  selector: 'app-pagina-prestamos',
  imports: [Aviso, RouterLink, ContratoPrestamo, Icono],
  template: `
    <div class="space-y-5">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-widest text-vino-700">Préstamos</p>
          <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-900">Listado de préstamos</h1>
          <p class="mt-1 text-slate-500">Préstamos de todas las sedes. Abre uno para ver su cronograma e imprimir el contrato.</p>
        </div>
        <a
          routerLink="/prestamos/nuevo"
          class="flex items-center gap-2 rounded-xl bg-vino-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-vino-700/25 transition hover:bg-vino-800"
        >
          <app-icono nombre="mas" class="h-5 w-5" /> Nuevo préstamo
        </a>
      </header>

      <app-aviso [mensaje]="error()" />

      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(16rem,1fr)]">
        <!-- ── Filtros (un cuarto, a la derecha) ── -->
        <aside class="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1" aria-label="Filtros">
          <div class="flex items-center justify-between">
            <h2 class="flex items-center gap-2 font-semibold text-slate-900">
              <app-icono nombre="demo" class="h-5 w-5 text-vino-700" /> Filtros
            </h2>
            <button type="button" (click)="limpiarFiltros()" class="text-sm font-medium text-vino-700 hover:text-vino-900">Limpiar</button>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="inp-filtro-cliente">Cliente</label>
            @if (clienteFiltro(); as cliente) {
              <div class="animar-aparece mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-vino-200 bg-vino-50/60 px-3 py-2.5 text-sm">
                <span class="min-w-0">
                  <strong class="block truncate text-slate-900">{{ cliente.nombres }} {{ cliente.apellidos }}</strong>
                  <span class="text-xs text-slate-500">DNI {{ cliente.dni }}</span>
                </span>
                <button type="button" (click)="quitarCliente()" aria-label="Quitar cliente" class="text-slate-400 transition hover:text-vino-700">
                  <app-icono nombre="cerrar" class="h-5 w-5" />
                </button>
              </div>
            } @else {
              <div class="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 transition focus-within:border-vino-500 focus-within:ring-4 focus-within:ring-vino-100">
                <app-icono nombre="buscar" class="h-4 w-4 text-slate-400" />
                <input
                  id="inp-filtro-cliente"
                  type="search"
                  maxlength="60"
                  autocomplete="off"
                  [value]="busquedaCliente()"
                  (input)="cambiarBusquedaCliente($event)"
                  (keydown.enter)="buscarClientes()"
                  placeholder="DNI o nombre"
                  class="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400"
                />
                <button type="button" (click)="buscarClientes()" [disabled]="buscandoCliente() || !busquedaCliente().trim()" class="text-xs font-semibold text-vino-700 disabled:text-slate-300">
                  {{ buscandoCliente() ? '…' : 'Buscar' }}
                </button>
              </div>
              <p class="mt-1 text-xs text-slate-400">DNI: 8 dígitos. Nombre: solo letras.</p>
              @if (resultadosClientes().length > 0) {
                <ul class="animar-aparece mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm scroll-fino">
                  @for (cliente of resultadosClientes(); track cliente.id) {
                    <li>
                      <button type="button" (click)="seleccionarCliente(cliente)" class="block w-full px-3 py-2 text-left text-sm transition hover:bg-vino-50/60">
                        <span class="block truncate font-medium text-slate-900">{{ cliente.nombres }} {{ cliente.apellidos }}</span>
                        <span class="text-xs text-slate-500">DNI {{ cliente.dni }}</span>
                      </button>
                    </li>
                  }
                </ul>
              }
              @if (clientesSinResultados()) {
                <p class="mt-2 text-sm text-slate-600">No se encontraron clientes con ese DNI o nombre.</p>
              }
            }
          </div>

          <div>
            <span class="block text-sm font-medium text-slate-700">Estado del préstamo</span>
            <div class="mt-1.5 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Estado">
              @for (e of estados; track e.valor) {
                <button
                  type="button"
                  (click)="fijarEstado(e.valor)"
                  [attr.aria-pressed]="estadoFiltro() === e.valor"
                  class="rounded-lg px-2 py-1.5 text-xs font-semibold transition"
                  [class]="estadoFiltro() === e.valor ? 'bg-vino-700 text-white shadow' : 'text-slate-600 hover:bg-white'"
                >
                  {{ e.texto }}
                </button>
              }
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="sel-filtro-sede">Sede</label>
            <select
              id="sel-filtro-sede"
              [value]="sedeFiltro() ?? ''"
              (change)="cambiarSede($event)"
              class="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-vino-500 focus:ring-4 focus:ring-vino-100"
            >
              <option value="">Todas las sedes</option>
              @for (sede of sedes(); track sede.id) {
                <option [value]="sede.id">{{ sede.nombre }}</option>
              }
            </select>
          </div>
        </aside>

        <!-- ── Tabla (tres cuartos, se actualiza con los filtros) ── -->
        <section class="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-start-1 lg:row-start-1">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
            <h2 class="flex items-center gap-2 font-semibold text-slate-900">
              <app-icono nombre="prestamos" class="h-5 w-5 text-vino-700" /> Préstamos
            </h2>
            @if (!cargando()) {
              <p class="text-sm text-slate-500">
                {{ prestamos().length }} resultado(s)
                @if (prestamos().length >= limite) {
                  · se muestran los {{ limite }} más recientes
                }
              </p>
            } @else {
              <p class="text-sm text-slate-400">Actualizando…</p>
            }
          </div>

          @if (cargando() && prestamos().length === 0) {
            <p class="px-6 py-16 text-center text-sm text-slate-400">Cargando préstamos…</p>
          } @else if (prestamos().length === 0) {
            <div class="px-6 py-16 text-center">
              <app-icono nombre="buscar" class="mx-auto h-10 w-10 text-slate-300" />
              <p class="mt-3 font-medium text-slate-700">No hay préstamos que coincidan con los filtros.</p>
              <p class="mt-1 text-sm text-slate-500">Cambia o limpia los filtros para ver más resultados.</p>
            </div>
          } @else {
            <div class="max-h-[calc(100vh-15rem)] min-h-64 overflow-auto scroll-fino" [class.opacity-60]="cargando()">
              <table class="min-w-full text-sm">
                <thead class="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_var(--color-slate-200)]">
                  <tr>
                    <th scope="col" class="px-5 py-3 font-medium">Cliente</th>
                    <th scope="col" class="px-3 py-3 font-medium">Sede</th>
                    <th scope="col" class="px-3 py-3 text-right font-medium">Monto</th>
                    <th scope="col" class="px-3 py-3 font-medium">Plazo</th>
                    <th scope="col" class="px-3 py-3 font-medium">Fecha</th>
                    <th scope="col" class="px-3 py-3 font-medium">Estado</th>
                    <th scope="col" class="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (prestamo of prestamos(); track prestamo.id) {
                    <tr class="transition hover:bg-vino-50/40">
                      <td class="px-5 py-2.5">
                        <p class="font-medium text-slate-900">{{ prestamo.clientes.nombres }} {{ prestamo.clientes.apellidos }}</p>
                        <p class="text-xs text-slate-500">DNI {{ prestamo.clientes.dni }}</p>
                      </td>
                      <td class="whitespace-nowrap px-3 py-2.5 text-slate-700">{{ prestamo.sedes?.nombre ?? '—' }}</td>
                      <td class="whitespace-nowrap px-3 py-2.5 text-right font-medium text-slate-900">{{ monto(prestamo.monto) }}</td>
                      <td class="whitespace-nowrap px-3 py-2.5 text-slate-700">{{ prestamo.plazo_meses }} {{ prestamo.plazo_meses === 1 ? 'mes' : 'meses' }}</td>
                      <td class="whitespace-nowrap px-3 py-2.5 text-slate-700">{{ fecha(prestamo.fecha_desembolso) }}</td>
                      <td class="whitespace-nowrap px-3 py-2.5"><span class="rounded-full px-2.5 py-1 text-xs font-semibold" [class]="estadoClase(prestamo.estado)">{{ estado(prestamo.estado) }}</span></td>
                      <td class="whitespace-nowrap px-5 py-2.5 text-right">
                        <a [routerLink]="['/prestamos']" [queryParams]="{ id: prestamo.id }" class="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-vino-300 hover:bg-vino-50 hover:text-vino-800">
                          <app-icono nombre="ojo" class="h-4 w-4" /> Ver
                        </a>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      </div>

      <!-- ── Detalle del préstamo (ventana) ── -->
      @if (detalle(); as prestamo) {
        <div class="visor-overlay animar-aparece fixed inset-0 z-50 flex items-center justify-center bg-vino-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Detalle del préstamo">
          <button type="button" tabindex="-1" aria-label="Cerrar detalle" (click)="cerrarDetalle()" class="no-imprimir absolute inset-0 h-full w-full cursor-default"></button>
          <div class="visor-contrato relative flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div class="no-imprimir flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div class="min-w-0">
                <p class="text-xs font-semibold uppercase tracking-widest text-vino-700">Detalle del préstamo</p>
                <h2 class="truncate text-xl font-bold text-slate-900">{{ prestamo.clientes.nombres }} {{ prestamo.clientes.apellidos }}</h2>
                <p class="text-sm text-slate-500">DNI {{ prestamo.clientes.dni }}</p>
              </div>
              <button type="button" (click)="cerrarDetalle()" aria-label="Cerrar detalle" class="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-vino-50 hover:text-vino-800">
                <app-icono nombre="cerrar" class="h-6 w-6" />
              </button>
            </div>

            <div class="visor-cuerpo space-y-5 overflow-y-auto p-6 scroll-fino">
              <dl class="no-imprimir grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div class="rounded-xl bg-slate-50 p-4"><dt class="text-xs text-slate-500">Fecha</dt><dd class="mt-1 font-semibold text-slate-900">{{ fecha(prestamo.fecha_desembolso) }}</dd></div>
                <div class="rounded-xl bg-slate-50 p-4"><dt class="text-xs text-slate-500">Monto</dt><dd class="mt-1 font-semibold text-slate-900">{{ monto(prestamo.monto) }}</dd></div>
                <div class="rounded-xl bg-slate-50 p-4"><dt class="text-xs text-slate-500">Plazo</dt><dd class="mt-1 font-semibold text-slate-900">{{ prestamo.plazo_meses }} meses</dd></div>
                <div class="rounded-xl bg-slate-50 p-4"><dt class="text-xs text-slate-500">Tasa (TEA)</dt><dd class="mt-1 font-semibold text-slate-900">{{ porcentaje(prestamo.tea) }}</dd></div>
                <div class="rounded-xl bg-slate-50 p-4"><dt class="text-xs text-slate-500">Estado</dt><dd class="mt-1 font-semibold text-slate-900">{{ estado(prestamo.estado) }}</dd></div>
              </dl>

              <div class="no-imprimir overflow-x-auto rounded-xl border border-slate-200 scroll-fino">
                <table class="min-w-full text-sm">
                  <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th class="px-4 py-3 font-medium">N°</th><th class="px-4 py-3 font-medium">Vencimiento</th><th class="px-4 py-3 text-right font-medium">Cuota</th><th class="px-4 py-3 text-right font-medium">Capital</th><th class="px-4 py-3 text-right font-medium">Interés</th><th class="px-4 py-3 text-right font-medium">Saldo</th><th class="px-4 py-3 font-medium">Estado</th></tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (cuota of cuotasOrdenadas(prestamo.cuotas); track cuota.id) {
                      <tr [class]="cuota.estado === 'VENCIDA' ? 'bg-red-50' : 'bg-white'">
                        <td class="px-4 py-2.5 font-medium">{{ cuota.numero }}</td>
                        <td class="whitespace-nowrap px-4 py-2.5">{{ fecha(cuota.fecha_vencimiento) }}</td>
                        <td class="px-4 py-2.5 text-right">{{ monto(cuota.cuota) }}</td>
                        <td class="px-4 py-2.5 text-right">{{ monto(cuota.capital) }}</td>
                        <td class="px-4 py-2.5 text-right">{{ monto(cuota.interes) }}</td>
                        <td class="px-4 py-2.5 text-right">{{ monto(cuota.saldo) }}</td>
                        <td class="px-4 py-2.5"><span class="rounded-full px-2.5 py-1 text-xs font-semibold" [class]="estadoCuotaClase(cuota)">{{ estadoCuota(cuota.estado) }}</span></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <div class="no-imprimir flex flex-wrap items-center justify-between gap-3">
                <p class="text-xs text-slate-500">Cada cuota paga interés sobre el saldo pendiente: la TEA de 30% es anual, no un recargo sobre el monto.</p>
                <button
                  type="button"
                  (click)="alternarContrato()"
                  class="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition"
                  [class]="verContrato() ? 'border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-vino-700 text-white shadow-lg shadow-vino-700/25 hover:bg-vino-800'"
                >
                  <app-icono nombre="imprimir" class="h-5 w-5" />
                  {{ verContrato() ? 'Ocultar contrato' : 'Imprimir contrato' }}
                </button>
              </div>

              @if (verContrato()) {
                <div id="vista-contrato" class="animar-aparece">
                  <app-contrato-prestamo [prestamoId]="prestamo.id" />
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class Prestamos implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clientesService = inject(ClientesService);
  private readonly prestamosService = inject(PrestamosService);

  protected readonly prestamos = signal<PrestamoListado[]>([]);
  protected readonly sedes = signal<Sede[]>([]);
  protected readonly detalle = signal<PrestamoDetalle | null>(null);
  protected readonly resultadosClientes = signal<Cliente[]>([]);
  protected readonly clienteFiltro = signal<Cliente | null>(null);
  protected readonly busquedaCliente = signal('');
  protected readonly estadoFiltro = signal<FiltroEstado>('');
  protected readonly sedeFiltro = signal<number | null>(null);
  protected readonly verContrato = signal(false);
  protected readonly estados: { valor: FiltroEstado; texto: string }[] = [
    { valor: '', texto: 'Todos' },
    { valor: 'VIGENTE', texto: 'Vigentes' },
    { valor: 'CANCELADO', texto: 'Cancelados' },
  ];
  protected readonly cargando = signal(false);
  protected readonly buscandoCliente = signal(false);
  protected readonly clientesSinResultados = signal(false);
  protected readonly limite = LIMITE_LISTADO;
  /** Número de la última consulta del listado: una respuesta vieja no pisa a la nueva. */
  private consulta = 0;
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      void this.cargarDetalle(params.get('id'));
    });
    void this.inicializar();
  }

  private async inicializar(): Promise<void> {
    try {
      this.sedes.set(await this.prestamosService.listarSedes());
      await this.cargarPrestamos();
    } catch (error) {
      this.error.set(mensajeDeError(error));
    }
  }

  protected async cargarPrestamos(): Promise<void> {
    const numero = ++this.consulta;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const filas = await this.prestamosService.listar(
        {
          estado: this.estadoFiltro() || undefined,
          sedeId: this.sedeFiltro() ?? undefined,
          clienteId: this.clienteFiltro()?.id,
        },
        LIMITE_LISTADO,
      );
      if (numero === this.consulta) this.prestamos.set(filas);
    } catch (error) {
      if (numero !== this.consulta) return;
      this.prestamos.set([]);
      this.error.set(mensajeDeError(error));
    } finally {
      if (numero === this.consulta) this.cargando.set(false);
    }
  }

  private async cargarDetalle(id: string | null): Promise<void> {
    this.verContrato.set(false);
    if (!id) {
      this.detalle.set(null);
      return;
    }
    try {
      this.detalle.set(await this.prestamosService.obtener(id));
    } catch (error) {
      this.error.set(mensajeDeError(error));
    }
  }

  protected cambiarBusquedaCliente(evento: Event): void {
    this.busquedaCliente.set(limpiarCampo(evento, limpiarBusquedaCliente));
    this.resultadosClientes.set([]);
    this.clientesSinResultados.set(false);
  }

  protected async buscarClientes(): Promise<void> {
    const texto = this.busquedaCliente().trim();
    if (!texto || this.buscandoCliente()) return;
    this.buscandoCliente.set(true);
    this.error.set(null);
    this.clientesSinResultados.set(false);
    try {
      const encontrados = await this.clientesService.buscar(texto);
      this.resultadosClientes.set(encontrados);
      this.clientesSinResultados.set(encontrados.length === 0);
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.buscandoCliente.set(false);
    }
  }

  protected seleccionarCliente(cliente: Cliente): void {
    this.clienteFiltro.set(cliente);
    this.resultadosClientes.set([]);
    this.busquedaCliente.set('');
    void this.cargarPrestamos();
  }

  protected quitarCliente(): void {
    this.clienteFiltro.set(null);
    void this.cargarPrestamos();
  }

  protected fijarEstado(valor: FiltroEstado): void {
    this.estadoFiltro.set(valor);
    void this.cargarPrestamos();
  }

  protected cerrarDetalle(): void {
    void this.router.navigate(['/prestamos'], { queryParams: {} });
  }

  @HostListener('document:keydown.escape')
  protected alPulsarEscape(): void {
    if (this.detalle()) this.cerrarDetalle();
  }

  /** La vista previa del contrato solo se carga y se muestra al pedir imprimirlo. */
  protected alternarContrato(): void {
    this.verContrato.update((visible) => !visible);
    if (this.verContrato()) {
      setTimeout(() => document.getElementById('vista-contrato')?.scrollIntoView({ behavior: 'smooth' }), 120);
    }
  }

  protected cambiarEstado(evento: Event): void {
    this.estadoFiltro.set((evento.target as HTMLSelectElement).value as FiltroEstado);
    void this.cargarPrestamos();
  }

  protected cambiarSede(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.sedeFiltro.set(valor ? Number(valor) : null);
    void this.cargarPrestamos();
  }

  protected limpiarFiltros(): void {
    this.busquedaCliente.set('');
    this.resultadosClientes.set([]);
    this.clientesSinResultados.set(false);
    this.clienteFiltro.set(null);
    this.estadoFiltro.set('');
    this.sedeFiltro.set(null);
    void this.cargarPrestamos();
  }

  protected monto(valor: number): string {
    return formatearMonto(valor);
  }

  protected fecha(valor: string): string {
    return formatearFecha(valor);
  }

  protected porcentaje(valor: number): string {
    return `${(Number(valor) * 100).toFixed(2)}%`;
  }

  protected estado(estado: EstadoPrestamo): string {
    return estado === 'VIGENTE' ? 'Vigente' : 'Cancelado';
  }

  protected estadoClase(estado: EstadoPrestamo): string {
    return estado === 'VIGENTE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700';
  }

  protected cuotasOrdenadas(cuotas: Cuota[]): Cuota[] {
    return [...cuotas].sort((a, b) => a.numero - b.numero);
  }

  protected estadoCuota(estado: Cuota['estado']): string {
    return { PENDIENTE: 'Pendiente', PAGADA: 'Pagada', VENCIDA: 'Vencida' }[estado];
  }

  protected estadoCuotaClase(cuota: Cuota): string {
    return {
      PENDIENTE: 'bg-slate-100 text-slate-700',
      PAGADA: 'bg-emerald-100 text-emerald-800',
      VENCIDA: 'bg-red-100 text-red-800',
    }[cuota.estado];
  }
}
