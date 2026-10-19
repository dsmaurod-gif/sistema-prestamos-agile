import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { formatearFecha } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
import { AuthService } from '../services/auth.service';
import { DemoService } from '../services/demo.service';
import { Aviso } from './aviso';

interface Opcion {
  ruta: string;
  texto: string;
  soloAdmin?: boolean;
}

const OPCIONES: Opcion[] = [
  { ruta: '/clientes', texto: 'Clientes' },
  { ruta: '/prestamos/nuevo', texto: 'Nuevo préstamo' },
  { ruta: '/prestamos', texto: 'Préstamos' },
  { ruta: '/reportes', texto: 'Reportes', soloAdmin: true },
  { ruta: '/demo', texto: 'Modo demostración', soloAdmin: true },
];

/** Marco de las páginas protegidas: menú según rol y aviso de fecha simulada. */
@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Aviso],
  template: `
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <span class="font-semibold text-slate-900">Sistema de Préstamos</span>
        <nav class="flex flex-1 flex-wrap gap-1">
          @for (opcion of opciones(); track opcion.ruta) {
            <a
              [routerLink]="opcion.ruta"
              routerLinkActive="bg-slate-100 text-slate-900"
              [routerLinkActiveOptions]="{ exact: true }"
              class="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >{{ opcion.texto }}</a
            >
          }
        </nav>
        <span class="text-sm text-slate-600">
          {{ trabajador()?.nombre }} · {{ trabajador()?.sedes?.nombre }}
        </span>
        <button
          type="button"
          (click)="cerrarSesion()"
          class="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
    <div class="mx-auto max-w-6xl space-y-2 px-4 pt-4">
      <app-aviso tipo="advertencia" [mensaje]="avisoFechaSimulada()" />
      <app-aviso [mensaje]="error()" />
    </div>
    <main class="mx-auto max-w-6xl px-4 py-6">
      <router-outlet />
    </main>
  `,
})
export class Layout implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly demo = inject(DemoService);
  private readonly router = inject(Router);

  protected readonly trabajador = this.auth.trabajador;
  protected readonly error = signal<string | null>(null);
  protected readonly opciones = computed(() =>
    OPCIONES.filter((opcion) => !opcion.soloAdmin || this.auth.esAdmin()),
  );
  protected readonly avisoFechaSimulada = computed(() => {
    const fecha = this.demo.fechaReferencia();
    return fecha
      ? `Modo demostración: el sistema está usando la fecha simulada ${formatearFecha(fecha)}.`
      : null;
  });

  async ngOnInit(): Promise<void> {
    try {
      await this.demo.cargarFechaReferencia();
    } catch (e) {
      this.error.set(mensajeDeError(e));
    }
  }

  protected async cerrarSesion(): Promise<void> {
    await this.auth.cerrarSesion();
    await this.router.navigateByUrl('/login');
  }
}
