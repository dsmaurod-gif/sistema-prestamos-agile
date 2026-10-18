import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Aviso } from '../components/aviso';
import { EstadoCliente } from '../core/contrato';
import { mensajeDeError } from '../core/supabase';
import { ClientesService } from '../services/clientes.service';

// HU-03 Registrar cliente · HU-04 Rechazar documentos no permitidos · HU-05 Buscar y consultar cliente.

interface FilaCliente {
  id: string;
  dni: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  estado: EstadoCliente;
  nombre_verificado: boolean;
}

const ESTADO_ESTILO: Record<EstadoCliente, string> = {
  AL_DIA: 'bg-green-100 text-green-800',
  MOROSO: 'bg-amber-100 text-amber-800',
  EXTRAJUDICIAL: 'bg-red-100 text-red-800',
};

const ESTADO_TEXTO: Record<EstadoCliente, string> = {
  AL_DIA: 'Al día',
  MOROSO: 'Moroso',
  EXTRAJUDICIAL: 'Extrajudicial',
};

@Component({
  selector: 'app-pagina-clientes',
  imports: [FormsModule, RouterLink, Aviso],
  template: `
    <div class="space-y-6">
      <!-- Encabezado -->
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold text-slate-900">Clientes</h1>
          <p class="text-sm text-slate-500">Busque por DNI, nombre o apellido</p>
        </div>
        <a
          id="btn-nuevo-cliente"
          routerLink="/clientes/nuevo"
          class="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >+ Registrar cliente</a>
      </div>

      <!-- Buscador -->
      <form (ngSubmit)="buscar()" class="flex gap-2" novalidate>
        <input
          id="input-busqueda-cliente"
          type="search"
          name="q"
          [(ngModel)]="query"
          placeholder="DNI, nombre o apellido…"
          autocomplete="off"
          [disabled]="cargando()"
          class="flex-1 rounded border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none disabled:bg-slate-50"
        />
        <button
          id="btn-buscar-cliente"
          type="submit"
          [disabled]="cargando() || !query.trim()"
          class="rounded bg-slate-700 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ cargando() ? 'Buscando…' : 'Buscar' }}
        </button>
      </form>

      <!-- Aviso de error -->
      <app-aviso [mensaje]="error()" />

      <!-- Resultados -->
      @if (clientes().length > 0) {
        <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-3">DNI</th>
                <th class="px-4 py-3">Apellidos y nombres</th>
                <th class="px-4 py-3">Teléfono</th>
                <th class="px-4 py-3">Estado</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (c of clientes(); track c.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-4 py-3 font-mono text-slate-700">{{ c.dni }}</td>
                  <td class="px-4 py-3">
                    <span class="font-medium text-slate-900">{{ c.apellidos }}, {{ c.nombres }}</span>
                    @if (!c.nombre_verificado) {
                      <span class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">No verificado</span>
                    }
                  </td>
                  <td class="px-4 py-3 text-slate-600">{{ c.telefono }}</td>
                  <td class="px-4 py-3">
                    <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" [class]="estadoEstilo(c.estado)">
                      {{ estadoTexto(c.estado) }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <a
                      [id]="'btn-ver-cliente-' + c.id"
                      [routerLink]="['/clientes', c.id]"
                      class="text-slate-600 hover:text-slate-900 hover:underline"
                    >Ver ficha →</a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <p class="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            {{ clientes().length }} resultado{{ clientes().length !== 1 ? 's' : '' }}
          </p>
        </div>
      }

      @if (buscado() && clientes().length === 0 && !cargando() && !error()) {
        <div class="rounded-lg border border-slate-200 bg-slate-50 px-6 py-10 text-center text-slate-500">
          No se encontraron clientes con «{{ ultimaBusqueda() }}».
        </div>
      }
    </div>
  `,
})
export class Clientes {
  private readonly svc = inject(ClientesService);
  private readonly router = inject(Router);

  protected query = '';
  protected readonly clientes = signal<FilaCliente[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly buscado = signal(false);
  protected readonly ultimaBusqueda = signal('');

  protected estadoEstilo(e: EstadoCliente): string {
    return ESTADO_ESTILO[e];
  }

  protected estadoTexto(e: EstadoCliente): string {
    return ESTADO_TEXTO[e];
  }

  protected async buscar(): Promise<void> {
    const q = this.query.trim();
    if (!q || this.cargando()) return;
    this.cargando.set(true);
    this.error.set(null);
    this.buscado.set(false);
    try {
      const resultado = await this.svc.buscar(q);
      this.clientes.set(resultado as FilaCliente[]);
      this.ultimaBusqueda.set(q);
      this.buscado.set(true);
      // Si la búsqueda es un DNI exacto de 8 dígitos y hay un único resultado, ir directo a la ficha
      if (/^\d{8}$/.test(q) && resultado.length === 1) {
        void this.router.navigate(['/clientes', resultado[0].id]);
      }
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }
}
