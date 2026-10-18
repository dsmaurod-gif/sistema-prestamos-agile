import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Aviso } from '../components/aviso';
import { Cuota, PrestamoDetalle } from '../core/contrato';
import { formatearFecha, formatearMonto } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
import { PrestamosService } from '../services/prestamos.service';

/** HU-08: muestra el encabezado y el cronograma generado para un préstamo. */
@Component({
  selector: 'app-pagina-prestamos',
  imports: [Aviso],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900">Cronograma del préstamo</h1>
        <p class="mt-1 text-sm text-slate-600">Detalle de cuotas y saldos del préstamo seleccionado.</p>
      </div>

      <app-aviso [mensaje]="error()" />

      @if (cargando()) {
        <div class="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">Cargando cronograma...</div>
      } @else if (!prestamo() && !error()) {
        <div class="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Selecciona un préstamo desde el listado para consultar su cronograma.
        </div>
      }

      @if (prestamo(); as detalle) {
        <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-sm text-slate-500">Cliente</p>
              <h2 class="text-xl font-semibold text-slate-900">
                {{ detalle.clientes.nombres }} {{ detalle.clientes.apellidos }}
              </h2>
              <p class="mt-1 text-sm text-slate-600">DNI {{ detalle.clientes.dni }}</p>
            </div>
            <span
              class="rounded-full px-3 py-1 text-sm font-semibold"
              [class]="detalle.estado === 'VIGENTE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'"
            >
              {{ estadoPrestamo(detalle.estado) }}
            </span>
          </div>

          <dl class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-md bg-slate-50 p-3">
              <dt class="text-xs text-slate-500">Fecha del préstamo</dt>
              <dd class="mt-1 font-medium text-slate-900">{{ fecha(detalle.fecha_desembolso) }}</dd>
            </div>
            <div class="rounded-md bg-slate-50 p-3">
              <dt class="text-xs text-slate-500">Monto</dt>
              <dd class="mt-1 font-medium text-slate-900">{{ monto(detalle.monto) }}</dd>
            </div>
            <div class="rounded-md bg-slate-50 p-3">
              <dt class="text-xs text-slate-500">Plazo</dt>
              <dd class="mt-1 font-medium text-slate-900">{{ detalle.plazo_meses }} meses</dd>
            </div>
            <div class="rounded-md bg-slate-50 p-3">
              <dt class="text-xs text-slate-500">Tasa efectiva anual</dt>
              <dd class="mt-1 font-medium text-slate-900">{{ porcentaje(detalle.tea) }}</dd>
            </div>
          </dl>
        </section>

        <section class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div class="border-b border-slate-200 px-5 py-4">
            <h2 class="font-semibold text-slate-900">Cronograma de pagos</h2>
            <p class="mt-1 text-sm text-slate-600">{{ detalle.cuotas.length }} cuotas</p>
          </div>

          @if (detalle.cuotas.length > 0) {
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-slate-200 text-sm">
                <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" class="px-5 py-3 font-medium">N°</th>
                    <th scope="col" class="px-5 py-3 font-medium">Vencimiento</th>
                    <th scope="col" class="px-5 py-3 text-right font-medium">Cuota</th>
                    <th scope="col" class="px-5 py-3 text-right font-medium">Capital</th>
                    <th scope="col" class="px-5 py-3 text-right font-medium">Interés</th>
                    <th scope="col" class="px-5 py-3 text-right font-medium">Saldo</th>
                    <th scope="col" class="px-5 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (cuota of cuotasOrdenadas(detalle.cuotas); track cuota.id) {
                    <tr [class]="cuota.estado === 'VENCIDA' ? 'bg-red-50' : 'bg-white'">
                      <td class="whitespace-nowrap px-5 py-3 font-medium text-slate-900">{{ cuota.numero }}</td>
                      <td class="whitespace-nowrap px-5 py-3 text-slate-700">{{ fecha(cuota.fecha_vencimiento) }}</td>
                      <td class="whitespace-nowrap px-5 py-3 text-right text-slate-900">{{ monto(cuota.cuota) }}</td>
                      <td class="whitespace-nowrap px-5 py-3 text-right text-slate-700">{{ monto(cuota.capital) }}</td>
                      <td class="whitespace-nowrap px-5 py-3 text-right text-slate-700">{{ monto(cuota.interes) }}</td>
                      <td class="whitespace-nowrap px-5 py-3 text-right text-slate-700">{{ monto(cuota.saldo) }}</td>
                      <td class="whitespace-nowrap px-5 py-3">
                        <span class="rounded-full px-2.5 py-1 text-xs font-semibold" [class]="estadoCuotaClase(cuota)">
                          {{ estadoCuota(cuota.estado) }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="p-5 text-sm text-slate-600">Este préstamo no tiene cuotas registradas.</p>
          }
        </section>
      }
    </div>
  `,
})
export class Prestamos implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly prestamosService = inject(PrestamosService);

  protected readonly prestamo = signal<PrestamoDetalle | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly cargando = signal(false);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.queryParamMap.get('id');
    if (!id) return;

    this.cargando.set(true);
    try {
      this.prestamo.set(await this.prestamosService.obtener(id));
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  protected cuotasOrdenadas(cuotas: Cuota[]): Cuota[] {
    return [...cuotas].sort((a, b) => a.numero - b.numero);
  }

  protected monto(valor: number): string {
    return formatearMonto(valor);
  }

  protected fecha(valor: string): string {
    return formatearFecha(valor);
  }

  protected porcentaje(valor: number): string {
    return `${Number(valor).toFixed(2)}%`;
  }

  protected estadoPrestamo(estado: PrestamoDetalle['estado']): string {
    return estado === 'VIGENTE' ? 'Vigente' : 'Cancelado';
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
