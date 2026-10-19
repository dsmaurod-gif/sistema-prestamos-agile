import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Aviso } from '../components/aviso';
import { Icono } from '../components/icono';
import { EstadoSolicitud, ResumenCapitalDia, SolicitudCapitalDetalle } from '../core/contrato';
import { formatearFecha, formatearMonto } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
import { limpiarCampo, limpiarMonto, limpiarTexto } from '../core/validaciones';
import { SolicitudesService } from '../services/solicitudes.service';

type Vista = 'lista' | 'nueva' | 'exito';

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
const MONTOS_RAPIDOS = [5000, 10000, 25000];
const ACTUALIZAR_CADA_MS = 30_000;

const horaLima = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// Solicitud de capital (trabajador): pide el saldo del día, hasta el límite diario, en una o varias solicitudes.
@Component({
  selector: 'app-pagina-solicitud-capital',
  imports: [FormsModule, Aviso, Icono],
  template: `
    <div class="space-y-6">
      <!-- ── Encabezado ── -->
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-widest text-vino-700">Jornada</p>
          <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Solicitud de capital
          </h1>
          <p class="mt-1 text-slate-500">
            {{
              vista() === 'lista'
                ? 'Pide el saldo para los préstamos del día. Puedes hacerlo en varias solicitudes, sin pasar del límite diario.'
                : 'Indica cuánto necesitas para hoy. El administrador la aprobará o la rechazará.'
            }}
          </p>
        </div>
        @if (vista() === 'lista') {
          <button
            id="btn-nueva-solicitud"
            type="button"
            (click)="abrirNueva()"
            [disabled]="!resumen() || resumen()!.disponible_solicitar <= 0"
            class="flex items-center gap-2 rounded-xl bg-vino-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-vino-700/25 transition hover:bg-vino-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            <app-icono nombre="mas" class="h-5 w-5" /> Nueva solicitud
          </button>
        } @else {
          <button
            id="btn-volver-solicitudes"
            type="button"
            (click)="volverALista()"
            class="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-vino-300 hover:text-vino-800"
          >
            <app-icono nombre="flechaIzq" class="h-4 w-4" /> Volver a mis solicitudes
          </button>
        }
      </header>

      <app-aviso [mensaje]="errorCarga()" />

      <!-- ── Indicadores del día ── -->
      @if (resumen(); as r) {
        <section class="animar-aparece grid gap-4 sm:grid-cols-3" aria-label="Capital del día">
          <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-3">
            <div class="flex items-center justify-between text-sm">
              <span class="text-slate-500">Solicitado hoy</span>
              <span class="font-semibold text-slate-900"
                >{{ monto(r.solicitado) }}
                <span class="font-normal text-slate-400">de {{ monto(r.limite) }}</span></span
              >
            </div>
            <div
              class="mt-3 h-3 overflow-hidden rounded-full bg-vino-50"
              role="progressbar"
              [attr.aria-valuenow]="porcentajeUsado()"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                class="h-full rounded-full bg-linear-to-r from-vino-700 to-vino-500 transition-[width] duration-700"
                [style.width.%]="porcentajeUsado()"
              ></div>
            </div>
            <p class="mt-2 text-xs text-slate-400">
              Límite diario por trabajador. Lo rechazado vuelve a quedar disponible.
            </p>
          </article>
          <article
            class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <span
              class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"
              ><app-icono nombre="ok" class="h-6 w-6"
            /></span>
            <div>
              <p class="text-sm text-slate-500">Aprobado</p>
              <p id="capital-aprobado" class="text-xl font-bold text-slate-900">
                {{ monto(r.aprobado) }}
              </p>
              <p class="text-xs text-slate-400">{{ monto(r.pendiente) }} pendiente</p>
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
              <p class="text-sm text-slate-500">Saldo para préstamos</p>
              <p id="capital-saldo" class="text-xl font-bold text-slate-900">
                {{ monto(r.saldo_disponible) }}
              </p>
              <p class="text-xs text-slate-400">
                Aprobado − prestado hoy ({{ monto(r.desembolsado) }})
              </p>
            </div>
          </article>
          <article
            class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <span
              class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"
              ><app-icono nombre="reloj" class="h-6 w-6"
            /></span>
            <div>
              <p class="text-sm text-slate-500">Aún puedes pedir</p>
              <p id="capital-disponible" class="text-xl font-bold text-slate-900">
                {{ monto(r.disponible_solicitar) }}
              </p>
              <p class="text-xs text-slate-400">Hasta completar el límite</p>
            </div>
          </article>
        </section>
      }

      <!-- ════════ MIS SOLICITUDES ════════ -->
      @if (vista() === 'lista') {
        <section
          class="animar-aparece overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div
            class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-6 py-4"
          >
            <h2 class="flex items-center gap-2 font-semibold text-slate-900">
              <app-icono nombre="bandeja" class="h-5 w-5 text-vino-700" /> Mis solicitudes
            </h2>
            <button
              type="button"
              (click)="cargar()"
              [disabled]="cargando()"
              class="text-sm font-medium text-vino-700 hover:text-vino-900 disabled:opacity-50"
            >
              {{ cargando() ? 'Actualizando…' : 'Actualizar' }}
            </button>
          </div>
          @if (cargando() && solicitudes().length === 0) {
            <p class="px-6 py-14 text-center text-slate-400">Cargando solicitudes…</p>
          } @else if (solicitudes().length === 0) {
            <div class="px-6 py-14 text-center">
              <app-icono nombre="bandeja" class="mx-auto h-10 w-10 text-slate-300" />
              <p class="mt-3 font-medium text-slate-700">Todavía no has hecho solicitudes.</p>
              <p class="mt-1 text-sm text-slate-500">
                Al empezar la jornada, pide el saldo que necesitas con «Nueva solicitud».
              </p>
            </div>
          } @else {
            <div class="max-h-[calc(100vh-24rem)] min-h-48 overflow-auto scroll-fino">
              <table class="min-w-full text-sm">
                <thead
                  class="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"
                >
                  <tr>
                    <th class="px-6 py-3 font-medium">Jornada</th>
                    <th class="px-4 py-3 font-medium">Hora</th>
                    <th class="px-4 py-3 text-right font-medium">Monto</th>
                    <th class="px-4 py-3 font-medium">Estado</th>
                    <th class="px-6 py-3 font-medium">Detalle</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (s of solicitudes(); track s.id) {
                    <tr class="transition hover:bg-vino-50/40">
                      <td class="whitespace-nowrap px-6 py-3 text-slate-700">
                        {{ fecha(s.fecha) }}
                      </td>
                      <td class="whitespace-nowrap px-4 py-3 text-slate-500">
                        {{ hora(s.creado_en) }}
                      </td>
                      <td
                        class="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900"
                      >
                        {{ monto(s.monto) }}
                      </td>
                      <td class="px-4 py-3">
                        <span
                          class="rounded-full px-2.5 py-1 text-xs font-semibold"
                          [class]="estiloEstado(s.estado)"
                          >{{ textoEstado(s.estado) }}</span
                        >
                      </td>
                      <td class="px-6 py-3 text-slate-600">
                        @if (s.comentario) {
                          <p>Tu nota: {{ s.comentario }}</p>
                        }
                        @if (s.resolutor) {
                          <p class="text-xs text-slate-500">
                            {{ textoEstado(s.estado) }} por {{ s.resolutor.nombre }}
                            @if (s.comentario_admin) {
                              · «{{ s.comentario_admin }}»
                            }
                          </p>
                        } @else if (!s.comentario) {
                          <span class="text-slate-400">—</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }

      <!-- ════════ NUEVA SOLICITUD ════════ -->
      @if (vista() === 'nueva') {
        <form
          (ngSubmit)="enviar()"
          class="animar-paso mx-auto max-w-2xl space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
          novalidate
        >
          <div>
            <h2 class="text-xl font-bold text-slate-900">¿Cuánto capital necesitas hoy?</h2>
            <p class="mt-1 text-sm text-slate-500">
              Puedes pedir hasta
              <strong class="text-slate-800">{{
                monto(resumen()?.disponible_solicitar ?? 0)
              }}</strong>
              más en esta jornada.
            </p>
          </div>

          <app-aviso [mensaje]="errorEnvio()" />

          <div>
            <label class="block text-sm font-medium text-slate-700" for="inp-monto-solicitud"
              >Monto a solicitar (S/)</label
            >
            <div
              class="mt-1.5 flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 transition focus-within:border-vino-500 focus-within:ring-4 focus-within:ring-vino-100"
            >
              <span class="font-semibold text-slate-400">S/</span>
              <input
                id="inp-monto-solicitud"
                type="text"
                inputmode="decimal"
                maxlength="9"
                autocomplete="off"
                placeholder="0.00"
                [value]="montoTexto()"
                (input)="cambiarMonto($event)"
                [disabled]="enviando()"
                class="w-full bg-transparent py-3.5 text-xl font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-300"
              />
            </div>
            @if (errorMonto(); as e) {
              <p class="mt-1.5 text-xs text-red-600">{{ e }}</p>
            }
            <div class="mt-3 flex flex-wrap gap-2">
              @for (m of montosRapidos(); track m) {
                <button
                  type="button"
                  (click)="fijarMonto(m)"
                  [disabled]="enviando()"
                  class="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-vino-300 hover:bg-vino-50 hover:text-vino-800 disabled:opacity-50"
                >
                  {{ monto(m) }}
                </button>
              }
              <button
                type="button"
                (click)="fijarMonto(resumen()?.disponible_solicitar ?? 0)"
                [disabled]="enviando()"
                class="rounded-lg border border-vino-300 bg-vino-50 px-3.5 py-1.5 text-xs font-semibold text-vino-800 transition hover:bg-vino-100 disabled:opacity-50"
              >
                Todo lo disponible
              </button>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="inp-nota-solicitud"
              >Nota para el administrador <span class="text-slate-400">(opcional)</span></label
            >
            <input
              id="inp-nota-solicitud"
              type="text"
              maxlength="200"
              autocomplete="off"
              placeholder="Ej. Apertura de jornada"
              [value]="nota()"
              (input)="nota.set(limpiarNota($event))"
              [disabled]="enviando()"
              class="mt-1.5 block w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-vino-500 focus:ring-4 focus:ring-vino-100 disabled:bg-slate-50"
            />
          </div>

          @if (montoValido() > 0 && !errorMonto()) {
            <div
              class="animar-aparece rounded-xl border border-vino-200 bg-vino-50/60 p-4 text-sm text-vino-900"
            >
              Después de esta solicitud llevarás
              <strong>{{ monto((resumen()?.solicitado ?? 0) + montoValido()) }}</strong>
              de {{ monto(resumen()?.limite ?? 0) }}. Quedará <strong>pendiente</strong> hasta que
              el administrador la resuelva.
            </div>
          }

          <div class="flex gap-3 pt-1">
            <button
              type="button"
              (click)="volverALista()"
              [disabled]="enviando()"
              class="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              id="btn-enviar-solicitud"
              type="submit"
              [disabled]="enviando() || montoValido() <= 0 || !!errorMonto()"
              class="flex-1 rounded-xl bg-vino-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-vino-700/25 transition hover:bg-vino-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {{ enviando() ? 'Enviando…' : 'Enviar solicitud' }}
            </button>
          </div>
        </form>
      }

      <!-- ════════ ENVIADA ════════ -->
      @if (vista() === 'exito') {
        <div
          class="animar-paso mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"
        >
          <span
            class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"
            ><app-icono nombre="ok" class="h-9 w-9"
          /></span>
          <h2 class="mt-5 text-2xl font-bold text-slate-900">Solicitud enviada</h2>
          <p class="mt-1 text-slate-600">
            {{ monto(ultimoMonto()) }} quedó pendiente de aprobación del administrador.
          </p>
          <div class="mt-7 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              (click)="volverALista()"
              class="rounded-xl bg-vino-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-vino-800"
            >
              Ver mis solicitudes
            </button>
            <button
              type="button"
              (click)="abrirNueva()"
              [disabled]="(resumen()?.disponible_solicitar ?? 0) <= 0"
              class="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Hacer otra solicitud
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class SolicitudCapital implements OnInit, OnDestroy {
  private readonly svc = inject(SolicitudesService);
  private temporizador: ReturnType<typeof setInterval> | undefined;

  protected readonly vista = signal<Vista>('lista');
  protected readonly resumen = signal<ResumenCapitalDia | null>(null);
  protected readonly solicitudes = signal<SolicitudCapitalDetalle[]>([]);
  protected readonly cargando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly errorCarga = signal<string | null>(null);
  protected readonly errorEnvio = signal<string | null>(null);
  protected readonly montoTexto = signal('');
  protected readonly nota = signal('');
  protected readonly ultimoMonto = signal(0);

  protected readonly monto = formatearMonto;
  protected readonly fecha = formatearFecha;
  protected readonly limpiarNota = (evento: Event): string =>
    limpiarCampo(evento, (valor) => limpiarTexto(valor, 200));

  protected readonly montoValido = computed(() => {
    const valor = Number(this.montoTexto());
    return Number.isFinite(valor) ? valor : 0;
  });
  protected readonly porcentajeUsado = computed(() => {
    const r = this.resumen();
    return r && r.limite > 0 ? Math.min(100, Math.round((r.solicitado / r.limite) * 100)) : 0;
  });
  protected readonly montosRapidos = computed(() => {
    const disponible = this.resumen()?.disponible_solicitar ?? 0;
    return MONTOS_RAPIDOS.filter((m) => m <= disponible);
  });
  /** Aviso de comodidad; el límite real lo valida la base de datos. */
  protected readonly errorMonto = computed(() => {
    const valor = this.montoValido();
    const disponible = this.resumen()?.disponible_solicitar ?? 0;
    if (!this.montoTexto() || valor <= 0) return null;
    if (valor > disponible) {
      return `Solo puedes solicitar hasta ${formatearMonto(disponible)} más hoy (límite ${formatearMonto(this.resumen()?.limite ?? 0)}).`;
    }
    return null;
  });

  async ngOnInit(): Promise<void> {
    await this.cargar();
    // Se actualiza sola para ver cuándo el administrador resuelve
    this.temporizador = setInterval(() => {
      if (this.vista() !== 'nueva' && !this.cargando()) void this.cargar();
    }, ACTUALIZAR_CADA_MS);
  }

  ngOnDestroy(): void {
    clearInterval(this.temporizador);
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const [resumen, solicitudes] = await Promise.all([
        this.svc.resumenDia(),
        this.svc.listar({}, 100),
      ]);
      this.resumen.set(resumen);
      this.solicitudes.set(solicitudes);
      this.errorCarga.set(null);
    } catch (e) {
      this.errorCarga.set(mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected abrirNueva(): void {
    this.montoTexto.set('');
    this.nota.set('');
    this.errorEnvio.set(null);
    this.vista.set('nueva');
  }

  protected volverALista(): void {
    this.vista.set('lista');
    void this.cargar();
  }

  protected cambiarMonto(evento: Event): void {
    this.montoTexto.set(limpiarCampo(evento, limpiarMonto));
    this.errorEnvio.set(null);
  }

  protected fijarMonto(valor: number): void {
    this.montoTexto.set(String(valor));
    this.errorEnvio.set(null);
  }

  protected async enviar(): Promise<void> {
    const valor = this.montoValido();
    if (this.enviando() || valor <= 0 || this.errorMonto()) return;
    this.enviando.set(true);
    this.errorEnvio.set(null);
    try {
      await this.svc.solicitar(valor, this.nota().trim() || null);
      this.ultimoMonto.set(valor);
      this.vista.set('exito');
      await this.cargar();
    } catch (e) {
      this.errorEnvio.set(mensajeDeError(e));
      await this.cargar(); // el resumen puede haber cambiado (otra pestaña, otra solicitud)
    } finally {
      this.enviando.set(false);
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
