import {
  Component,
  computed,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { Aviso } from '../components/aviso';
import { Icono } from '../components/icono';
import { EstadoSolicitud, Sede, SolicitudCapitalDetalle } from '../core/contrato';
import { formatearFecha, formatearMonto } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
import { hoyISO, limpiarCampo, limpiarTexto } from '../core/validaciones';
import { DemoService } from '../services/demo.service';
import { ReportesService } from '../services/reportes.service';
import { SolicitudesService } from '../services/solicitudes.service';

type FiltroEstado = '' | EstadoSolicitud;

const ESTADO_ESTILO: Record<EstadoSolicitud, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  APROBADA: 'bg-emerald-100 text-emerald-800',
  RECHAZADA: 'bg-red-100 text-red-800',
};
const ESTADO_TEXTO: Record<EstadoSolicitud, string> = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
};
const ACTUALIZAR_CADA_MS = 20_000;

const horaLima = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// Gestionar solicitudes (administrador): ve las solicitudes de capital de todos los trabajadores y las resuelve.
@Component({
  selector: 'app-pagina-gestionar-solicitudes',
  imports: [Aviso, Icono],
  template: `
    <div class="space-y-5">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-widest text-vino-700">
            Administración
          </p>
          <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Gestionar solicitudes
          </h1>
          <p class="mt-1 text-slate-500">
            Solicitudes de capital de todos los trabajadores y sedes. Apruébalas o recházalas.
          </p>
        </div>
        <button
          type="button"
          (click)="cargar()"
          [disabled]="cargando()"
          class="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-vino-300 hover:text-vino-800 disabled:opacity-50"
        >
          <app-icono nombre="reloj" class="h-4 w-4" />
          {{ cargando() ? 'Actualizando…' : 'Actualizar' }}
        </button>
      </header>

      <app-aviso [mensaje]="error()" />
      <app-aviso tipo="info" [mensaje]="exito()" />

      <!-- ── Indicadores ── -->
      <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de solicitudes">
        <article
          class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <span
            class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"
            ><app-icono nombre="reloj" class="h-6 w-6"
          /></span>
          <div>
            <p class="text-sm text-slate-500">Pendientes</p>
            <p id="kpi-pendientes" class="text-2xl font-bold text-slate-900">
              {{ resumen().pendientes }}
            </p>
            <p class="text-xs text-slate-400">{{ monto(resumen().montoPendiente) }} por resolver</p>
          </div>
        </article>
        <article
          class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <span
            class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"
            ><app-icono nombre="ok" class="h-6 w-6"
          /></span>
          <div>
            <p class="text-sm text-slate-500">Aprobadas</p>
            <p class="text-2xl font-bold text-slate-900">{{ resumen().aprobadas }}</p>
            <p class="text-xs text-slate-400">{{ monto(resumen().montoAprobado) }}</p>
          </div>
        </article>
        <article
          class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <span
            class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-red-100 text-red-700"
            ><app-icono nombre="cerrar" class="h-6 w-6"
          /></span>
          <div>
            <p class="text-sm text-slate-500">Rechazadas</p>
            <p class="text-2xl font-bold text-slate-900">{{ resumen().rechazadas }}</p>
            <p class="text-xs text-slate-400">{{ monto(resumen().montoRechazado) }}</p>
          </div>
        </article>
        <article
          class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <span
            class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-vino-100 text-vino-700"
            ><app-icono nombre="monedas" class="h-6 w-6"
          /></span>
          <div>
            <p class="text-sm text-slate-500">Capital aprobado</p>
            <p class="text-2xl font-bold text-slate-900">{{ monto(resumen().montoAprobado) }}</p>
            <p class="text-xs text-slate-400">Según los filtros de fecha y sede</p>
          </div>
        </article>
      </section>

      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(16rem,1fr)]">
        <!-- ── Filtros (un cuarto, a la derecha) ── -->
        <aside
          class="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1"
          aria-label="Filtros"
        >
          <div class="flex items-center justify-between">
            <h2 class="flex items-center gap-2 font-semibold text-slate-900">
              <app-icono nombre="demo" class="h-5 w-5 text-vino-700" /> Filtros
            </h2>
            <button
              type="button"
              (click)="limpiarFiltros()"
              class="text-sm font-medium text-vino-700 hover:text-vino-900"
            >
              Limpiar
            </button>
          </div>

          <div>
            <span class="block text-sm font-medium text-slate-700">Estado</span>
            <div
              class="mt-1.5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
              role="group"
              aria-label="Estado"
            >
              @for (e of estados; track e.valor) {
                <button
                  type="button"
                  (click)="fijarEstado(e.valor)"
                  [attr.aria-pressed]="estadoFiltro() === e.valor"
                  class="rounded-lg px-2 py-1.5 text-xs font-semibold transition"
                  [class]="
                    estadoFiltro() === e.valor
                      ? 'bg-vino-700 text-white shadow'
                      : 'text-slate-600 hover:bg-white'
                  "
                >
                  {{ e.texto }}
                </button>
              }
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="sel-sede-solicitudes"
              >Sede</label
            >
            <select
              id="sel-sede-solicitudes"
              (change)="cambiarSede($event)"
              class="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-vino-500 focus:ring-4 focus:ring-vino-100"
            >
              <option value="">Todas las sedes</option>
              @for (sede of sedes(); track sede.id) {
                <option [value]="sede.id" [selected]="sedeFiltro() === sede.id">
                  {{ sede.nombre }}
                </option>
              }
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="inp-fecha-solicitudes"
              >Jornada</label
            >
            <input
              id="inp-fecha-solicitudes"
              type="date"
              min="2020-01-01"
              max="2100-12-31"
              [value]="fechaFiltro()"
              (change)="cambiarFecha($event)"
              class="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-vino-500 focus:ring-4 focus:ring-vino-100"
            />
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                (click)="fijarFecha(hoy())"
                class="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-vino-300 hover:bg-vino-50 hover:text-vino-800"
              >
                Hoy
              </button>
              <button
                type="button"
                (click)="fijarFecha('')"
                class="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-vino-300 hover:bg-vino-50 hover:text-vino-800"
              >
                Todas
              </button>
            </div>
          </div>
        </aside>

        <!-- ── Tabla ── -->
        <section
          class="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-start-1 lg:row-start-1"
        >
          <div
            class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5"
          >
            <h2 class="flex items-center gap-2 font-semibold text-slate-900">
              <app-icono nombre="bandeja" class="h-5 w-5 text-vino-700" /> Solicitudes
            </h2>
            <p class="text-sm text-slate-500">{{ visibles().length }} resultado(s)</p>
          </div>
          @if (cargando() && solicitudes().length === 0) {
            <p class="px-6 py-16 text-center text-sm text-slate-400">Cargando solicitudes…</p>
          } @else if (visibles().length === 0) {
            <div class="px-6 py-16 text-center">
              <app-icono nombre="bandeja" class="mx-auto h-10 w-10 text-slate-300" />
              <p class="mt-3 font-medium text-slate-700">No hay solicitudes con esos filtros.</p>
              <p class="mt-1 text-sm text-slate-500">Cambia o limpia los filtros para ver más.</p>
            </div>
          } @else {
            <div
              class="max-h-[calc(100vh-24rem)] min-h-64 overflow-auto scroll-fino"
              [class.opacity-60]="cargando()"
            >
              <table class="min-w-full text-sm">
                <thead
                  class="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"
                >
                  <tr>
                    <th class="px-5 py-3 font-medium">Trabajador</th>
                    <th class="px-3 py-3 font-medium">Sede</th>
                    <th class="px-3 py-3 font-medium">Jornada</th>
                    <th class="px-3 py-3 text-right font-medium">Monto</th>
                    <th class="px-3 py-3 font-medium">Estado</th>
                    <th class="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (s of visibles(); track s.id) {
                    <tr class="transition hover:bg-vino-50/40">
                      <td class="px-5 py-2.5">
                        <p class="font-medium text-slate-900">{{ s.solicitante?.nombre ?? '—' }}</p>
                        <p class="text-xs text-slate-500">
                          {{ hora(s.creado_en) }}
                          @if (s.comentario) {
                            · «{{ s.comentario }}»
                          }
                        </p>
                      </td>
                      <td class="whitespace-nowrap px-3 py-2.5 text-slate-700">
                        {{ s.sedes?.nombre ?? '—' }}
                      </td>
                      <td class="whitespace-nowrap px-3 py-2.5 text-slate-700">
                        {{ fecha(s.fecha) }}
                      </td>
                      <td
                        class="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-slate-900"
                      >
                        {{ monto(s.monto) }}
                      </td>
                      <td class="px-3 py-2.5">
                        <span
                          class="rounded-full px-2.5 py-1 text-xs font-semibold"
                          [class]="estiloEstado(s.estado)"
                          >{{ textoEstado(s.estado) }}</span
                        >
                      </td>
                      <td class="whitespace-nowrap px-5 py-2.5 text-right">
                        <button
                          type="button"
                          (click)="abrir(s)"
                          class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                          [class]="
                            s.estado === 'PENDIENTE'
                              ? 'bg-vino-700 text-white hover:bg-vino-800'
                              : 'border border-slate-300 text-slate-700 hover:border-vino-300 hover:bg-vino-50 hover:text-vino-800'
                          "
                        >
                          <app-icono
                            [nombre]="s.estado === 'PENDIENTE' ? 'escudo' : 'ojo'"
                            class="h-4 w-4"
                          />
                          {{ s.estado === 'PENDIENTE' ? 'Resolver' : 'Ver' }}
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      </div>

      <!-- ── Ventana: resolver una solicitud ── -->
      @if (abierta(); as s) {
        <div
          class="animar-aparece fixed inset-0 z-50 flex items-center justify-center bg-vino-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Solicitud de capital"
        >
          <button
            type="button"
            tabindex="-1"
            aria-label="Cerrar"
            (click)="cerrar()"
            class="absolute inset-0 h-full w-full cursor-default"
          ></button>
          <div class="animar-paso relative w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-widest text-vino-700">
                  Solicitud de capital
                </p>
                <h2 class="text-xl font-bold text-slate-900">
                  {{ s.solicitante?.nombre ?? 'Trabajador' }}
                </h2>
                <p class="text-sm text-slate-500">
                  {{ s.sedes?.nombre }} · jornada {{ fecha(s.fecha) }} · {{ hora(s.creado_en) }}
                </p>
              </div>
              <button
                type="button"
                (click)="cerrar()"
                aria-label="Cerrar"
                class="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-vino-50 hover:text-vino-800"
              >
                <app-icono nombre="cerrar" class="h-5 w-5" />
              </button>
            </div>

            <div class="mt-5 rounded-xl bg-vino-50/60 p-5 text-center">
              <p class="text-sm text-vino-800">Monto solicitado</p>
              <p id="monto-solicitud" class="text-4xl font-bold tracking-tight text-vino-900">
                {{ monto(s.monto) }}
              </p>
              <p class="mt-1 text-xs text-slate-500">
                Total pedido por este trabajador ese día (sin rechazadas):
                {{ monto(totalDelDia(s)) }} de {{ monto(limite) }}
              </p>
            </div>

            @if (s.comentario) {
              <p class="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <span class="font-medium">Nota del trabajador:</span> {{ s.comentario }}
              </p>
            }

            <app-aviso [mensaje]="errorResolver()" />

            @if (s.estado === 'PENDIENTE') {
              <div class="mt-5">
                <label class="block text-sm font-medium text-slate-700" for="inp-nota-admin"
                  >Comentario <span class="text-slate-400">(opcional)</span></label
                >
                <input
                  id="inp-nota-admin"
                  type="text"
                  maxlength="200"
                  autocomplete="off"
                  placeholder="Ej. Aprobado para la jornada"
                  [value]="notaAdmin()"
                  (input)="notaAdmin.set(limpiarNota($event))"
                  [disabled]="resolviendo()"
                  class="mt-1.5 block w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-vino-500 focus:ring-4 focus:ring-vino-100 disabled:bg-slate-50"
                />
              </div>
              <div class="mt-6 flex gap-3">
                <button
                  id="btn-rechazar-solicitud"
                  type="button"
                  (click)="resolver(s, false)"
                  [disabled]="resolviendo()"
                  class="flex-1 rounded-xl border border-red-300 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                >
                  {{ resolviendo() === 'rechazar' ? 'Rechazando…' : 'Rechazar' }}
                </button>
                <button
                  id="btn-aprobar-solicitud"
                  type="button"
                  (click)="resolver(s, true)"
                  [disabled]="resolviendo()"
                  class="flex-1 rounded-xl bg-vino-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-vino-700/25 transition hover:bg-vino-800 disabled:opacity-50 disabled:shadow-none"
                >
                  {{ resolviendo() === 'aprobar' ? 'Aprobando…' : 'Aprobar' }}
                </button>
              </div>
            } @else {
              <div class="mt-5 rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
                <span
                  class="rounded-full px-2.5 py-1 text-xs font-semibold"
                  [class]="estiloEstado(s.estado)"
                  >{{ textoEstado(s.estado) }}</span
                >
                por <strong>{{ s.resolutor?.nombre ?? '—' }}</strong>
                @if (s.resuelto_en) {
                  el {{ fecha(s.resuelto_en) }} a las {{ hora(s.resuelto_en) }}
                }
                @if (s.comentario_admin) {
                  <p class="mt-2 text-slate-600">«{{ s.comentario_admin }}»</p>
                }
              </div>
              <button
                type="button"
                (click)="cerrar()"
                class="mt-5 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cerrar
              </button>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class GestionarSolicitudes implements OnInit, OnDestroy {
  private readonly svc = inject(SolicitudesService);
  private readonly reportes = inject(ReportesService);
  private readonly demo = inject(DemoService);
  private temporizador: ReturnType<typeof setInterval> | undefined;
  /** Número de la última consulta: una respuesta vieja no pisa a la nueva. */
  private consulta = 0;

  protected readonly estados: { valor: FiltroEstado; texto: string }[] = [
    { valor: 'PENDIENTE', texto: 'Pendientes' },
    { valor: '', texto: 'Todas' },
    { valor: 'APROBADA', texto: 'Aprobadas' },
    { valor: 'RECHAZADA', texto: 'Rechazadas' },
  ];
  protected readonly limite = 50000;
  protected readonly solicitudes = signal<SolicitudCapitalDetalle[]>([]);
  protected readonly sedes = signal<Sede[]>([]);
  protected readonly estadoFiltro = signal<FiltroEstado>('PENDIENTE');
  protected readonly sedeFiltro = signal<number | null>(null);
  protected readonly fechaFiltro = signal('');
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly exito = signal<string | null>(null);
  protected readonly abierta = signal<SolicitudCapitalDetalle | null>(null);
  protected readonly notaAdmin = signal('');
  protected readonly resolviendo = signal<'aprobar' | 'rechazar' | null>(null);
  protected readonly errorResolver = signal<string | null>(null);

  protected readonly monto = formatearMonto;
  protected readonly fecha = formatearFecha;
  protected readonly limpiarNota = (evento: Event): string =>
    limpiarCampo(evento, (valor) => limpiarTexto(valor, 200));

  protected readonly visibles = computed(() => {
    const estado = this.estadoFiltro();
    return estado ? this.solicitudes().filter((s) => s.estado === estado) : this.solicitudes();
  });

  /** Indicadores sobre lo cargado (filtros de sede y jornada), sin importar el filtro de estado. */
  protected readonly resumen = computed(() => {
    const total = (estado: EstadoSolicitud) =>
      this.solicitudes().filter((s) => s.estado === estado);
    const suma = (filas: SolicitudCapitalDetalle[]) =>
      filas.reduce((acc, s) => acc + Math.round(Number(s.monto) * 100), 0) / 100;
    const p = total('PENDIENTE');
    const a = total('APROBADA');
    const r = total('RECHAZADA');
    return {
      pendientes: p.length,
      montoPendiente: suma(p),
      aprobadas: a.length,
      montoAprobado: suma(a),
      rechazadas: r.length,
      montoRechazado: suma(r),
    };
  });

  async ngOnInit(): Promise<void> {
    try {
      this.sedes.set(await this.reportes.sedes());
    } catch (e) {
      this.error.set(mensajeDeError(e));
    }
    await this.cargar();
    // Se actualiza sola para que las solicitudes nuevas aparezcan sin recargar
    this.temporizador = setInterval(() => {
      if (!this.abierta() && !this.cargando()) void this.cargar();
    }, ACTUALIZAR_CADA_MS);
  }

  ngOnDestroy(): void {
    clearInterval(this.temporizador);
  }

  @HostListener('document:keydown.escape')
  protected alPulsarEscape(): void {
    if (this.abierta() && !this.resolviendo()) this.cerrar();
  }

  /** Fecha de hoy: la simulada del modo demostración si hay una; si no, la del navegador. */
  protected hoy(): string {
    return this.demo.fechaReferencia() || hoyISO();
  }

  protected async cargar(): Promise<void> {
    const numero = ++this.consulta;
    this.cargando.set(true);
    try {
      const filas = await this.svc.listar({
        sedeId: this.sedeFiltro() ?? undefined,
        fecha: this.fechaFiltro() || undefined,
      });
      if (numero !== this.consulta) return;
      this.solicitudes.set(filas);
      this.error.set(null);
    } catch (e) {
      if (numero === this.consulta) this.error.set(mensajeDeError(e));
    } finally {
      if (numero === this.consulta) this.cargando.set(false);
    }
  }

  protected fijarEstado(valor: FiltroEstado): void {
    this.estadoFiltro.set(valor);
  }

  protected cambiarSede(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.sedeFiltro.set(valor ? Number(valor) : null);
    void this.cargar();
  }

  protected cambiarFecha(evento: Event): void {
    this.fijarFecha((evento.target as HTMLInputElement).value);
  }

  protected fijarFecha(valor: string): void {
    this.fechaFiltro.set(valor);
    void this.cargar();
  }

  protected limpiarFiltros(): void {
    this.estadoFiltro.set('PENDIENTE');
    this.sedeFiltro.set(null);
    this.fechaFiltro.set('');
    void this.cargar();
  }

  protected abrir(solicitud: SolicitudCapitalDetalle): void {
    this.notaAdmin.set('');
    this.errorResolver.set(null);
    this.abierta.set(solicitud);
  }

  protected cerrar(): void {
    this.abierta.set(null);
  }

  /** Lo que ese trabajador lleva pedido ese día (pendientes y aprobadas). */
  protected totalDelDia(s: SolicitudCapitalDetalle): number {
    return (
      this.solicitudes()
        .filter(
          (x) =>
            x.trabajador_id === s.trabajador_id && x.fecha === s.fecha && x.estado !== 'RECHAZADA',
        )
        .reduce((acc, x) => acc + Math.round(Number(x.monto) * 100), 0) / 100
    );
  }

  protected async resolver(s: SolicitudCapitalDetalle, aprobar: boolean): Promise<void> {
    if (this.resolviendo()) return;
    this.resolviendo.set(aprobar ? 'aprobar' : 'rechazar');
    this.errorResolver.set(null);
    try {
      await this.svc.resolver(s.id, aprobar, this.notaAdmin().trim() || null);
      this.abierta.set(null);
      this.exito.set(
        `Solicitud de ${s.solicitante?.nombre ?? 'trabajador'} por ${formatearMonto(s.monto)} ${aprobar ? 'aprobada' : 'rechazada'}.`,
      );
      await this.cargar();
    } catch (e) {
      this.errorResolver.set(mensajeDeError(e));
      await this.cargar(); // por si otro administrador ya la resolvió
    } finally {
      this.resolviendo.set(null);
    }
  }

  protected estiloEstado(e: EstadoSolicitud): string {
    return ESTADO_ESTILO[e];
  }
  protected textoEstado(e: EstadoSolicitud): string {
    return ESTADO_TEXTO[e];
  }
  protected hora(iso: string): string {
    return horaLima.format(new Date(iso));
  }
}
