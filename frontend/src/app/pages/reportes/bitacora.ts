import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Aviso } from '../../components/aviso';
import { RegistroBitacoraDetallado, Sede } from '../../core/contrato';
import { formatearFecha, formatearMonto } from '../../core/formato';
import { mensajeDeError } from '../../core/supabase';
import { ReportesService } from '../../services/reportes.service';

const LIMITE = 200;

const ACCIONES: { valor: string; texto: string }[] = [
  { valor: 'CREAR_CLIENTE', texto: 'Crear cliente' },
  { valor: 'EVALUAR_PRESTAMO', texto: 'Evaluar préstamo' },
  { valor: 'APROBAR_PRESTAMO', texto: 'Aprobar préstamo' },
  { valor: 'CAMBIO_ESTADO', texto: 'Cambio de estado' },
  { valor: 'SOLICITAR_CAPITAL', texto: 'Solicitar capital' },
  { valor: 'APROBAR_SOLICITUD_CAPITAL', texto: 'Aprobar solicitud de capital' },
  { valor: 'RECHAZAR_SOLICITUD_CAPITAL', texto: 'Rechazar solicitud de capital' },
  { valor: 'REINICIAR_DEMO', texto: 'Reiniciar datos de demostración' },
  { valor: 'VACIAR_DATOS', texto: 'Vaciar datos' },
  { valor: 'RESTAURAR_DATOS', texto: 'Restaurar datos' },
];
const ACCION_TEXTO: Record<string, string> = Object.fromEntries(
  ACCIONES.map((a) => [a.valor, a.texto]),
);

const horaLima = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const ESTADO_TEXTO: Record<string, string> = {
  AL_DIA: 'Al día',
  MOROSO: 'Moroso',
  EXTRAJUDICIAL: 'Extrajudicial',
};

/** Texto de un estado de cliente ('MOROSO' → 'Moroso'); si no se reconoce, se deja tal cual. */
function textoEstado(valor: unknown): string {
  return ESTADO_TEXTO[String(valor)] ?? String(valor);
}

// HU-16 Auditoría: bitácora de solo lectura con filtros por fechas, acción y sede. Solo ADMIN.
@Component({
  selector: 'app-bitacora',
  imports: [FormsModule, Aviso],
  template: `
    <div class="flex flex-wrap items-end gap-3">
      <label class="text-sm font-medium text-slate-700">
        Desde
        <input
          type="date"
          [(ngModel)]="desde"
          class="mt-1 block rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
        />
      </label>
      <label class="text-sm font-medium text-slate-700">
        Hasta
        <input
          type="date"
          [(ngModel)]="hasta"
          class="mt-1 block rounded-xl border border-slate-300 bg-white px-3.5 py-2.5"
        />
      </label>
      <label class="text-sm font-medium text-slate-700">
        Acción
        <select [(ngModel)]="accion" class="mt-1 block rounded-xl border border-slate-300 bg-white px-3.5 py-2.5">
          <option value="">Todas</option>
          @for (a of acciones; track a.valor) {
            <option [value]="a.valor">{{ a.texto }}</option>
          }
        </select>
      </label>
      <label class="text-sm font-medium text-slate-700">
        Sede
        <select [(ngModel)]="sedeId" class="mt-1 block rounded-xl border border-slate-300 bg-white px-3.5 py-2.5">
          <option [ngValue]="null">Todas</option>
          @for (s of sedes(); track s.id) {
            <option [ngValue]="s.id">{{ s.nombre }}</option>
          }
        </select>
      </label>
      <button
        type="button"
        (click)="cargar()"
        [disabled]="cargando()"
        class="rounded bg-vino-700 px-4 py-2 text-sm font-medium text-white hover:bg-vino-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {{ cargando() ? 'Buscando…' : 'Buscar' }}
      </button>
    </div>

    <div class="mt-4">
      <app-aviso [mensaje]="error()" />
    </div>

    <p class="mt-4 text-sm text-slate-600">
      Registro de solo lectura: no se puede editar ni borrar. Se muestran los
      {{ limite }} registros más recientes que cumplen los filtros.
    </p>

    <div class="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th class="px-3 py-2">Fecha y hora</th>
            <th class="px-3 py-2">Acción</th>
            <th class="px-3 py-2">Usuaria</th>
            <th class="px-3 py-2">Sede</th>
            <th class="px-3 py-2">Detalle</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          @for (r of registros(); track $index) {
            <tr class="align-top">
              <td class="whitespace-nowrap px-3 py-2">{{ fechaHora(r.fecha) }}</td>
              <td class="whitespace-nowrap px-3 py-2 font-medium">{{ textoAccion(r.accion) }}</td>
              <td class="px-3 py-2">{{ r.trabajadores?.nombre ?? 'Sistema' }}</td>
              <td class="px-3 py-2">{{ r.sedes?.nombre ?? '—' }}</td>
              <td class="px-3 py-2 text-slate-700">{{ detalle(r) }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5" class="px-3 py-8 text-center text-slate-400">
                {{ cargando() ? 'Cargando bitácora…' : 'No hay registros con estos filtros.' }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class Bitacora implements OnInit {
  private readonly reportes = inject(ReportesService);

  readonly sedes = input<Sede[]>([]);

  protected readonly acciones = ACCIONES;
  protected readonly limite = LIMITE;
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly accion = signal('');
  protected readonly sedeId = signal<number | null>(null);
  protected readonly registros = signal<RegistroBitacoraDetallado[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  protected async cargar(): Promise<void> {
    const desde = this.desde();
    const hasta = this.hasta();
    if (desde && hasta && desde > hasta) {
      this.error.set('La fecha «Desde» no puede ser posterior a la fecha «Hasta».');
      return;
    }
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.registros.set(
        await this.reportes.listarBitacora({
          desde: desde || undefined,
          hasta: hasta || undefined,
          accion: this.accion() || undefined,
          sedeId: this.sedeId() ?? undefined,
          limite: LIMITE,
        }),
      );
    } catch (e) {
      this.registros.set([]);
      this.error.set(mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected fechaHora(valor: string): string {
    return `${formatearFecha(valor)} ${horaLima.format(new Date(valor))}`;
  }

  protected textoAccion(accion: string): string {
    return ACCION_TEXTO[accion] ?? accion;
  }

  /** Resume el JSON de detalle en una línea legible según la acción. */
  protected detalle(r: RegistroBitacoraDetallado): string {
    const d = r.detalle ?? {};
    switch (r.accion) {
      case 'CREAR_CLIENTE':
        return [
          `DNI ${d['dni']}`,
          d['verificado'] ? 'nombre verificado' : 'no verificado',
          d['ruc'] ? `RUC ${d['ruc']}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
      case 'EVALUAR_PRESTAMO': {
        const motivos = Array.isArray(d['motivos']) ? (d['motivos'] as string[]) : [];
        const resultado = d['aprobable'] ? 'Aprobable' : 'Rechazado';
        const base = `${formatearMonto(d['monto'] as number)} a ${d['plazo']} meses · ${resultado}`;
        return motivos.length ? `${base}: ${motivos.join('; ')}` : base;
      }
      case 'APROBAR_PRESTAMO':
        return `${formatearMonto(d['monto'] as number)} a ${d['plazo']} meses · cliente conforme`;
      case 'SOLICITAR_CAPITAL':
        return `${formatearMonto(d['monto'] as number)} · total del día ${formatearMonto(d['solicitado_hoy'] as number)}`;
      case 'APROBAR_SOLICITUD_CAPITAL':
      case 'RECHAZAR_SOLICITUD_CAPITAL':
        return `${formatearMonto(d['monto'] as number)} · jornada ${formatearFecha(d['fecha'] as string)}`;
      case 'VACIAR_DATOS':
        return `${d['clientes']} clientes, ${d['prestamos']} préstamos y ${d['solicitudes']} solicitudes (con respaldo)`;
      case 'RESTAURAR_DATOS':
        return `Respaldo n.º ${d['respaldo_id']}`;
      case 'CAMBIO_ESTADO':
        return `${textoEstado(d['de'])} → ${textoEstado(d['a'])} (${formatearFecha(d['fecha'] as string)})`;
      default:
        return JSON.stringify(d);
    }
  }
}