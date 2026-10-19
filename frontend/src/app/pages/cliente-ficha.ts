import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Aviso } from '../components/aviso';
import { Cliente, DeudaCliente, EstadoCliente, PrestamoConCuotas } from '../core/contrato';
import { FechaPipe, formatearFecha, formatearMonto, MontoPipe } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
import { ClientesService } from '../services/clientes.service';
import { PrestamosService } from '../services/prestamos.service';

// HU-05 Buscar y consultar cliente · HU-23 Mora por día de atraso.

const ESTADO_ESTILO: Record<EstadoCliente, string> = {
  AL_DIA: 'border-green-300 bg-green-50 text-green-800',
  MOROSO: 'border-amber-300 bg-amber-50 text-amber-900',
  EXTRAJUDICIAL: 'border-red-300 bg-red-50 text-red-800',
};

const ESTADO_BADGE: Record<EstadoCliente, string> = {
  AL_DIA: 'bg-green-100 text-green-800',
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
  PAGADA: 'text-green-700',
  VENCIDA: 'text-red-700 font-semibold',
};

@Component({
  selector: 'app-pagina-cliente-ficha',
  imports: [RouterLink, Aviso, MontoPipe, FechaPipe],
  template: `
    <div class="space-y-6">

      <!-- Breadcrumb -->
      <div class="flex items-center gap-2 text-sm text-slate-500">
        <a routerLink="/clientes" id="link-volver-clientes" class="hover:text-slate-800 hover:underline">← Clientes</a>
        @if (cliente()) {
          <span>/</span>
          <span class="text-slate-900">{{ cliente()!.apellidos }}, {{ cliente()!.nombres }}</span>
        }
      </div>

      <!-- Errores -->
      <app-aviso [mensaje]="error()" />

      <!-- Cargando inicial -->
      @if (cargando() && !cliente()) {
        <div class="py-16 text-center text-slate-400">Cargando ficha…</div>
      }

      @if (cliente(); as c) {
        <!-- ── Encabezado del cliente ── -->
        <div class="rounded-xl border px-6 py-5 shadow-sm" [class]="estadoBorde(c.estado)">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h1 id="nombre-cliente" class="text-2xl font-bold text-slate-900">
                  {{ c.apellidos }}, {{ c.nombres }}
                </h1>
                <span class="rounded-full px-2.5 py-0.5 text-sm font-semibold" [class]="estadoBadge(c.estado)">
                  {{ estadoTexto(c.estado) }}
                </span>
                @if (!c.nombre_verificado) {
                  <span class="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">⚠ No verificado</span>
                }
              </div>
              <div class="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
                <span>DNI: <strong class="font-mono text-slate-900">{{ c.dni }}</strong></span>
                <span>Tel: <strong class="text-slate-900">{{ c.telefono }}</strong></span>
                @if (c.direccion) {
                  <span>Dir: {{ c.direccion }}</span>
                }
                <span>Vence DNI: <strong class="text-slate-900">{{ c.dni_caducidad | fecha }}</strong></span>
              </div>
              @if (c.ruc) {
                <div class="mt-1 text-sm text-slate-500">
                  RUC: <strong class="font-mono text-slate-700">{{ c.ruc }}</strong>
                  @if (c.razon_social) { — {{ c.razon_social }} }
                </div>
              }
            </div>

            <!-- Tope de crédito -->
            <div class="rounded-lg border border-slate-200 bg-white px-5 py-3 text-center shadow-sm">
              <div class="text-xs font-semibold uppercase tracking-wide text-slate-400">Capital vigente</div>
              <div id="capital-vigente" class="text-2xl font-bold text-slate-900">
                {{ capitalVigente() !== null ? (capitalVigente()! | monto) : '—' }}
              </div>
              <div class="text-xs text-slate-400">de {{ 10000 | monto }} tope</div>
              <div class="mt-1 text-sm">
                Disponible:
                <span
                  class="font-semibold"
                  [class]="disponible() > 0 ? 'text-green-700' : 'text-red-600'"
                >
                  {{ capitalVigente() !== null ? (disponible() | monto) : '—' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Estado moroso/extrajudicial: detalle de fechas -->
          @if (c.estado !== 'AL_DIA') {
            <div class="mt-3 flex flex-wrap gap-4 text-sm">
              @if (c.fecha_moroso) {
                <span class="text-amber-800">Moroso desde: <strong>{{ c.fecha_moroso | fecha }}</strong></span>
              }
              @if (c.fecha_extrajudicial) {
                <span class="text-red-800">Extrajudicial desde: <strong>{{ c.fecha_extrajudicial | fecha }}</strong></span>
              }
            </div>
          }
        </div>

        <!-- ── HU-23 Bloque de deuda (mora por día) ── -->
        @if (deuda()) {
          @if (deuda()!.cuotas_vencidas > 0) {
            <section id="seccion-deuda" aria-label="Deuda y mora">
              <h2 class="mb-3 text-base font-semibold text-slate-800">Deuda pendiente de regularización</h2>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                  <div class="text-xs text-amber-600">Cuotas vencidas</div>
                  <div id="cuotas-vencidas" class="text-2xl font-bold text-amber-800">{{ deuda()!.cuotas_vencidas }}</div>
                </div>
                <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                  <div class="text-xs text-amber-600">Días de atraso</div>
                  <div id="dias-atraso" class="text-2xl font-bold text-amber-800">{{ deuda()!.dias_atraso }}</div>
                </div>
                <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                  <div class="text-xs text-red-600">Deuda vencida</div>
                  <div id="deuda-vencida" class="text-lg font-bold text-red-800">{{ deuda()!.deuda_vencida | monto }}</div>
                </div>
                <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                  <div class="text-xs text-red-600">Mora acumulada</div>
                  <div id="mora-acumulada" class="text-lg font-bold text-red-800">{{ deuda()!.mora | monto }}</div>
                </div>
                <div class="rounded-lg border border-red-300 bg-red-100 p-3 text-center">
                  <div class="text-xs font-semibold text-red-700">Total a regularizar</div>
                  <div id="total-regularizar" class="text-lg font-bold text-red-900">{{ deuda()!.total_a_regularizar | monto }}</div>
                  @if (deuda()!.vencimiento_mas_antiguo) {
                    <div class="mt-1 text-xs text-red-600">
                      Cuota más antigua: {{ deuda()!.vencimiento_mas_antiguo! | fecha }}
                    </div>
                  }
                </div>
              </div>
            </section>
          }
        }

        <!-- ── Préstamos ── -->
        <section aria-label="Historial de préstamos">
          <h2 class="mb-3 text-base font-semibold text-slate-800">Préstamos</h2>

          @if (cargandoPrestamos()) {
            <div class="py-6 text-center text-sm text-slate-400">Cargando préstamos…</div>
          } @else if (prestamos().length === 0) {
            <div class="rounded-lg border border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-400">
              Este cliente no tiene préstamos registrados.
            </div>
          } @else {
            <div class="space-y-4">
              @for (p of prestamos(); track p.id) {
                <details
                  id="prestamo-{{ p.id }}"
                  class="rounded-lg border border-slate-200 bg-white shadow-sm"
                >
                  <summary class="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-semibold"
                      [class]="p.estado === 'VIGENTE' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'"
                    >
                      {{ p.estado === 'VIGENTE' ? 'Vigente' : 'Cancelado' }}
                    </span>
                    <span class="font-semibold text-slate-900">{{ p.monto | monto }}</span>
                    <span class="text-slate-500">a {{ p.plazo_meses }} meses</span>
                    <span class="text-slate-400 text-sm">Desembolso: {{ p.fecha_desembolso | fecha }}</span>
                    <span class="ml-auto text-xs text-slate-400">
                      {{ cuotasVencidas(p) > 0 ? cuotasVencidas(p) + ' cuota(s) vencida(s)' : '' }}
                    </span>
                  </summary>

                  <!-- Cronograma de cuotas -->
                  <div class="overflow-x-auto border-t border-slate-100">
                    <table class="w-full text-xs">
                      <thead class="bg-slate-50 text-left text-slate-500">
                        <tr>
                          <th class="px-3 py-2">#</th>
                          <th class="px-3 py-2">Vencimiento</th>
                          <th class="px-3 py-2 text-right">Cuota</th>
                          <th class="px-3 py-2 text-right">Capital</th>
                          <th class="px-3 py-2 text-right">Interés</th>
                          <th class="px-3 py-2 text-right">Saldo</th>
                          <th class="px-3 py-2">Estado</th>
                          <th class="px-3 py-2">F. Pago</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-50">
                        @for (cuota of cuotasOrdenadas(p); track cuota.id) {
                          <tr [class]="cuota.estado === 'VENCIDA' ? 'bg-red-50' : ''">
                            <td class="px-3 py-1.5 text-slate-500">{{ cuota.numero }}</td>
                            <td class="px-3 py-1.5 font-mono">{{ cuota.fecha_vencimiento | fecha }}</td>
                            <td class="px-3 py-1.5 text-right">{{ cuota.cuota | monto }}</td>
                            <td class="px-3 py-1.5 text-right">{{ cuota.capital | monto }}</td>
                            <td class="px-3 py-1.5 text-right">{{ cuota.interes | monto }}</td>
                            <td class="px-3 py-1.5 text-right">{{ cuota.saldo | monto }}</td>
                            <td class="px-3 py-1.5" [class]="cuotaEstiloEstado(cuota.estado)">
                              {{ cuotaTextoEstado(cuota.estado) }}
                            </td>
                            <td class="px-3 py-1.5 font-mono text-slate-400">
                              {{ cuota.fecha_pago ? (cuota.fecha_pago | fecha) : '—' }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </details>
              }
            </div>
          }
        </section>

        <!-- ── Acciones ── -->
        <div class="flex flex-wrap gap-3 pt-2">
          <a
            id="btn-nuevo-prestamo"
            [routerLink]="['/prestamos/nuevo']"
            [queryParams]="{ cliente: c.id }"
            class="rounded border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >+ Nuevo préstamo</a>
        </div>
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

  protected readonly cargando = signal(false);
  protected readonly cargandoPrestamos = signal(false);
  protected readonly error = signal<string | null>(null);

  protected get disponible(): () => number {
    return () => {
      const v = this.capitalVigente();
      return v !== null ? Math.max(0, 10000 - v) : 0;
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

  protected estadoBorde(e: EstadoCliente): string {
    return ESTADO_ESTILO[e];
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
