import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Aviso } from '../components/aviso';
import { EstadoCliente } from '../core/contrato';
import { formatearFecha } from '../core/formato';
import {
  errorDni,
  errorRuc,
  errorTelefono,
  hoyISO,
  limpiarCampo,
  limpiarNombre,
  limpiarTelefono,
  limpiarTexto,
  soloDigitos,
  sumarAnios,
  telefonoValido,
} from '../core/validaciones';
import { mensajeDeError } from '../core/supabase';
import { ClientesService } from '../services/clientes.service';

// HU-03 Registrar cliente (selector DNI / RUC, RENIEC, SUNAT, ingreso manual)
// HU-04 Rechazar documentos no permitidos (carnet de extranjería / pasaporte)
// HU-05 Buscar y consultar cliente.

type TipoDocumento = 'DNI' | 'CARNET' | 'PASAPORTE';
type ModoRegistro = 'DNI' | 'RUC';
type Vista = 'buscar' | 'registrar';
type PasoRegistro = 'modo' | 'tipo-doc' | 'ruc' | 'dni' | 'formulario' | 'exito';

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

interface FilaCliente {
  id: string;
  dni: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  estado: EstadoCliente;
  nombre_verificado: boolean;
}

@Component({
  selector: 'app-pagina-clientes',
  imports: [FormsModule, RouterLink, Aviso],
  template: `
    <div class="space-y-6">

      <!-- ── Tabs ── -->
      <div class="flex items-center justify-between flex-wrap gap-4">
        <h1 class="text-2xl font-semibold text-slate-900">Clientes</h1>
        <nav class="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
          <button
            id="tab-buscar"
            type="button"
            (click)="cambiarVista('buscar')"
            [class]="vista() === 'buscar'
              ? 'rounded-md bg-white px-4 py-1.5 text-sm font-medium text-slate-900 shadow-sm'
              : 'px-4 py-1.5 text-sm text-slate-600 hover:text-slate-900'"
          >Buscar</button>
          <button
            id="tab-registrar"
            type="button"
            (click)="cambiarVista('registrar')"
            [class]="vista() === 'registrar'
              ? 'rounded-md bg-white px-4 py-1.5 text-sm font-medium text-slate-900 shadow-sm'
              : 'px-4 py-1.5 text-sm text-slate-600 hover:text-slate-900'"
          >+ Registrar</button>
        </nav>
      </div>

      <!-- ════════ VISTA: BUSCAR (HU-05) ════════ -->
      @if (vista() === 'buscar') {
        <div class="space-y-4">
          <p class="text-sm text-slate-500">Busque por DNI, nombre o apellido.</p>

          <form (ngSubmit)="buscar()" class="flex gap-2" novalidate>
            <input
              id="input-busqueda-cliente"
              type="search"
              name="q"
              [(ngModel)]="queryBuscar"
              placeholder="DNI, nombre o apellido…"
              maxlength="60"
              autocomplete="off"
              [disabled]="cargandoBuscar()"
              class="flex-1 rounded border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none disabled:bg-slate-50"
            />
            <button
              id="btn-buscar-cliente"
              type="submit"
              [disabled]="cargandoBuscar() || !queryBuscar.trim()"
              class="rounded bg-slate-700 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >{{ cargandoBuscar() ? 'Buscando…' : 'Buscar' }}</button>
          </form>

          <app-aviso [mensaje]="errorBuscar()" />

          @if (clientesBuscados().length > 0) {
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
                  @for (c of clientesBuscados(); track c.id) {
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
                {{ clientesBuscados().length }} resultado{{ clientesBuscados().length !== 1 ? 's' : '' }}
              </p>
            </div>
          }

          @if (busquedaRealizada() && clientesBuscados().length === 0 && !cargandoBuscar() && !errorBuscar()) {
            <div class="rounded-lg border border-slate-200 bg-slate-50 px-6 py-10 text-center text-slate-500">
              No se encontraron clientes con «{{ ultimaBusqueda() }}».
            </div>
          }
        </div>
      }

      <!-- ════════ VISTA: REGISTRAR (HU-03 + HU-04) ════════ -->
      @if (vista() === 'registrar') {
        <div class="mx-auto max-w-lg space-y-5">

          <app-aviso [mensaje]="errorReg()" />
          <app-aviso tipo="info" [mensaje]="infoReg()" />

          <!-- PASO 0: Selector modo DNI / RUC -->
          @if (pasoReg() === 'modo') {
            <div class="space-y-4">
              <p class="text-sm text-slate-600">¿Cómo desea identificar al cliente?</p>
              <div class="grid grid-cols-2 gap-3">
                <button id="btn-modo-dni" type="button" (click)="elegirModo('DNI')"
                  class="rounded-lg border-2 border-slate-300 py-5 text-center hover:border-slate-900">
                  <div class="text-lg font-bold text-slate-900">DNI</div>
                  <div class="text-xs text-slate-500">Persona natural</div>
                </button>
                <button id="btn-modo-ruc" type="button" (click)="elegirModo('RUC')"
                  class="rounded-lg border-2 border-slate-300 py-5 text-center hover:border-slate-900">
                  <div class="text-lg font-bold text-slate-900">RUC</div>
                  <div class="text-xs text-slate-500">Empresa / RUC 10 o 20</div>
                </button>
              </div>
            </div>
          }

          <!-- PASO 1: Tipo de documento (HU-04) -->
          @if (pasoReg() === 'tipo-doc') {
            <form (ngSubmit)="verificarTipoDoc()" class="space-y-4" novalidate>
              <div>
                <label class="block text-sm font-medium text-slate-700" for="sel-tipo-doc">
                  Tipo de documento
                </label>
                <select id="sel-tipo-doc" name="tipoDoc" [(ngModel)]="tipoDoc"
                  class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-slate-900">
                  <option value="DNI">DNI</option>
                  <option value="CARNET">Carnet de extranjería</option>
                  <option value="PASAPORTE">Pasaporte</option>
                </select>
              </div>
              <div class="flex gap-2">
                <button type="button" (click)="reiniciarReg()"
                  class="flex-1 rounded border border-slate-300 py-2 text-sm text-slate-700 hover:bg-slate-50">← Atrás</button>
                <button id="btn-verificar-tipo" type="submit"
                  class="flex-1 rounded bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800">Continuar</button>
              </div>
            </form>
          }

          <!-- PASO RUC: Consulta SUNAT (CA12) -->
          @if (pasoReg() === 'ruc') {
            <form (ngSubmit)="consultarRuc()" class="space-y-4" novalidate>
              <div>
                <label class="block text-sm font-medium text-slate-700" for="inp-ruc">
                  Número de RUC <span class="text-slate-400">(11 dígitos, inicia con 10 o 20)</span>
                </label>
                <input id="inp-ruc" type="text" name="ruc" [value]="rucInput"
                  (input)="rucInput = limpiarCampo($event, limpiarRuc)"
                  inputmode="numeric" pattern="[0-9]*" autocomplete="off"
                  maxlength="11" placeholder="20601030013" [disabled]="cargandoReg()"
                  class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 font-mono text-slate-900 disabled:bg-slate-50" />
                @if (errorRuc(rucInput); as e) { <p class="mt-0.5 text-xs text-red-600">{{ e }}</p> }
              </div>
              <div class="flex gap-2">
                <button type="button" (click)="reiniciarReg()"
                  class="flex-1 rounded border border-slate-300 py-2 text-sm text-slate-700 hover:bg-slate-50">← Atrás</button>
                <button id="btn-consultar-ruc" type="submit"
                  [disabled]="cargandoReg() || rucInput.length < 11 || !!errorRuc(rucInput)"
                  class="flex-1 rounded bg-slate-900 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {{ cargandoReg() ? 'Consultando…' : 'Consultar SUNAT' }}
                </button>
              </div>
            </form>
            @if (rucValidado()) {
              <div class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm">
                <p class="font-semibold text-green-900">{{ rucValidado()!.razon_social }}</p>
                <p class="text-green-700">RUC {{ rucValidado()!.ruc }} · {{ rucValidado()!.estado }} · {{ rucValidado()!.condicion }}</p>
              </div>
            }
          }

          <!-- PASO DNI: Consulta RENIEC -->
          @if (pasoReg() === 'dni') {
            <form (ngSubmit)="consultarDni()" class="space-y-4" novalidate>
              @if (modoRegistro() === 'RUC' && rucValidado()) {
                <div class="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  Ingresa el DNI del titular del RUC (CA14).
                </div>
              }
              <div>
                <label class="block text-sm font-medium text-slate-700" for="inp-dni">
                  DNI del cliente <span class="text-slate-400">(8 dígitos)</span>
                </label>
                <div class="mt-1 flex gap-2">
                  <input id="inp-dni" type="text" name="dni" [value]="dniInput"
                    (input)="dniInput = limpiarCampo($event, limpiarDni)"
                    inputmode="numeric" pattern="[0-9]*" autocomplete="off"
                    maxlength="8" placeholder="12345678" [disabled]="cargandoReg()"
                    class="flex-1 rounded border border-slate-300 px-3 py-2 font-mono text-slate-900 disabled:bg-slate-50" />
                  <button id="btn-consultar-dni" type="submit"
                    [disabled]="cargandoReg() || dniInput.length !== 8"
                    class="rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                    {{ cargandoReg() ? '…' : 'Consultar' }}
                  </button>
                </div>
                @if (errorDni(dniInput); as e) { <p class="mt-0.5 text-xs text-red-600">{{ e }}</p> }
              </div>
            </form>

            <!-- Nombres verificados (CA1) -->
            @if (nombreApi()) {
              <div class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm">
                <p class="font-semibold text-green-900">{{ nombreApi()!.nombres }} {{ nombreApi()!.apellidos }}</p>
                <p class="text-xs text-green-600">Datos verificados con RENIEC · solo lectura</p>
              </div>
            }

            <!-- DNI no encontrado (CA3) -->
            @if (dniNoEncontrado()) {
              <app-aviso [mensaje]="'El DNI ' + dniInput + ' no fue encontrado en RENIEC. No es posible registrar con datos verificados.'" />
            }

            <!-- Ingreso manual (CA5) -->
            @if (dniApiFallida()) {
              <div class="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p class="text-sm font-semibold text-amber-900">⚠ Servicio de consulta DNI no disponible. Puede registrar manualmente.</p>
                <div>
                  <label class="block text-xs font-medium text-amber-800" for="inp-nombres-manual">Nombres completos</label>
                  <input id="inp-nombres-manual" type="text" name="nombresManual" [value]="nombresManual"
                    (input)="nombresManual = limpiarCampo($event, limpiarNombres)"
                    maxlength="80" autocomplete="off"
                    placeholder="NOMBRES APELLIDO APELLIDO"
                    class="mt-1 block w-full rounded border border-amber-300 bg-white px-3 py-2 text-sm uppercase" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-amber-800" for="inp-nombres-conf">Confirmar nombres</label>
                  <input id="inp-nombres-conf" type="text" name="nombresConf" [value]="nombresManualConf"
                    (input)="nombresManualConf = limpiarCampo($event, limpiarNombres)"
                    maxlength="80" autocomplete="off"
                    placeholder="NOMBRES APELLIDO APELLIDO"
                    class="mt-1 block w-full rounded border border-amber-300 bg-white px-3 py-2 text-sm uppercase" />
                </div>
                <label class="flex items-start gap-2 text-xs text-amber-800">
                  <input id="chk-verificado-fisico" type="checkbox" name="verificadoFisico" [(ngModel)]="verificadoFisico" class="mt-0.5" />
                  Verifiqué los datos contra el DNI físico del cliente.
                </label>
                <button id="btn-confirmar-manual" type="button"
                  (click)="confirmarManual()"
                  [disabled]="!puedeContinuarManual()"
                  class="w-full rounded bg-amber-800 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-50">
                  Continuar con ingreso manual
                </button>
              </div>
            }
          }

          <!-- PASO FORMULARIO COMPLETO -->
          @if (pasoReg() === 'formulario') {
            <form (ngSubmit)="registrar()" class="space-y-5" novalidate>

              <!-- Resumen identidad -->
              <div class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 space-y-1 text-sm">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-slate-700">DNI:</span>
                  <span class="font-mono text-slate-900">{{ dniInput }}</span>
                  @if (!verificadoDni()) {
                    <span class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">No verificado</span>
                  }
                </div>
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-slate-700">Nombres:</span>
                  <span class="text-slate-900">{{ nombresFinales() }} {{ apellidosFinales() }}</span>
                </div>
                @if (rucValidado()) {
                  <div class="text-slate-600">
                    <span class="font-semibold">RUC:</span> {{ rucValidado()!.ruc }} — {{ rucValidado()!.razon_social }}
                  </div>
                }
              </div>

              <!-- Vencimiento DNI (CA9) -->
              <div>
                <label class="block text-sm font-medium text-slate-700" for="inp-caducidad">
                  Fecha de caducidad del DNI <span class="text-red-500">*</span>
                </label>
                <input id="inp-caducidad" type="date" name="caducidad" [(ngModel)]="caducidad"
                  [min]="hoy" [max]="maxCaducidad"
                  [disabled]="cargandoReg()"
                  class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 disabled:bg-slate-50" />
                <p class="mt-0.5 text-xs text-slate-400">Léela del DNI físico del cliente; la consulta a RENIEC no la proporciona.</p>
                @if (errorCaducidad(); as e) { <p class="mt-0.5 text-xs text-red-600">{{ e }}</p> }
              </div>

              <!-- Teléfono (CA8) -->
              <div>
                <label class="block text-sm font-medium text-slate-700" for="inp-telefono">
                  Teléfono <span class="text-red-500">*</span>
                </label>
                <input id="inp-telefono" type="tel" name="telefono" [value]="telefono"
                  (input)="telefono = limpiarCampo($event, limpiarTelefono)"
                  inputmode="numeric" pattern="9[0-9]{8}" maxlength="9" autocomplete="tel-national"
                  placeholder="987654321" [disabled]="cargandoReg()"
                  class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 disabled:bg-slate-50" />
                <p class="mt-0.5 text-xs text-slate-400">Obligatorio para contacto de cobranza. 9 dígitos, empieza con 9.</p>
                @if (errorTelefono(telefono); as e) { <p class="mt-0.5 text-xs text-red-600">{{ e }}</p> }
              </div>

              <!-- Dirección (opcional, CA8) -->
              <div>
                <label class="block text-sm font-medium text-slate-700" for="inp-direccion">
                  Dirección <span class="text-slate-400">(opcional)</span>
                </label>
                <input id="inp-direccion" type="text" name="direccion" [value]="direccion"
                  (input)="direccion = limpiarCampo($event, limpiarDireccion)"
                  maxlength="120" autocomplete="street-address"
                  [disabled]="cargandoReg()"
                  class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 disabled:bg-slate-50" />
              </div>

              <div class="flex gap-3">
                <button type="button" (click)="reiniciarReg()"
                  class="flex-1 rounded border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button id="btn-registrar-cliente" type="submit"
                  [disabled]="cargandoReg() || !caducidad || !!errorCaducidad() || !telefonoValido(telefono)"
                  class="flex-1 rounded bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {{ cargandoReg() ? 'Registrando…' : 'Registrar cliente' }}
                </button>
              </div>
            </form>
          }

          <!-- ÉXITO -->
          @if (pasoReg() === 'exito') {
            <div class="rounded-xl border border-green-200 bg-green-50 p-6 text-center space-y-3">
              <div class="text-3xl">✓</div>
              <h2 class="text-lg font-semibold text-green-900">Cliente registrado</h2>
              <p class="text-sm text-green-700">{{ nombresFinales() }} {{ apellidosFinales() }} — DNI {{ dniInput }}</p>
              <div class="flex justify-center gap-3 pt-2">
                <a id="btn-ver-ficha-nueva" [routerLink]="['/clientes', clienteIdNuevo()]"
                  class="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  Ver ficha
                </a>
                <button id="btn-registrar-otro" type="button" (click)="reiniciarReg()"
                  class="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Registrar otro
                </button>
              </div>
            </div>
          }
        </div>
      }

    </div>
  `,
})
export class Clientes {
  private readonly svc = inject(ClientesService);
  private readonly router = inject(Router);

  // ── Vista activa ──
  protected readonly vista = signal<Vista>('buscar');

  protected cambiarVista(v: Vista): void {
    this.vista.set(v);
    this.errorBuscar.set(null);
    this.errorReg.set(null);
  }

  // ════ BÚSQUEDA (HU-05) ════

  protected queryBuscar = '';
  protected readonly clientesBuscados = signal<FilaCliente[]>([]);
  protected readonly cargandoBuscar = signal(false);
  protected readonly errorBuscar = signal<string | null>(null);
  protected readonly busquedaRealizada = signal(false);
  protected readonly ultimaBusqueda = signal('');

  protected estadoEstilo(e: EstadoCliente): string { return ESTADO_ESTILO[e]; }
  protected estadoTexto(e: EstadoCliente): string { return ESTADO_TEXTO[e]; }

  protected async buscar(): Promise<void> {
    const q = this.queryBuscar.trim();
    if (!q || this.cargandoBuscar()) return;
    this.cargandoBuscar.set(true);
    this.errorBuscar.set(null);
    this.busquedaRealizada.set(false);
    try {
      const res = await this.svc.buscar(q);
      this.clientesBuscados.set(res as FilaCliente[]);
      this.ultimaBusqueda.set(q);
      this.busquedaRealizada.set(true);
      if (/^\d{8}$/.test(q) && res.length === 1) {
        void this.router.navigate(['/clientes', res[0].id]);
      }
    } catch (e) {
      this.errorBuscar.set(mensajeDeError(e));
    } finally {
      this.cargandoBuscar.set(false);
    }
  }

  // ════ REGISTRO (HU-03 + HU-04) ════

  protected readonly pasoReg = signal<PasoRegistro>('modo');
  protected readonly modoRegistro = signal<ModoRegistro>('DNI');

  // Inputs
  // Validación de comodidad en los campos (la base de datos sigue siendo la autoridad)
  protected readonly limpiarCampo = limpiarCampo;
  protected readonly errorDni = errorDni;
  protected readonly errorRuc = errorRuc;
  protected readonly errorTelefono = errorTelefono;
  protected readonly telefonoValido = telefonoValido;
  protected readonly limpiarTelefono = limpiarTelefono;
  protected readonly limpiarDni = (valor: string): string => soloDigitos(valor, 8);
  protected readonly limpiarRuc = (valor: string): string => soloDigitos(valor, 11);
  protected readonly limpiarNombres = (valor: string): string => limpiarNombre(valor, 80);
  protected readonly limpiarDireccion = (valor: string): string => limpiarTexto(valor, 120);
  protected readonly hoy = hoyISO();
  protected readonly maxCaducidad = sumarAnios(hoyISO(), 20);

  protected tipoDoc: TipoDocumento = 'DNI';
  protected dniInput = '';
  protected rucInput = '';
  protected caducidad = '';
  protected telefono = '';
  protected direccion = '';

  // Estado del flujo de registro
  protected readonly rucValidado = signal<{ ruc: string; razon_social: string; estado: string; condicion: string } | null>(null);
  protected readonly nombreApi = signal<{ nombres: string; apellidos: string } | null>(null);
  protected readonly dniNoEncontrado = signal(false);
  protected readonly dniApiFallida = signal(false);
  protected readonly verificadoDni = signal(false);

  // Ingreso manual
  protected nombresManual = '';
  protected nombresManualConf = '';
  protected verificadoFisico = false;

  // Resultado
  protected readonly clienteIdNuevo = signal('');

  // UI
  protected readonly cargandoReg = signal(false);
  protected readonly errorReg = signal<string | null>(null);
  protected readonly infoReg = signal<string | null>(null);

  /** Mensaje si la fecha de caducidad no sirve (vencida o demasiado lejana); null si está bien o vacía. */
  protected errorCaducidad(): string | null {
    if (!this.caducidad) return null;
    if (this.caducidad < this.hoy) {
      return `El DNI está vencido (caducó el ${formatearFecha(this.caducidad)}): no se puede registrar a un cliente con el DNI caducado.`;
    }
    if (this.caducidad > this.maxCaducidad) {
      return `La fecha de caducidad no puede ser posterior al ${formatearFecha(this.maxCaducidad)}.`;
    }
    return null;
  }

  protected nombresFinales(): string {
    const api = this.nombreApi();
    if (api) return api.nombres;
    const tokens = this.nombresManual.trim().toUpperCase().split(/\s+/);
    return tokens.slice(0, 2).join(' ');
  }

  protected apellidosFinales(): string {
    const api = this.nombreApi();
    if (api) return api.apellidos;
    const tokens = this.nombresManual.trim().toUpperCase().split(/\s+/);
    return tokens.slice(2).join(' ');
  }

  protected puedeContinuarManual(): boolean {
    const n = this.nombresManual.trim().toUpperCase();
    const c = this.nombresManualConf.trim().toUpperCase();
    return n.length > 0 && n === c && this.verificadoFisico;
  }

  protected elegirModo(modo: ModoRegistro): void {
    this.modoRegistro.set(modo);
    this.errorReg.set(null);
    this.pasoReg.set(modo === 'DNI' ? 'tipo-doc' : 'ruc');
  }

  // HU-04: tipo de documento
  protected verificarTipoDoc(): void {
    if (this.tipoDoc === 'CARNET' || this.tipoDoc === 'PASAPORTE') {
      this.errorReg.set('No se otorgan préstamos a clientes identificados solo con carnet de extranjería o pasaporte.');
      return;
    }
    this.errorReg.set(null);
    this.pasoReg.set('dni');
  }

  // CA12-CA16: consulta SUNAT
  protected async consultarRuc(): Promise<void> {
    const ruc = this.rucInput.trim();
    if (!/^\d{11}$/.test(ruc) || !/^(10|20)/.test(ruc)) {
      this.errorReg.set('El RUC debe tener 11 dígitos y comenzar con 10 o 20.');
      return;
    }
    this.cargandoReg.set(true);
    this.errorReg.set(null);
    this.rucValidado.set(null);
    try {
      const res = await this.svc.consultarRuc(ruc);
      if (!res.existe) {
        this.errorReg.set('El RUC no fue encontrado en SUNAT.');
        return;
      }
      // CA13: rechazar si estado ≠ ACTIVO o condición ≠ HABIDO
      if (res.estado !== 'ACTIVO' || res.condicion !== 'HABIDO') {
        this.errorReg.set(
          `RUC rechazado: estado «${res.estado}» / condición «${res.condicion}». Solo se acepta ACTIVO / HABIDO.`,
        );
        return;
      }
      this.rucValidado.set({ ruc: res.ruc, razon_social: res.razon_social, estado: res.estado, condicion: res.condicion });
      this.infoReg.set('RUC validado. Ahora ingrese el DNI del titular (CA14).');
      this.pasoReg.set('dni');
    } catch {
      // CA16: API de RUC caída → permitir solo con DNI
      this.errorReg.set('El servicio de SUNAT no está disponible. Puede registrar al cliente solo con DNI.');
      this.rucValidado.set(null);
      this.pasoReg.set('dni');
    } finally {
      this.cargandoReg.set(false);
    }
  }

  // CA1-CA5: consulta RENIEC
  protected async consultarDni(): Promise<void> {
    const dni = this.dniInput.trim();
    if (!/^\d{8}$/.test(dni)) {
      this.errorReg.set('El DNI debe tener exactamente 8 dígitos numéricos.');
      return;
    }
    this.cargandoReg.set(true);
    this.errorReg.set(null);
    this.dniNoEncontrado.set(false);
    this.dniApiFallida.set(false);
    this.nombreApi.set(null);
    this.verificadoDni.set(false);
    try {
      const res = await this.svc.consultarDni(dni);
      if (!res.existe) {
        this.dniNoEncontrado.set(true); // CA3
        return;
      }
      this.nombreApi.set({ nombres: res.nombres, apellidos: res.apellidos });
      this.verificadoDni.set(true);
      this.infoReg.set(null);
      this.pasoReg.set('formulario');
    } catch {
      this.dniApiFallida.set(true); // CA5: API caída → ingreso manual
    } finally {
      this.cargandoReg.set(false);
    }
  }

  // CA5: confirmar ingreso manual
  protected confirmarManual(): void {
    if (!this.puedeContinuarManual()) return;
    this.verificadoDni.set(false);
    this.infoReg.set('Registro manual activo. El cliente quedará marcado como «No verificado».');
    this.pasoReg.set('formulario');
  }

  // Registro final
  protected async registrar(): Promise<void> {
    if (this.cargandoReg() || !this.caducidad || !this.telefono.trim()) return;

    const nombres = this.nombresFinales().trim();
    const apellidos = this.apellidosFinales().trim();
    if (!nombres || !apellidos) {
      this.errorReg.set('Los nombres y apellidos son requeridos.');
      return;
    }

    this.cargandoReg.set(true);
    this.errorReg.set(null);
    try {
      const ruc = this.rucValidado();
      const id = await this.svc.registrar({
        p_tipo_documento: 'DNI',
        p_dni: this.dniInput.trim(),
        p_nombres: nombres,
        p_apellidos: apellidos,
        p_telefono: this.telefono.trim(),
        p_direccion: this.direccion.trim() || null,
        p_verificado: this.verificadoDni(),
        p_dni_caducidad: this.caducidad,
        p_ruc: ruc ? ruc.ruc : null,
        p_razon_social: ruc ? ruc.razon_social : null,
      });
      this.clienteIdNuevo.set(id);
      this.pasoReg.set('exito');
    } catch (e) {
      const msg = mensajeDeError(e);
      // CA4: DNI ya existe → buscar y redirigir a la ficha
      if (msg.toLowerCase().includes('ya exist') || msg.toLowerCase().includes('duplicad') || msg.toLowerCase().includes('duplicate')) {
        this.errorReg.set(msg + ' Buscando la ficha existente…');
        try {
          const encontrados = await this.svc.buscar(this.dniInput.trim());
          if (encontrados.length > 0) {
            await this.router.navigate(['/clientes', encontrados[0].id]);
            return;
          }
        } catch { /* nada */ }
      }
      this.errorReg.set(msg);
    } finally {
      this.cargandoReg.set(false);
    }
  }

  protected reiniciarReg(): void {
    this.pasoReg.set('modo');
    this.modoRegistro.set('DNI');
    this.tipoDoc = 'DNI';
    this.dniInput = '';
    this.rucInput = '';
    this.caducidad = '';
    this.telefono = '';
    this.direccion = '';
    this.rucValidado.set(null);
    this.nombreApi.set(null);
    this.dniNoEncontrado.set(false);
    this.dniApiFallida.set(false);
    this.verificadoDni.set(false);
    this.nombresManual = '';
    this.nombresManualConf = '';
    this.verificadoFisico = false;
    this.clienteIdNuevo.set('');
    this.errorReg.set(null);
    this.infoReg.set(null);
  }
}
