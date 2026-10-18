import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Aviso } from '../components/aviso';
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
import { ClientesService } from '../services/clientes.service';
import { PrestamosService } from '../services/prestamos.service';

type FiltroEstado = '' | EstadoPrestamo;

/** HU-10: listado filtrable de préstamos y detalle con cronograma (HU-08). */
@Component({
  selector: 'app-pagina-prestamos',
  imports: [Aviso, RouterLink],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900">Préstamos</h1>
        <p class="mt-1 text-sm text-slate-600">Consulta préstamos de todas las sedes y revisa su cronograma.</p>
      </div>

      <app-aviso [mensaje]="error()" />

      <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold text-slate-900">Filtros</h2>
          <button type="button" (click)="limpiarFiltros()" class="text-sm text-sky-700 underline hover:no-underline">Limpiar filtros</button>
        </div>

        <div class="mt-4 grid gap-4 md:grid-cols-4 md:items-end">
          <label class="block md:col-span-2">
            <span class="text-sm font-medium text-slate-700">Cliente (DNI o nombre)</span>
            <div class="mt-1 flex gap-2">
              <input type="search" [value]="busquedaCliente()" (input)="cambiarBusquedaCliente($event)" (keydown.enter)="buscarClientes()" placeholder="Ej. 70000001" class="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200" />
              <button type="button" (click)="buscarClientes()" [disabled]="buscandoCliente() || !busquedaCliente().trim()" class="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Buscar</button>
            </div>
          </label>
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Estado</span>
            <select [value]="estadoFiltro()" (change)="cambiarEstado($event)" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200">
              <option value="">Todos</option>
              <option value="VIGENTE">Vigente</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </label>
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Sede</span>
            <select [value]="sedeFiltro() ?? ''" (change)="cambiarSede($event)" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200">
              <option value="">Todas las sedes</option>
              @for (sede of sedes(); track sede.id) {
                <option [value]="sede.id">{{ sede.nombre }}</option>
              }
            </select>
          </label>
        </div>

        @if (resultadosClientes().length > 0) {
          <div class="mt-3 divide-y divide-slate-200 rounded-md border border-slate-200 md:w-1/2">
            @for (cliente of resultadosClientes(); track cliente.id) {
              <button type="button" (click)="seleccionarCliente(cliente)" class="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                <span class="font-medium text-slate-900">{{ cliente.nombres }} {{ cliente.apellidos }}</span>
                <span class="ml-2 text-slate-500">DNI {{ cliente.dni }}</span>
              </button>
            }
          </div>
        }

        @if (clienteFiltro(); as cliente) {
          <div class="mt-3 flex items-center justify-between rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm md:w-1/2">
            <span><strong>{{ cliente.nombres }} {{ cliente.apellidos }}</strong> · DNI {{ cliente.dni }}</span>
            <button type="button" (click)="quitarCliente()" class="text-sky-800 underline hover:no-underline">Quitar</button>
          </div>
        }

        <button type="button" (click)="cargarPrestamos()" [disabled]="cargando()" class="mt-4 rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50">
          {{ cargando() ? 'Cargando...' : 'Aplicar filtros' }}
        </button>
      </section>

      <section class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 class="font-semibold text-slate-900">Listado de préstamos</h2>
            <p class="mt-1 text-sm text-slate-600">{{ prestamos().length }} resultado(s)</p>
          </div>
        </div>

        @if (cargando()) {
          <p class="p-5 text-sm text-slate-600">Cargando préstamos...</p>
        } @else if (prestamos().length === 0) {
          <p class="p-5 text-sm text-slate-600">No hay préstamos que coincidan con los filtros.</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-200 text-sm">
              <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" class="px-5 py-3 font-medium">Cliente</th>
                  <th scope="col" class="px-5 py-3 font-medium">Sede</th>
                  <th scope="col" class="px-5 py-3 text-right font-medium">Monto</th>
                  <th scope="col" class="px-5 py-3 font-medium">Plazo</th>
                  <th scope="col" class="px-5 py-3 font-medium">Fecha</th>
                  <th scope="col" class="px-5 py-3 font-medium">Estado</th>
                  <th scope="col" class="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (prestamo of prestamos(); track prestamo.id) {
                  <tr>
                    <td class="px-5 py-3">
                      <p class="font-medium text-slate-900">{{ prestamo.clientes.nombres }} {{ prestamo.clientes.apellidos }}</p>
                      <p class="text-xs text-slate-500">DNI {{ prestamo.clientes.dni }}</p>
                    </td>
                    <td class="whitespace-nowrap px-5 py-3 text-slate-700">{{ prestamo.sedes?.nombre ?? '—' }}</td>
                    <td class="whitespace-nowrap px-5 py-3 text-right text-slate-900">{{ monto(prestamo.monto) }}</td>
                    <td class="whitespace-nowrap px-5 py-3 text-slate-700">{{ prestamo.plazo_meses }} meses</td>
                    <td class="whitespace-nowrap px-5 py-3 text-slate-700">{{ fecha(prestamo.fecha_desembolso) }}</td>
                    <td class="whitespace-nowrap px-5 py-3"><span class="rounded-full px-2.5 py-1 text-xs font-semibold" [class]="estadoClase(prestamo.estado)">{{ estado(prestamo.estado) }}</span></td>
                    <td class="whitespace-nowrap px-5 py-3 text-right"><a [routerLink]="['/prestamos']" [queryParams]="{ id: prestamo.id }" class="font-medium text-sky-700 hover:text-sky-900">Ver detalle</a></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      @if (detalle(); as prestamo) {
        <section class="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-sm text-slate-500">Detalle del préstamo</p>
              <h2 class="text-xl font-semibold text-slate-900">{{ prestamo.clientes.nombres }} {{ prestamo.clientes.apellidos }}</h2>
              <p class="mt-1 text-sm text-slate-600">DNI {{ prestamo.clientes.dni }}</p>
            </div>
            <a routerLink="/prestamos" class="text-sm text-sky-700 underline hover:no-underline">Cerrar detalle</a>
          </div>
          <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div class="rounded-md bg-slate-50 p-3"><dt class="text-xs text-slate-500">Fecha</dt><dd class="mt-1 font-medium text-slate-900">{{ fecha(prestamo.fecha_desembolso) }}</dd></div>
            <div class="rounded-md bg-slate-50 p-3"><dt class="text-xs text-slate-500">Monto</dt><dd class="mt-1 font-medium text-slate-900">{{ monto(prestamo.monto) }}</dd></div>
            <div class="rounded-md bg-slate-50 p-3"><dt class="text-xs text-slate-500">Plazo</dt><dd class="mt-1 font-medium text-slate-900">{{ prestamo.plazo_meses }} meses</dd></div>
            <div class="rounded-md bg-slate-50 p-3"><dt class="text-xs text-slate-500">Tasa</dt><dd class="mt-1 font-medium text-slate-900">{{ porcentaje(prestamo.tea) }}</dd></div>
            <div class="rounded-md bg-slate-50 p-3"><dt class="text-xs text-slate-500">Estado</dt><dd class="mt-1 font-medium text-slate-900">{{ estado(prestamo.estado) }}</dd></div>
          </dl>
          <div class="overflow-x-auto rounded-md border border-slate-200">
            <table class="min-w-full divide-y divide-slate-200 text-sm">
              <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-4 py-3">N°</th><th class="px-4 py-3">Vencimiento</th><th class="px-4 py-3 text-right">Cuota</th><th class="px-4 py-3 text-right">Capital</th><th class="px-4 py-3 text-right">Interés</th><th class="px-4 py-3 text-right">Saldo</th><th class="px-4 py-3">Estado</th></tr></thead>
              <tbody class="divide-y divide-slate-100">
                @for (cuota of cuotasOrdenadas(prestamo.cuotas); track cuota.id) {
                  <tr [class]="cuota.estado === 'VENCIDA' ? 'bg-red-50' : 'bg-white'"><td class="px-4 py-3 font-medium">{{ cuota.numero }}</td><td class="px-4 py-3 whitespace-nowrap">{{ fecha(cuota.fecha_vencimiento) }}</td><td class="px-4 py-3 text-right whitespace-nowrap">{{ monto(cuota.cuota) }}</td><td class="px-4 py-3 text-right whitespace-nowrap">{{ monto(cuota.capital) }}</td><td class="px-4 py-3 text-right whitespace-nowrap">{{ monto(cuota.interes) }}</td><td class="px-4 py-3 text-right whitespace-nowrap">{{ monto(cuota.saldo) }}</td><td class="px-4 py-3 whitespace-nowrap"><span class="rounded-full px-2.5 py-1 text-xs font-semibold" [class]="estadoCuotaClase(cuota)">{{ estadoCuota(cuota.estado) }}</span></td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
})
export class Prestamos implements OnInit {
  private readonly route = inject(ActivatedRoute);
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
  protected readonly cargando = signal(false);
  protected readonly buscandoCliente = signal(false);
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
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.prestamos.set(await this.prestamosService.listar({
        estado: this.estadoFiltro() || undefined,
        sedeId: this.sedeFiltro() ?? undefined,
        clienteId: this.clienteFiltro()?.id,
      }));
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarDetalle(id: string | null): Promise<void> {
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
    this.busquedaCliente.set((evento.target as HTMLInputElement).value);
    this.resultadosClientes.set([]);
  }

  protected async buscarClientes(): Promise<void> {
    const texto = this.busquedaCliente().trim();
    if (!texto || this.buscandoCliente()) return;
    this.buscandoCliente.set(true);
    this.error.set(null);
    try {
      this.resultadosClientes.set(await this.clientesService.buscar(texto));
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.buscandoCliente.set(false);
    }
  }

  protected seleccionarCliente(cliente: Cliente): void {
    this.clienteFiltro.set(cliente);
    this.resultadosClientes.set([]);
    void this.cargarPrestamos();
  }

  protected quitarCliente(): void {
    this.clienteFiltro.set(null);
  }

  protected cambiarEstado(evento: Event): void {
    this.estadoFiltro.set((evento.target as HTMLSelectElement).value as FiltroEstado);
  }

  protected cambiarSede(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.sedeFiltro.set(valor ? Number(valor) : null);
  }

  protected limpiarFiltros(): void {
    this.busquedaCliente.set('');
    this.resultadosClientes.set([]);
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
