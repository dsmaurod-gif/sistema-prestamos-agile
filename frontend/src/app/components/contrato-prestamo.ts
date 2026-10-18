import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { PrestamoDetalle } from '../core/contrato';
import { formatearFecha, formatearMonto } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
import { PrestamosService } from '../services/prestamos.service';

/** HU-09: muestra el contrato del préstamo y permite imprimirlo. */
@Component({
  selector: 'app-contrato-prestamo',
  template: `
    <section class="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold text-slate-900">Contrato de préstamo</h3>
          <p class="mt-1 text-sm text-slate-600">Genera una versión lista para imprimir.</p>
        </div>
        <button
          type="button"
          (click)="imprimir()"
          [disabled]="cargando() || !prestamo()"
          class="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ cargando() ? 'Cargando...' : 'Imprimir contrato' }}
        </button>
      </div>

      @if (error()) {
        <p class="mt-3 text-sm text-red-700">{{ error() }}</p>
      }

      @if (prestamo(); as contrato) {
        <article class="contrato-imprimible mt-4 space-y-3 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-800">
          <h4 class="text-center text-lg font-semibold uppercase">Contrato de préstamo</h4>
          <p>Entre el prestamista y <strong>{{ contrato.clientes.nombres }} {{ contrato.clientes.apellidos }}</strong>, identificado(a) con DNI {{ contrato.clientes.dni }}, se celebra el presente contrato.</p>
          <dl class="grid gap-2 sm:grid-cols-2">
            <div><dt class="text-slate-500">Monto</dt><dd class="font-medium">{{ monto(contrato.monto) }}</dd></div>
            <div><dt class="text-slate-500">Plazo</dt><dd class="font-medium">{{ contrato.plazo_meses }} meses</dd></div>
            <div><dt class="text-slate-500">Tasa efectiva anual</dt><dd class="font-medium">{{ porcentaje(contrato.tea) }}</dd></div>
            <div><dt class="text-slate-500">Fecha de desembolso</dt><dd class="font-medium">{{ fecha(contrato.fecha_desembolso) }}</dd></div>
          </dl>
          <p>El cliente declara conocer las condiciones del préstamo y se compromete a cumplir el cronograma correspondiente.</p>
        </article>
      }
    </section>
  `,
})
export class ContratoPrestamo implements OnInit {
  private readonly prestamosService = inject(PrestamosService);

  @Input({ required: true }) prestamoId!: string;

  protected readonly prestamo = signal<PrestamoDetalle | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.cargarContrato();
  }

  protected async cargarContrato(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.prestamo.set(await this.prestamosService.obtener(this.prestamoId));
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  protected imprimir(): void {
    window.print();
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
}
