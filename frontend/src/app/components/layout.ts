import { Component, computed, inject, OnInit, signal } from '@angular/core';
import {
  IsActiveMatchOptions,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { formatearFecha } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
import { AuthService } from '../services/auth.service';
import { DemoService } from '../services/demo.service';
import { Aviso } from './aviso';
import { Icono, Logo, NombreIcono } from './icono';

interface Opcion {
  ruta: string;
  texto: string;
  icono: NombreIcono;
  /** true: solo está activa en esa ruta exacta (no en las rutas hijas). */
  exacta?: boolean;
  soloAdmin?: boolean;
  soloTrabajador?: boolean;
}

const OPCIONES: Opcion[] = [
  { ruta: '/inicio', texto: 'Inicio', icono: 'inicio', exacta: true },
  { ruta: '/clientes', texto: 'Clientes', icono: 'clientes' },
  { ruta: '/prestamos/nuevo', texto: 'Nuevo préstamo', icono: 'prestamoNuevo', exacta: true },
  { ruta: '/prestamos', texto: 'Préstamos', icono: 'prestamos', exacta: true },
  { ruta: '/solicitud-capital', texto: 'Solicitud de capital', icono: 'monedas', soloTrabajador: true },
  { ruta: '/solicitudes', texto: 'Gestionar solicitudes', icono: 'bandeja', soloAdmin: true },
  { ruta: '/reportes', texto: 'Reportes', icono: 'reportes', soloAdmin: true },
  { ruta: '/demo', texto: 'Modo demostración', icono: 'demo', soloAdmin: true },
];

const EXACTA: IsActiveMatchOptions = {
  paths: 'exact',
  queryParams: 'ignored',
  matrixParams: 'ignored',
  fragment: 'ignored',
};
const PREFIJO: IsActiveMatchOptions = {
  paths: 'subset',
  queryParams: 'ignored',
  matrixParams: 'ignored',
  fragment: 'ignored',
};

const FECHA_LARGA = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const CLAVE_MENU = 'prestamos.menu.colapsado';

function menuColapsadoGuardado(): boolean {
  try {
    return localStorage.getItem(CLAVE_MENU) === '1';
  } catch {
    return false;
  }
}

/** Marco de las páginas protegidas: menú lateral plegable, cabecera con sede y usuario, y aviso de fecha simulada. */
@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Aviso, Icono, Logo],
  template: `
    <!-- Fondo oscuro del menú en pantallas pequeñas -->
    @if (movilAbierto()) {
      <button
        type="button"
        aria-label="Cerrar menú"
        (click)="movilAbierto.set(false)"
        class="animar-aparece fixed inset-0 z-30 bg-vino-950/50 lg:hidden"
      ></button>
    }

    <!-- ── Menú lateral ── -->
    <aside
      class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-linear-to-b from-vino-900 via-vino-900 to-vino-950 text-vino-50 shadow-xl transition-[width,translate] duration-300"
      [class]="
        (movilAbierto() ? 'translate-x-0' : '-translate-x-full') +
        ' lg:translate-x-0 ' +
        (colapsado() ? 'lg:w-[4.75rem]' : 'lg:w-64')
      "
      aria-label="Menú principal"
    >
      <div class="flex h-16 items-center gap-3 border-b border-white/10 px-4">
        <app-logo class="h-8 w-9 text-white" />
        <div class="min-w-0 leading-tight" [class]="colapsado() ? 'lg:hidden' : ''">
          <p class="truncate text-sm font-semibold text-white">Sistema de</p>
          <p class="truncate text-sm font-semibold text-white">Gestión de Préstamos</p>
        </div>
      </div>

      <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-4 scroll-fino">
        @for (opcion of opciones(); track opcion.ruta) {
          <a
            [routerLink]="opcion.ruta"
            routerLinkActive="bg-white/15 text-white shadow-inner"
            [routerLinkActiveOptions]="opcion.exacta ? exacta : prefijo"
            (click)="movilAbierto.set(false)"
            [attr.title]="colapsado() ? opcion.texto : null"
            class="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-vino-100 transition hover:bg-white/10 hover:text-white"
          >
            <app-icono [nombre]="opcion.icono" class="h-5 w-5" />
            <span class="truncate" [class]="colapsado() ? 'lg:hidden' : ''">{{
              opcion.texto
            }}</span>
          </a>
        }
      </nav>
    </aside>

    <!-- ── Contenido ── -->
    <div
      class="min-h-screen transition-[padding] duration-300"
      [class]="colapsado() ? 'lg:pl-[4.75rem]' : 'lg:pl-64'"
    >
      <header
        class="no-imprimir sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6"
      >
        <button
          type="button"
          (click)="alternarMenu()"
          aria-label="Abrir o cerrar el menú"
          class="grid h-10 w-10 place-items-center rounded-lg text-slate-600 transition hover:bg-vino-50 hover:text-vino-800"
        >
          <app-icono nombre="menu" class="h-6 w-6" />
        </button>

        <div class="ml-auto flex items-center gap-2 sm:gap-3">
          <div
            class="hidden items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium md:flex"
            [class]="fechaSimulada() ? 'bg-amber-100 text-amber-900' : 'bg-vino-50 text-vino-800'"
          >
            <app-icono nombre="calendario" class="h-4 w-4" />
            @if (fechaSimulada(); as fecha) {
              <span>Fecha simulada: {{ fecha }}</span>
            } @else {
              <span>Fecha del sistema: {{ hoy }}</span>
            }
          </div>

          <div
            class="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 sm:flex"
          >
            <app-icono nombre="sede" class="h-4 w-4 text-vino-700" />
            <span>{{ trabajador()?.sedes?.nombre }}</span>
          </div>

          <div class="flex items-center gap-3 border-l border-slate-200 pl-3">
            <span
              class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-vino-700 text-xs font-bold text-white"
              aria-hidden="true"
              >{{ iniciales() }}</span
            >
            <div class="hidden leading-tight sm:block">
              <p class="max-w-40 truncate text-sm font-semibold text-slate-900">
                {{ trabajador()?.nombre }}
              </p>
              <p class="text-xs text-slate-500">{{ rolTexto() }}</p>
            </div>
            <button
              type="button"
              (click)="cerrarSesion()"
              class="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-vino-300 hover:bg-vino-50 hover:text-vino-800"
            >
              <app-icono nombre="salir" class="h-4 w-4" />
              <span class="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      <div class="mx-auto max-w-7xl space-y-2 px-4 pt-5 sm:px-6">
        <app-aviso tipo="advertencia" [mensaje]="avisoFechaSimulada()" />
        <app-aviso [mensaje]="error()" />
      </div>
      <main class="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6">
        <router-outlet />
      </main>
    </div>
  `,
})
export class Layout implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly demo = inject(DemoService);
  private readonly router = inject(Router);

  protected readonly exacta = EXACTA;
  protected readonly prefijo = PREFIJO;
  protected readonly hoy = FECHA_LARGA.format(new Date());
  protected readonly trabajador = this.auth.trabajador;
  protected readonly error = signal<string | null>(null);
  protected readonly colapsado = signal(menuColapsadoGuardado());
  protected readonly movilAbierto = signal(false);
  protected readonly opciones = computed(() =>
    OPCIONES.filter(
      (opcion) =>
        (!opcion.soloAdmin || this.auth.esAdmin()) && (!opcion.soloTrabajador || !this.auth.esAdmin()),
    ),
  );
  protected readonly fechaSimulada = computed(() => {
    const fecha = this.demo.fechaReferencia();
    return fecha ? formatearFecha(fecha) : null;
  });
  protected readonly avisoFechaSimulada = computed(() => {
    const fecha = this.demo.fechaReferencia();
    return fecha
      ? `Modo demostración: el sistema está usando la fecha simulada ${formatearFecha(fecha)}.`
      : null;
  });
  protected readonly iniciales = computed(() => {
    const palabras = (this.trabajador()?.nombre ?? '').trim().split(/\s+/).filter(Boolean);
    return (palabras[0]?.[0] ?? '') + (palabras[1]?.[0] ?? '');
  });
  protected readonly rolTexto = computed(() =>
    this.trabajador()?.rol === 'ADMIN' ? 'Administrador' : 'Trabajador',
  );

  async ngOnInit(): Promise<void> {
    try {
      await this.demo.cargarFechaReferencia();
    } catch (e) {
      this.error.set(mensajeDeError(e));
    }
  }

  /** En pantallas grandes pliega el menú a íconos; en pequeñas lo abre como panel superpuesto. */
  protected alternarMenu(): void {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      const nuevo = !this.colapsado();
      this.colapsado.set(nuevo);
      try {
        localStorage.setItem(CLAVE_MENU, nuevo ? '1' : '0');
      } catch {
        // sin almacenamiento: el menú vuelve a su estado inicial al recargar
      }
    } else {
      this.movilAbierto.update((abierto) => !abierto);
    }
  }

  protected async cerrarSesion(): Promise<void> {
    await this.auth.cerrarSesion();
    await this.router.navigateByUrl('/login');
  }
}
