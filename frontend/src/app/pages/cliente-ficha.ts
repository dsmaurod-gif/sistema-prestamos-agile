import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Aviso } from '../components/aviso';
import { Icono } from '../components/icono';
import { Cliente, DeudaCliente, EstadoCliente, PrestamoConCuotas } from '../core/contrato';
import { FechaPipe, formatearFecha, formatearMonto, MontoPipe } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
import { ClientesService } from '../services/clientes.service';
import { PrestamosService } from '../services/prestamos.service';

// HU-05 Buscar y consultar cliente · HU-23 Mora por día de atraso.

const ESTADO_BADGE: Record<EstadoCliente, string> = {
  AL_DIA: 'bg-emerald-100 text-emerald-800',
  MOROSO: 'bg-amber-100 text-amber-800',
  EXTRAJUDICIAL: 'bg-red-100 text-red-800',
};

const ESTADO_TEXTO: Record<EstadoCliente, string> = {
  AL_DIA: 'Al día',
  MOROSO: 'Moroso',
  EXTRAJUDICIAL: 'Extrajudicial',
};

const CUOTA_ESTADO_ESTILO: Record<string, string> = {
  PENDIENTE: 'text-slate-600',
  PAGADA: 'text-emerald-700',
  VENCIDA: 'text-red-700 font-semibold',
};

@Component({
  selector: 'app-pagina-cliente-ficha',
  imports: [RouterLink, Aviso, Icono, MontoPipe, FechaPipe],
  template: `
    <div class="space-y-6">
      <!-- Migas -->
      <nav class="flex items-center gap-2 text-sm text-slate-500" aria-label="Ruta">
        <a routerLink="/clientes" id="link-volver-clientes" class="flex items-center gap-1.5 font-medium text-vino-700 hover:text-vino-900">
          <app-icono nombre="flechaIzq" class="h-4 w-4" /> Clientes
        </a>
        @if (cliente()) {
          <span class="text-slate-300">/</span>
          <span class="text-slate-900">Ficha del cliente</span>
        }
      </nav>

      <app-aviso [mensaje]="error()" />

      @if (cargando() && !cliente()) {
        <div class="py-20 text-center text-slate-400">Cargando ficha…</div>
      }

      @if (cliente(); as c) {
        <!-- ── Encabezado ── -->
        <section class="animar-aparece rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-5">
            <div class="flex min-w-0 items-center gap-4">
              <span class="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-vino-100 text-xl font-bold text-vino-800" aria-hidden="true">
                {{ iniciales(c) }}
              </span>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2.5">
                  <h1 id="nombre-cliente" class="text-2xl font-bold tracking-tight text-slate-900">
                    {{ c.apellidos }}, {{ c.nombres }}
                  </h1>
                  <span class="rounded-full px-3 py-1 text-xs font-semibold" [class]="estadoBadge(c.estado)">
                    {{ estadoTexto(c.estado) }}
                  </span>
                  @if (c.nombre_verificado) {
                    <span class="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      <app-icono nombre="ok" class="h-3.5 w-3.5" /> Verificado
                    </span>
                  } @else {
                    <span class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">No verificado</span>
                  }
                </div>
                <p class="mt-1 text-sm text-slate-600">DNI <strong class="font-mono text-slate-900">{{ c.dni }}</strong></p>
              </div>
            </div>
            <a
              id="btn-nuevo-prestamo"
              [routerLink]="['/prestamos/nuevo']"
              [queryParams]="{ cliente: c.id }"
              class="flex items-center gap-2 rounded-xl bg-vino-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-vino-700/25 transition hover:bg-vino-800"
            >
              <app-icono nombre="mas" class="h-5 w-5" /> Nuevo préstamo
            </a>
          </div>
        </section>

        <!-- Alerta de estado (HU-05 CA3) -->
        @if (c.estado !== 'AL_DIA') {
          <div
            class="animar-aparece flex items-start gap-3 rounded-xl border px-5 py-4 text-sm"
            [class]="c.estado === 'MOROSO' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-red-300 bg-red-50 text-red-900'"
            role="alert"
          >
            <app-icono nombre="alerta" class="mt-0.5 h-5 w-5" />
            <div>
              <p class="font-semibold">
                {{ c.estado === 'MOROSO' ? 'Cliente moroso' : 'Cliente en cobranza extrajudicial' }}: no se otorgan nuevos préstamos.
              </p>
              <p class="mt-0.5">
                @if (c.fecha_moroso) { Moroso desde <strong>{{ c.fecha_moroso | fecha }}</strong>. }
                @if (c.fecha_extrajudicial) { Extrajudicial desde <strong>{{ c.fecha_extrajudicial | fecha }}</strong>. }
              </p>
            </div>
          </div>
        }

        <!-- ── Indicadores ── -->
        <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores del cliente">
          <article class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-vino-100 text-vino-700"><app-icono nombre="monedas" class="h-6 w-6" /></span>
            <div>
              <p class="text-sm text-slate-500">Capital vigente</p>
              <p id="capital-vigente" class="text-2xl font-bold text-slate-900">{{ capitalVigente() !== null ? (capitalVigente()! | monto) : '—' }}</p>
              <p class="text-xs text-slate-400">Tope global: {{ tope | monto }}</p>
            </div>
          </article>
          <article class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><app-icono nombre="ok" class="h-6 w-6" /></span>
            <div>
              <p class="text-sm text-slate-500">Cupo disponible</p>
              <p class="text-2xl font-bold" [class]="disponible() > 0 ? 'text-emerald-700' : 'text-red-600'">{{ capitalVigente() !== null ? (disponible() | monto) : '—' }}</p>
              <p class="text-xs text-slate-400">Todas las sedes</p>
            </div>
          </article>
          <article class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-700"><app-icono nombre="documento" class="h-6 w-6" /></span>
            <div>
              <p class="text-sm text-slate-500">Préstamos vigentes</p>
              <p class="text-2xl font-bold text-slate-900">{{ vigentes() }}</p>
              <p class="text-xs text-slate-400">{{ prestamos().length }} en total</p>
            </div>
          </article>
          <article class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span class="grid h-12 w-12 shrink-0 place-items-center rounded-xl" [class]="c.estado === 'AL_DIA' ? 'bg-emerald-100 text-emerald-700' : c.estado === 'MOROSO' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'">
              <app-icono [nombre]="c.estado === 'AL_DIA' ? 'ok' : 'alerta'" class="h-6 w-6" />
            </span>
            <div>
              <p class="text-sm text-slate-500">Estado del cliente</p>
              <p class="text-2xl font-bold text-slate-900">{{ estadoTexto(c.estado) }}</p>
              <p class="text-xs text-slate-400">Se recalcula al consultar</p>
            </div>
          </article>
        </section>

        <div class="grid gap-6 lg:grid-cols-5">
          <!-- ── Datos del cliente ── -->
          <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div class="flex items-center gap-3">
              <app-icono nombre="persona" class="h-5 w-5 text-vino-700" />
              <h2 class="font-semibold text-slate-900">Datos del cliente</h2>
            </div>
            <dl class="mt-5 divide-y divide-slate-100 text-sm">
              <div class="flex justify-between gap-4 py-2.5"><dt class="text-slate-500">Nombre completo</dt><dd class="text-right font-medium text-slate-900">{{ c.nombres }} {{ c.apellidos }}</dd></div>
              <div class="flex justify-between gap-4 py-2.5"><dt class="text-slate-500">DNI</dt><dd class="font-mono font-medium text-slate-900">{{ c.dni }}</dd></div>
              <div class="flex justify-between gap-4 py-2.5"><dt class="text-slate-500">Teléfono</dt><dd class="font-medium text-slate-900">{{ c.telefono }}</dd></div>
              <div class="flex justify-between gap-4 py-2.5"><dt class="text-slate-500">Dirección</dt><dd class="text-right font-medium text-slate-900">{{ c.direccion || '—' }}</dd></div>
              <div class="flex justify-between gap-4 py-2.5"><dt class="text-slate-500">Vence el DNI</dt><dd class="font-medium text-slate-900">{{ c.dni_caducidad | fecha }}</dd></div>
              <div class="flex justify-between gap-4 py-2.5"><dt class="text-slate-500">RUC</dt><dd class="text-right font-medium text-slate-900">
                @if (c.ruc) { <span class="font-mono">{{ c.ruc }}</span> @if (c.razon_social) { <span class="block text-xs font-normal text-slate-500">{{ c.razon_social }}</span> } } @else { No registrado }
              </dd></div>
            </dl>
          </section>

          <!-- ── Deuda y mora (HU-23) ── -->
          <section class="lg:col-span-3" aria-label="Deuda y mora">
            @if (deuda(); as d) {
              @if (d.cuotas_vencidas > 0) {
                <div id="seccion-deuda" class="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
                  <div class="flex items-center gap-3">
                    <app-icono nombre="alerta" class="h-5 w-5 text-red-600" />
                    <h2 class="font-semibold text-slate-900">Deuda pendiente de regularización</h2>
                  </div>
                  <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div class="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p class="text-xs text-amber-700">Cuotas vencidas</p>
                      <p id="cuotas-vencidas" class="mt-1 text-2xl font-bold text-amber-900">{{ d.cuotas_vencidas }}</p>
                    </div>
                    <div class="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p class="text-xs text-amber-700">Días de atraso</p>
                      <p id="dias-atraso" class="mt-1 text-2xl font-bold text-amber-900">{{ d.dias_atraso }}</p>
                    </div>
                    <div class="rounded-xl border border-red-200 bg-red-50 p-4">
                      <p class="text-xs text-red-700">Deuda vencida</p>
                      <p id="deuda-vencida" class="mt-1 text-xl font-bold text-red-900">{{ d.deuda_vencida | monto }}</p>
                    </div>
                    <div class="rounded-xl border border-red-200 bg-red-50 p-4">
                      <p class="text-xs text-red-700">Mora acumulada</p>
                      <p id="mora-acumulada" class="mt-1 text-xl font-bold text-red-900">{{ d.mora | monto }}</p>
                    </div>
                    <div class="col-span-2 rounded-xl border border-red-300 bg-red-100 p-4 sm:col-span-1">
                      <p class="text-xs font-semibold text-red-800">Total a regularizar</p>
                      <p id="total-regularizar" class="mt-1 text-xl font-bold text-red-950">{{ d.total_a_regularizar | monto }}</p>
                    </div>
                  </div>
                  @if (d.vencimiento_mas_antiguo) {
                    <p class="mt-4 text-xs text-slate-500">Cuota vencida más antigua: <strong class="text-slate-700">{{ d.vencimiento_mas_antiguo | fecha }}</strong></p>
                  }
                </div>
              } @else {
                <div class="flex h-full items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
                  <span class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><app-icono nombre="ok" class="h-6 w-6" /></span>
                  <div>
                    <p class="font-semibold text-emerald-900">No presenta deudas vencidas</p>
                    <p class="text-sm text-emerald-700">El cliente no tiene cuotas en mora.</p>
                  </div>
                </div>
              }
            } @else {
              <div class="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-400 shadow-sm">Cargando deuda…</div>
            }
          </section>
        </div>

        <!-- ── Préstamos ── -->
        <section aria-label="Historial de préstamos" class="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div class="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
            <app-icono nombre="prestamos" class="h-5 w-5 text-vino-700" />
            <h2 class="font-semibold text-slate-900">Préstamos del cliente</h2>
            <span class="rounded-full bg-vino-100 px-2.5 py-0.5 text-xs font-semibold text-vino-800">{{ prestamos().length }}</span>
          </div>

          @if (cargandoPrestamos()) {
            <div class="py-10 text-center text-sm text-slate-400">Cargando préstamos…</div>
          } @else if (prestamos().length === 0) {
            <div class="py-12 text-center text-sm text-slate-500">Este cliente no tiene préstamos registrados.</div>
          } @else {
            <div class="space-y-3 p-4 sm:p-6">
              @for (p of prestamos(); track p.id) {
                <details id="prestamo-{{ p.id }}" class="group rounded-xl border border-slate-200 bg-white open:shadow-sm">
                  <summary class="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition hover:bg-vino-50/40">
                    <span class="rounded-full px-2.5 py-1 text-xs font-semibold" [class]="p.estado === 'VIGENTE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'">
                      {{ p.estado === 'VIGENTE' ? 'Vigente' : 'Cancelado' }}
                    </span>
                    <span class="text-lg font-bold text-slate-900">{{ p.monto | monto }}</span>
                    <span class="text-sm text-slate-500">a {{ p.plazo_meses }} meses</span>
                    <span class="text-sm text-slate-400">Desembolso: {{ p.fecha_desembolso | fecha }}</span>
                    @if (cuotasVencidas(p) > 0) {
                      <span class="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">{{ cuotasVencidas(p) }} cuota(s) vencida(s)</span>
                    }
                    <span class="ml-auto flex items-center gap-1 text-xs font-medium text-vino-700">
                      Cronograma <app-icono nombre="abajo" class="h-4 w-4 transition group-open:rotate-180" />
                    </span>
                  </summary>

                  <div class="overflow-x-auto border-t border-slate-100 scroll-fino">
                    <table class="w-full text-xs">
                      <thead class="bg-slate-50 text-left text-slate-500">
                        <tr>
                          <th class="px-4 py-2.5 font-medium">N.°</th>
                          <th class="px-4 py-2.5 font-medium">Vencimiento</th>
                          <th class="px-4 py-2.5 text-right font-medium">Cuota</th>
                          <th class="px-4 py-2.5 text-right font-medium">Capital</th>
                          <th class="px-4 py-2.5 text-right font-medium">Interés</th>
                          <th class="px-4 py-2.5 text-right font-medium">Saldo</th>
                          <th class="px-4 py-2.5 font-medium">Estado</th>
                          <th class="px-4 py-2.5 font-medium">F. pago</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-50">
                        @for (cuota of cuotasOrdenadas(p); track cuota.id) {
                          <tr [class]="cuota.estado === 'VENCIDA' ? 'bg-red-50' : ''">
                            <td class="px-4 py-2 text-slate-500">{{ cuota.numero }}</td>
                            <td class="px-4 py-2 font-mono">{{ cuota.fecha_vencimiento | fecha }}</td>
                            <td class="px-4 py-2 text-right">{{ cuota.cuota | monto }}</td>
                            <td class="px-4 py-2 text-right">{{ cuota.capital | monto }}</td>
                            <td class="px-4 py-2 text-right">{{ cuota.interes | monto }}</td>
                            <td class="px-4 py-2 text-right">{{ cuota.saldo | monto }}</td>
                            <td class="px-4 py-2" [class]="cuotaEstiloEstado(cuota.estado)">{{ cuotaTextoEstado(cuota.estado) }}</td>
                            <td class="px-4 py-2 font-mono text-slate-400">{{ cuota.fecha_pago ? (cuota.fecha_pago | fecha) : '—' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <div class="flex justify-end border-t border-slate-100 px-5 py-3">
                    <a routerLink="/prestamos" [queryParams]="{ id: p.id }" class="flex items-center gap-1.5 text-sm font-medium text-vino-700 hover:text-vino-900">
                      Ver detalle y contrato <app-icono nombre="flechaDer" class="h-4 w-4" />
                    </a>
                  </div>
                </details>
              }
            </div>
          }
        </section>
      }
    </div>
  `,
})
export class ClienteFicha implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly clientesSvc = inject(ClientesService);
  private readonly prestamosSvc = inject(PrestamosService);

  protected readonly cliente = signal<Cliente | null>(null);
  protected readonly deuda = signal<DeudaCliente | null>(null);
  protected readonly capitalVigente = signal<number | null>(null);
  protected readonly prestamos = signal<PrestamoConCuotas[]>([]);

  protected readonly vigentes = computed(
    () => this.prestamos().filter((p) => p.estado === 'VIGENTE').length,
  );

  protected iniciales(c: Cliente): string {
    return (c.nombres[0] ?? '') + (c.apellidos[0] ?? '');
  }

  protected readonly cargando = signal(false);
  protected readonly cargandoPrestamos = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly tope = 10000;

  protected get disponible(): () => number {
    return () => {
      const v = this.capitalVigente();
      return v !== null ? Math.max(0, this.tope - v) : 0;
    };
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('No se indicó el cliente.');
      return;
    }

    this.cargando.set(true);
    this.error.set(null);
    try {
      const c = await this.clientesSvc.obtener(id);
      this.cliente.set(c);

      // Cargar datos paralelos
      this.cargandoPrestamos.set(true);
      const [deudaData, capitalData, prestamosData] = await Promise.all([
        this.clientesSvc.deuda(id),
        this.clientesSvc.capitalVigente(id),
        this.prestamosSvc.listarPorCliente(id),
      ]);
      this.deuda.set(deudaData);
      this.capitalVigente.set(Number(capitalData));
      this.prestamos.set(prestamosData);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.cargando.set(false);
      this.cargandoPrestamos.set(false);
    }
  }

  protected estadoBadge(e: EstadoCliente): string {
    return ESTADO_BADGE[e];
  }

  protected estadoTexto(e: EstadoCliente): string {
    return ESTADO_TEXTO[e];
  }

  protected cuotasVencidas(p: PrestamoConCuotas): number {
    return p.cuotas?.filter((c) => c.estado === 'VENCIDA').length ?? 0;
  }

  protected cuotasOrdenadas(p: PrestamoConCuotas): PrestamoConCuotas['cuotas'] {
    return [...(p.cuotas ?? [])].sort((a, b) => a.numero - b.numero);
  }

  protected cuotaEstiloEstado(e: string): string {
    return CUOTA_ESTADO_ESTILO[e] ?? '';
  }

  protected cuotaTextoEstado(e: string): string {
    const MAP: Record<string, string> = { PENDIENTE: 'Pendiente', PAGADA: 'Pagada', VENCIDA: 'Vencida' };
    return MAP[e] ?? e;
  }

  // Expuesto para uso en template (format helpers usados inline)
  protected readonly formatearMonto = formatearMonto;
  protected readonly formatearFecha = formatearFecha;
}
