import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Aviso } from '../components/aviso';
import { Icono, NombreIcono } from '../components/icono';
import { PrestamoListado } from '../core/contrato';
import { FechaPipe, formatearMonto, MontoPipe } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
import { AuthService } from '../services/auth.service';
import { InicioService, ResumenInicio } from '../services/inicio.service';
import { PrestamosService } from '../services/prestamos.service';

interface Tarjeta {
  titulo: string;
  valor: string;
  detalle: string;
  icono: NombreIcono;
  tono: string;
}

// Pantalla de inicio: resumen de la cartera y accesos directos. Solo lectura.
@Component({
  selector: 'app-pagina-inicio',
  imports: [RouterLink, Aviso, Icono, MontoPipe, FechaPipe],
  template: `
    <div class="space-y-6">
      <!-- ── Bienvenida ── -->
      <section
        class="animar-aparece relative overflow-hidden rounded-2xl bg-linear-to-br from-vino-800 via-vino-800 to-vino-950 px-6 py-7 text-white shadow-lg sm:px-9 sm:py-9"
      >
        <svg
          class="pointer-events-none absolute inset-y-0 right-0 h-full opacity-15"
          viewBox="0 0 400 200"
          preserveAspectRatio="xMaxYMid slice"
          aria-hidden="true"
        >
          <circle cx="330" cy="40" r="150" fill="none" stroke="white" stroke-width="1.5" />
          <circle cx="330" cy="40" r="100" fill="none" stroke="white" stroke-width="1.5" />
          <circle cx="380" cy="190" r="120" fill="none" stroke="white" stroke-width="1.5" />
        </svg>
        <div class="relative flex flex-wrap items-center justify-between gap-6">
          <div class="max-w-xl">
            <h1 class="text-3xl font-bold tracking-tight">Hola, {{ primerNombre() }}</h1>
            <p class="mt-1 text-lg font-medium text-vino-100">
              Bienvenido al Sistema de Gestión de Préstamos
            </p>
            <p class="mt-2 text-sm text-vino-200">
              {{
                esAdmin()
                  ? 'Gestiona clientes, evalúa y otorga préstamos con reglas de crédito uniformes en todas las sedes.'
                  : 'Resumen de ' +
                    nombreSede() +
                    '. Los clientes y préstamos de las demás sedes están en Clientes y Préstamos.'
              }}
            </p>
          </div>
          <div class="flex flex-wrap gap-3">
            <a
              routerLink="/clientes"
              [queryParams]="{ nuevo: 1 }"
              class="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-vino-800 shadow transition hover:bg-vino-50"
            >
              <app-icono nombre="mas" class="h-5 w-5" /> Registrar cliente
            </a>
            <a
              routerLink="/prestamos/nuevo"
              class="flex items-center gap-2 rounded-xl border border-white/40 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <app-icono nombre="prestamoNuevo" class="h-5 w-5" /> Nuevo préstamo
            </a>
          </div>
        </div>
      </section>

      <app-aviso [mensaje]="error()" />

      <!-- ── Indicadores ── -->
      <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores">
        @for (t of tarjetas(); track t.titulo) {
          <article
            class="animar-paso flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <span class="grid h-12 w-12 shrink-0 place-items-center rounded-xl" [class]="t.tono">
              <app-icono [nombre]="t.icono" class="h-6 w-6" />
            </span>
            <div class="min-w-0">
              <p class="text-sm text-slate-500">{{ t.titulo }}</p>
              <p class="truncate text-2xl font-bold text-slate-900">
                {{ cargando() ? '…' : t.valor }}
              </p>
              <p class="truncate text-xs text-slate-400">{{ t.detalle }}</p>
            </div>
          </article>
        }
      </section>

      <div class="grid gap-6 lg:grid-cols-5">
        <!-- ── Préstamos por sede ── -->
        <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3">
          <div class="flex items-center gap-3">
            <app-icono nombre="reportes" class="h-5 w-5 text-vino-700" />
            <h2 class="font-semibold text-slate-900">{{ tituloBarras() }}</h2>
          </div>
          @if (resumen(); as r) {
            @if (barras().length === 0) {
              <p class="py-10 text-center text-sm text-slate-400">
                Todavía no hay préstamos registrados.
              </p>
            } @else {
              <ul class="mt-6 space-y-4">
                @for (s of barras(); track s.sede) {
                  <li>
                    <div class="flex items-center justify-between text-sm">
                      <span class="font-medium text-slate-700">{{ s.sede }}</span>
                      <span class="font-semibold text-slate-900">{{ s.total }}</span>
                    </div>
                    <div class="mt-1.5 h-3 overflow-hidden rounded-full bg-vino-50">
                      <div
                        class="h-full rounded-full bg-linear-to-r from-vino-700 to-vino-500 transition-[width] duration-700"
                        [style.width.%]="(s.total / maxSede()) * 100"
                      ></div>
                    </div>
                  </li>
                }
              </ul>
            }
          } @else {
            <p class="py-10 text-center text-sm text-slate-400">Cargando…</p>
          }
        </section>

        <!-- ── Estado de clientes ── -->
        <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div class="flex items-center gap-3">
            <app-icono nombre="clientes" class="h-5 w-5 text-vino-700" />
            <h2 class="font-semibold text-slate-900">Estado de clientes</h2>
          </div>
          @if (resumen(); as r) {
            <div class="mt-6 flex flex-wrap items-center justify-center gap-6">
              <div
                class="relative grid h-40 w-40 shrink-0 place-items-center rounded-full"
                [style.background]="dona()"
                role="img"
                [attr.aria-label]="'Clientes por estado: ' + r.clientes.total + ' en total'"
              >
                <div class="grid h-24 w-24 place-items-center rounded-full bg-white text-center">
                  <div>
                    <p class="text-2xl font-bold text-slate-900">{{ r.clientes.total }}</p>
                    <p class="text-xs text-slate-500">clientes</p>
                  </div>
                </div>
              </div>
              <ul class="space-y-2.5 text-sm">
                @for (e of estados(); track e.texto) {
                  <li class="flex items-center gap-3">
                    <span class="h-3 w-3 rounded-full" [style.background]="e.color"></span>
                    <span class="w-28 text-slate-600">{{ e.texto }}</span>
                    <span class="font-semibold text-slate-900">{{ e.valor }}</span>
                  </li>
                }
              </ul>
            </div>
          } @else {
            <p class="py-10 text-center text-sm text-slate-400">Cargando…</p>
          }
        </section>
      </div>

      <!-- ── Últimos préstamos ── -->
      <section class="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div class="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div class="flex items-center gap-3">
            <app-icono nombre="documento" class="h-5 w-5 text-vino-700" />
            <h2 class="font-semibold text-slate-900">
              {{ esAdmin() ? 'Últimos préstamos registrados' : 'Últimos préstamos de mi sede' }}
            </h2>
          </div>
          <a
            routerLink="/prestamos"
            class="flex items-center gap-1.5 text-sm font-medium text-vino-700 hover:text-vino-900"
          >
            Ver todos <app-icono nombre="flechaDer" class="h-4 w-4" />
          </a>
        </div>
        @if (ultimos().length === 0) {
          <p class="px-6 py-10 text-center text-sm text-slate-400">
            {{ cargando() ? 'Cargando…' : 'Todavía no hay préstamos registrados.' }}
          </p>
        } @else {
          <div class="overflow-x-auto scroll-fino">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-6 py-3 font-medium">Cliente</th>
                  <th class="px-4 py-3 font-medium">DNI</th>
                  <th class="px-4 py-3 text-right font-medium">Monto</th>
                  <th class="px-4 py-3 font-medium">Plazo</th>
                  <th class="px-4 py-3 font-medium">Sede</th>
                  <th class="px-4 py-3 font-medium">Estado</th>
                  <th class="px-4 py-3 font-medium">Fecha</th>
                  <th class="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (p of ultimos(); track p.id) {
                  <tr class="transition hover:bg-vino-50/40">
                    <td class="px-6 py-3 font-medium text-slate-900">
                      {{ p.clientes.nombres }} {{ p.clientes.apellidos }}
                    </td>
                    <td class="px-4 py-3 font-mono text-slate-600">{{ p.clientes.dni }}</td>
                    <td class="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-900">
                      {{ p.monto | monto }}
                    </td>
                    <td class="whitespace-nowrap px-4 py-3 text-slate-600">
                      {{ p.plazo_meses }} meses
                    </td>
                    <td class="whitespace-nowrap px-4 py-3 text-slate-600">
                      {{ p.sedes?.nombre ?? '—' }}
                    </td>
                    <td class="px-4 py-3">
                      <span
                        class="rounded-full px-2.5 py-1 text-xs font-semibold"
                        [class]="
                          p.estado === 'VIGENTE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        "
                        >{{ p.estado === 'VIGENTE' ? 'Vigente' : 'Cancelado' }}</span
                      >
                    </td>
                    <td class="whitespace-nowrap px-4 py-3 text-slate-600">
                      {{ p.fecha_desembolso | fecha }}
                    </td>
                    <td class="px-6 py-3 text-right">
                      <a
                        routerLink="/prestamos"
                        [queryParams]="{ id: p.id }"
                        class="font-medium text-vino-700 hover:text-vino-900"
                        >Ver detalle</a
                      >
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>
  `,
})
export class Inicio implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly inicio = inject(InicioService);
  private readonly prestamos = inject(PrestamosService);

  protected readonly resumen = signal<ResumenInicio | null>(null);
  protected readonly ultimos = signal<PrestamoListado[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly primerNombre = computed(() => {
    const nombre = this.auth.trabajador()?.nombre ?? '';
    return nombre.trim().split(/\s+/)[0] || 'bienvenido';
  });

  protected readonly esAdmin = this.auth.esAdmin;
  /** Un trabajador ve la situación de su sede; el administrador, la de todas (y la comparación entre sedes). */
  protected readonly sedeId = computed(() =>
    this.auth.esAdmin() ? null : (this.auth.trabajador()?.sede_id ?? null),
  );
  protected readonly nombreSede = computed(
    () => this.auth.trabajador()?.sedes?.nombre ?? 'mi sede',
  );
  protected readonly alcance = computed(() =>
    this.esAdmin() ? 'En todas las sedes' : this.nombreSede(),
  );
  protected readonly tituloBarras = computed(() =>
    this.esAdmin() ? 'Préstamos otorgados por sede' : 'Cartera de ' + this.nombreSede(),
  );
  /** Administrador: préstamos por sede. Trabajador: vigentes y cancelados de su sede. */
  protected readonly barras = computed(() => {
    const r = this.resumen();
    if (!r) return [];
    if (this.esAdmin()) return r.prestamos.porSede;
    return [
      { sede: 'Vigentes', total: r.prestamos.vigentes },
      { sede: 'Cancelados', total: r.prestamos.total - r.prestamos.vigentes },
    ];
  });

  protected readonly maxSede = computed(() => Math.max(1, ...this.barras().map((s) => s.total)));

  protected readonly tarjetas = computed<Tarjeta[]>(() => {
    const r = this.resumen();
    return [
      {
        titulo: 'Clientes registrados',
        valor: String(r?.clientes.total ?? 0),
        detalle: this.alcance(),
        icono: 'clientes',
        tono: 'bg-vino-100 text-vino-700',
      },
      {
        titulo: 'Préstamos vigentes',
        valor: String(r?.prestamos.vigentes ?? 0),
        detalle: `${r?.prestamos.total ?? 0} registrados en total`,
        icono: 'documento',
        tono: 'bg-rose-100 text-rose-700',
      },
      {
        titulo: 'Monto en préstamos vigentes',
        valor: formatearMonto(r?.prestamos.montoVigente ?? 0),
        detalle: 'Suma de lo desembolsado',
        icono: 'monedas',
        tono: 'bg-amber-100 text-amber-700',
      },
      {
        titulo: 'Clientes con atraso',
        valor: String((r?.clientes.morosos ?? 0) + (r?.clientes.extrajudiciales ?? 0)),
        detalle: `${r?.clientes.morosos ?? 0} morosos · ${r?.clientes.extrajudiciales ?? 0} extrajudiciales`,
        icono: 'alerta',
        tono: 'bg-red-100 text-red-700',
      },
    ];
  });

  protected readonly estados = computed(() => {
    const c = this.resumen()?.clientes;
    return [
      { texto: 'Al día', valor: c?.alDia ?? 0, color: '#059669' },
      { texto: 'Morosos', valor: c?.morosos ?? 0, color: '#f59e0b' },
      { texto: 'Extrajudiciales', valor: c?.extrajudiciales ?? 0, color: '#dc2626' },
    ];
  });

  /** Fondo cónico del anillo: un tramo por estado, proporcional a su cantidad. */
  protected readonly dona = computed(() => {
    const total = this.resumen()?.clientes.total ?? 0;
    if (total === 0) return '#e2e8f0';
    let acumulado = 0;
    const tramos = this.estados()
      .filter((e) => e.valor > 0)
      .map((e) => {
        const desde = (acumulado / total) * 100;
        acumulado += e.valor;
        return `${e.color} ${desde}% ${(acumulado / total) * 100}%`;
      });
    return `conic-gradient(${tramos.join(', ')})`;
  });

  async ngOnInit(): Promise<void> {
    try {
      const [resumen, ultimos] = await Promise.all([
        this.inicio.resumen(this.sedeId()),
        this.prestamos.listar({ sedeId: this.sedeId() ?? undefined }, 5),
      ]);
      this.resumen.set(resumen);
      this.ultimos.set(ultimos);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }
}
