import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Aviso } from '../components/aviso';
import { Icono } from '../components/icono';
import { Cliente, EstadoCliente } from '../core/contrato';
import { formatearFecha } from '../core/formato';
import { mensajeDeError } from '../core/supabase';
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
import { ClientesService } from '../services/clientes.service';

// HU-03 Registrar cliente (selector DNI / RUC, RENIEC, SUNAT, ingreso manual)
// HU-04 Rechazar documentos no permitidos (carnet de extranjería / pasaporte)
// HU-05 Buscar y consultar cliente.

type TipoDocumento = 'DNI' | 'CARNET' | 'PASAPORTE';
type ModoRegistro = 'DNI' | 'RUC';
type Vista = 'lista' | 'registrar';
type PasoRegistro = 'modo' | 'tipo-doc' | 'ruc' | 'dni' | 'formulario' | 'exito';

const ESTADO_ESTILO: Record<EstadoCliente, string> = {
  AL_DIA: 'bg-emerald-100 text-emerald-800',
  MOROSO: 'bg-amber-100 text-amber-800',
  EXTRAJUDICIAL: 'bg-red-100 text-red-800',
};

const ESTADO_TEXTO: Record<EstadoCliente, string> = {
  AL_DIA: 'Al día',
  MOROSO: 'Moroso',
  EXTRAJUDICIAL: 'Extrajudicial',
};

const PASOS_REGISTRO: Record<PasoRegistro, number> = {
  modo: 1,
  'tipo-doc': 1,
  ruc: 2,
  dni: 2,
  formulario: 3,
  exito: 4,
};

@Component({
  selector: 'app-pagina-clientes',
  imports: [FormsModule, RouterLink, Aviso, Icono],
  template: `
    <div class="space-y-6">
      <!-- ── Encabezado ── -->
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-widest text-vino-700">Clientes</p>
          <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            {{ vista() === 'lista' ? 'Clientes' : 'Registro de cliente' }}
          </h1>
          <p class="mt-1 text-slate-500">
            {{
              vista() === 'lista'
                ? 'Busca un cliente por DNI, nombre o apellido en todas las sedes.'
                : 'Completa los datos del cliente. La identidad se valida con RENIEC y SUNAT.'
            }}
          </p>
        </div>
        @if (vista() === 'lista') {
          <button
            id="tab-registrar"
            type="button"
            (click)="cambiarVista('registrar')"
            class="flex items-center gap-2 rounded-xl bg-vino-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-vino-700/25 transition hover:bg-vino-800"
          >
            <app-icono nombre="mas" class="h-5 w-5" /> Nuevo cliente
          </button>
        } @else {
          <button
            id="tab-buscar"
            type="button"
            (click)="cambiarVista('lista')"
            class="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-vino-300 hover:text-vino-800"
          >
            <app-icono nombre="flechaIzq" class="h-4 w-4" /> Volver a clientes
          </button>
        }
      </header>

      <!-- ════════ LISTA Y BÚSQUEDA (HU-05) ════════ -->
      @if (vista() === 'lista') {
        <div class="animar-aparece space-y-4">
          <form
            (ngSubmit)="buscar()"
            class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 pl-5 shadow-sm focus-within:border-vino-400 focus-within:ring-4 focus-within:ring-vino-100"
            novalidate
          >
            <app-icono nombre="buscar" class="h-5 w-5 text-slate-400" />
            <input
              id="input-busqueda-cliente"
              type="search"
              name="q"
              [(ngModel)]="queryBuscar"
              (ngModelChange)="alEscribir()"
              placeholder="Buscar por DNI, nombre o apellido…"
              maxlength="60"
              autocomplete="off"
              class="min-w-0 flex-1 bg-transparent py-2.5 text-slate-900 outline-none placeholder:text-slate-400"
            />
            <button
              id="btn-buscar-cliente"
              type="submit"
              [disabled]="cargandoLista() || !queryBuscar.trim()"
              class="rounded-xl bg-vino-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-vino-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {{ cargandoLista() ? 'Buscando…' : 'Buscar' }}
            </button>
          </form>

          <app-aviso [mensaje]="errorBuscar()" />

          <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            @if (cargandoLista() && clientes().length === 0) {
              <p class="px-6 py-14 text-center text-slate-400">Cargando clientes…</p>
            } @else if (clientes().length === 0) {
              <div class="px-6 py-14 text-center">
                <app-icono nombre="buscar" class="mx-auto h-10 w-10 text-slate-300" />
                <p class="mt-3 font-medium text-slate-700">
                  {{
                    ultimaBusqueda()
                      ? 'No se encontraron clientes con «' + ultimaBusqueda() + '».'
                      : 'Todavía no hay clientes registrados.'
                  }}
                </p>
                <p class="mt-1 text-sm text-slate-500">
                  Revisa el DNI o el nombre, o registra al cliente con «Nuevo cliente».
                </p>
              </div>
            } @else {
              <div class="overflow-x-auto scroll-fino">
                <table class="min-w-full text-sm">
                  <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th class="px-6 py-3 font-medium">Cliente</th>
                      <th class="px-4 py-3 font-medium">DNI</th>
                      <th class="px-4 py-3 font-medium">Teléfono</th>
                      <th class="px-4 py-3 font-medium">Estado</th>
                      <th class="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (c of clientes(); track c.id) {
                      <tr class="transition hover:bg-vino-50/40">
                        <td class="px-6 py-3.5">
                          <div class="flex items-center gap-3">
                            <span
                              class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-vino-100 text-xs font-bold text-vino-800"
                              aria-hidden="true"
                              >{{ iniciales(c) }}</span
                            >
                            <div class="min-w-0">
                              <p class="truncate font-semibold text-slate-900">
                                {{ c.apellidos }}, {{ c.nombres }}
                                @if (!c.nombre_verificado) {
                                  <span class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">No verificado</span>
                                }
                              </p>
                              @if (c.ruc) {
                                <p class="truncate text-xs text-slate-500">RUC {{ c.ruc }}</p>
                              }
                            </div>
                          </div>
                        </td>
                        <td class="px-4 py-3.5 font-mono text-slate-700">{{ c.dni }}</td>
                        <td class="px-4 py-3.5 text-slate-600">{{ c.telefono }}</td>
                        <td class="px-4 py-3.5">
                          <span class="rounded-full px-2.5 py-1 text-xs font-semibold" [class]="estadoEstilo(c.estado)">{{ estadoTexto(c.estado) }}</span>
                        </td>
                        <td class="px-6 py-3.5 text-right">
                          <a
                            [id]="'btn-ver-cliente-' + c.id"
                            [routerLink]="['/clientes', c.id]"
                            class="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3.5 py-1.5 text-sm font-medium text-slate-700 transition hover:border-vino-300 hover:bg-vino-50 hover:text-vino-800"
                          >
                            <app-icono nombre="ojo" class="h-4 w-4" /> Ver ficha
                          </a>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <p class="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">
                @if (ultimaBusqueda()) {
                  {{ clientes().length }} resultado{{ clientes().length !== 1 ? 's' : '' }} para «{{ ultimaBusqueda() }}»
                } @else {
                  Mostrando los {{ clientes().length }} clientes más recientes. Usa el buscador para encontrar a otro.
                }
              </p>
            }
          </div>
        </div>
      }

      <!-- ════════ REGISTRO (HU-03 + HU-04) ════════ -->
      @if (vista() === 'registrar') {
        <div class="mx-auto max-w-3xl space-y-6">
          <!-- Pasos -->
          <ol class="flex items-center" aria-label="Pasos del registro">
            @for (p of pasos; track p.n) {
              <li class="flex items-center" [class]="p.n < 4 ? 'flex-1' : ''">
                <div class="flex items-center gap-2.5">
                  <span
                    class="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold transition"
                    [class]="
                      pasoNumero() > p.n
                        ? 'bg-vino-700 text-white'
                        : pasoNumero() === p.n
                          ? 'bg-vino-700 text-white ring-4 ring-vino-100'
                          : 'bg-slate-200 text-slate-500'
                    "
                  >
                    @if (pasoNumero() > p.n) {
                      <app-icono nombre="ok" class="h-5 w-5" />
                    } @else {
                      {{ p.n }}
                    }
                  </span>
                  <span
                    class="hidden text-sm font-medium sm:inline"
                    [class]="pasoNumero() >= p.n ? 'text-slate-900' : 'text-slate-400'"
                    >{{ p.texto }}</span
                  >
                </div>
                @if (p.n < 4) {
                  <span
                    class="mx-3 h-0.5 flex-1 rounded"
                    [class]="pasoNumero() > p.n ? 'bg-vino-700' : 'bg-slate-200'"
                  ></span>
                }
              </li>
            }
          </ol>

          <app-aviso [mensaje]="errorReg()" />
          <app-aviso tipo="info" [mensaje]="infoReg()" />

          <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <!-- PASO 1a: ¿DNI o RUC? -->
            @if (pasoReg() === 'modo') {
              <div class="animar-paso">
                <h2 class="text-center text-xl font-bold text-slate-900">¿Cómo se identifica el cliente?</h2>
                <p class="mt-1 text-center text-sm text-slate-500">
                  El cliente siempre se identifica con DNI. El RUC es un dato adicional.
                </p>
                <div class="mt-8 grid gap-4 sm:grid-cols-2">
                  <button
                    id="btn-modo-dni"
                    type="button"
                    (click)="elegirModo('DNI')"
                    class="group flex flex-col items-start justify-start rounded-2xl border-2 border-slate-200 p-6 text-left transition hover:border-vino-500 hover:bg-vino-50/50 hover:shadow-md"
                  >
                    <span class="grid h-12 w-12 place-items-center rounded-xl bg-vino-100 text-vino-700 transition group-hover:bg-vino-700 group-hover:text-white">
                      <app-icono nombre="persona" class="h-6 w-6" />
                    </span>
                    <p class="mt-4 text-lg font-bold text-slate-900">Documento personal</p>
                    <p class="mt-1 text-sm text-slate-500">DNI · persona natural. Se valida con RENIEC.</p>
                  </button>
                  <button
                    id="btn-modo-ruc"
                    type="button"
                    (click)="elegirModo('RUC')"
                    class="group flex flex-col items-start justify-start rounded-2xl border-2 border-slate-200 p-6 text-left transition hover:border-vino-500 hover:bg-vino-50/50 hover:shadow-md"
                  >
                    <span class="grid h-12 w-12 place-items-center rounded-xl bg-vino-100 text-vino-700 transition group-hover:bg-vino-700 group-hover:text-white">
                      <app-icono nombre="edificio" class="h-6 w-6" />
                    </span>
                    <p class="mt-4 text-lg font-bold text-slate-900">RUC</p>
                    <p class="mt-1 text-sm text-slate-500">Con negocio. Se valida en SUNAT y se pide además el DNI del titular.</p>
                  </button>
                </div>
              </div>
            }

            <!-- PASO 1b: tipo de documento (HU-04) -->
            @if (pasoReg() === 'tipo-doc') {
              <form (ngSubmit)="verificarTipoDoc()" class="animar-paso space-y-5" novalidate>
                <div>
                  <h2 class="text-xl font-bold text-slate-900">Tipo de documento</h2>
                  <p class="mt-1 text-sm text-slate-500">Solo se otorgan préstamos a clientes con DNI.</p>
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700" for="sel-tipo-doc">Tipo de documento</label>
                  <select
                    id="sel-tipo-doc"
                    name="tipoDoc"
                    [(ngModel)]="tipoDoc"
                    class="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-vino-500 focus:ring-4 focus:ring-vino-100"
                  >
                    <option value="DNI">DNI</option>
                    <option value="CARNET">Carnet de extranjería</option>
                    <option value="PASAPORTE">Pasaporte</option>
                  </select>
                </div>
                <div class="flex gap-3 pt-2">
                  <button type="button" (click)="reiniciarReg()" class="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                    ← Atrás
                  </button>
                  <button id="btn-verificar-tipo" type="submit" class="flex-1 rounded-xl bg-vino-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-vino-800">
                    Continuar
                  </button>
                </div>
              </form>
            }

            <!-- PASO 2a: RUC (SUNAT) -->
            @if (pasoReg() === 'ruc') {
              <div class="animar-paso space-y-5">
                <form (ngSubmit)="consultarRuc()" class="space-y-5" novalidate>
                  <div>
                    <h2 class="text-xl font-bold text-slate-900">Valida el RUC en SUNAT</h2>
                    <p class="mt-1 text-sm text-slate-500">Solo se acepta un contribuyente ACTIVO y HABIDO.</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-slate-700" for="inp-ruc">
                      Número de RUC <span class="text-slate-400">(11 dígitos, inicia con 10 o 20)</span>
                    </label>
                    <input
                      id="inp-ruc"
                      type="text"
                      name="ruc"
                      [value]="rucInput"
                      (input)="rucInput = limpiarCampo($event, limpiarRuc)"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      autocomplete="off"
                      maxlength="11"
                      placeholder="20601030013"
                      [disabled]="cargandoReg()"
                      class="mt-1.5 block w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-lg tracking-wider text-slate-900 outline-none focus:border-vino-500 focus:ring-4 focus:ring-vino-100 disabled:bg-slate-50"
                    />
                    @if (errorRuc(rucInput); as e) {
                      <p class="mt-1.5 text-xs text-red-600">{{ e }}</p>
                    }
                  </div>
                  <div class="flex gap-3">
                    <button type="button" (click)="reiniciarReg()" class="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                      ← Atrás
                    </button>
                    <button
                      id="btn-consultar-ruc"
                      type="submit"
                      [disabled]="cargandoReg() || rucInput.length < 11 || !!errorRuc(rucInput)"
                      class="flex flex-1 items-center justify-center gap-2 rounded-xl bg-vino-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-vino-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <app-icono nombre="buscar" class="h-4 w-4" />
                      {{ cargandoReg() ? 'Consultando…' : 'Consultar SUNAT' }}
                    </button>
                  </div>
                </form>
                @if (rucValidado()) {
                  <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
                    <p class="font-semibold text-emerald-900">{{ rucValidado()!.razon_social }}</p>
                    <p class="text-emerald-700">RUC {{ rucValidado()!.ruc }} · {{ rucValidado()!.estado }} · {{ rucValidado()!.condicion }}</p>
                  </div>
                }
              </div>
            }

            <!-- PASO 2b: DNI (RENIEC) -->
            @if (pasoReg() === 'dni') {
              <div class="animar-paso space-y-5">
                <form (ngSubmit)="consultarDni()" class="space-y-5" novalidate>
                  <div>
                    <h2 class="text-xl font-bold text-slate-900">Busca y valida el DNI en RENIEC</h2>
                    <p class="mt-1 text-sm text-slate-500">Se obtienen automáticamente los nombres y apellidos.</p>
                  </div>
                  @if (modoRegistro() === 'RUC' && rucValidado()) {
                    <div class="rounded-xl border border-vino-200 bg-vino-50 px-4 py-3 text-sm text-vino-900">
                      <span class="font-semibold">{{ rucValidado()!.razon_social }}</span> · RUC {{ rucValidado()!.ruc }}.
                      Ingresa el DNI del titular.
                    </div>
                  }
                  <div>
                    <label class="block text-sm font-medium text-slate-700" for="inp-dni">
                      Número de DNI <span class="text-slate-400">(8 dígitos)</span>
                    </label>
                    <div class="mt-1.5 flex gap-3">
                      <input
                        id="inp-dni"
                        type="text"
                        name="dni"
                        [value]="dniInput"
                        (input)="dniInput = limpiarCampo($event, limpiarDni)"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        autocomplete="off"
                        maxlength="8"
                        placeholder="12345678"
                        [disabled]="cargandoReg()"
                        class="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 font-mono text-lg tracking-wider text-slate-900 outline-none focus:border-vino-500 focus:ring-4 focus:ring-vino-100 disabled:bg-slate-50"
                      />
                      <button
                        id="btn-consultar-dni"
                        type="submit"
                        [disabled]="cargandoReg() || dniInput.length !== 8"
                        class="flex items-center gap-2 rounded-xl bg-vino-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-vino-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <app-icono nombre="buscar" class="h-4 w-4" />
                        {{ cargandoReg() ? 'Consultando…' : 'Consultar RENIEC' }}
                      </button>
                    </div>
                    @if (errorDni(dniInput); as e) {
                      <p class="mt-1.5 text-xs text-red-600">{{ e }}</p>
                    }
                  </div>
                  <button type="button" (click)="reiniciarReg()" class="text-sm font-medium text-slate-500 hover:text-vino-800">
                    ← Empezar de nuevo
                  </button>
                </form>

                <!-- DNI no encontrado (CA3) -->
                @if (dniNoEncontrado()) {
                  <app-aviso [mensaje]="'El DNI ' + dniInput + ' no fue encontrado en RENIEC. No es posible registrar con datos verificados.'" />
                }

                <!-- Ingreso manual (CA5) -->
                @if (dniApiFallida()) {
                  <div class="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
                    <p class="flex items-start gap-2 text-sm font-semibold text-amber-900">
                      <app-icono nombre="alerta" class="mt-0.5 h-5 w-5" />
                      Servicio de consulta DNI no disponible. Puede registrar manualmente.
                    </p>
                    <div>
                      <label class="block text-xs font-medium text-amber-900" for="inp-nombres-manual">Nombres completos</label>
                      <input
                        id="inp-nombres-manual"
                        type="text"
                        name="nombresManual"
                        [value]="nombresManual"
                        (input)="nombresManual = limpiarCampo($event, limpiarNombres)"
                        maxlength="80"
                        autocomplete="off"
                        placeholder="NOMBRES APELLIDO APELLIDO"
                        class="mt-1 block w-full rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm uppercase outline-none focus:ring-4 focus:ring-amber-100"
                      />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-amber-900" for="inp-nombres-conf">Confirmar nombres</label>
                      <input
                        id="inp-nombres-conf"
                        type="text"
                        name="nombresConf"
                        [value]="nombresManualConf"
                        (input)="nombresManualConf = limpiarCampo($event, limpiarNombres)"
                        maxlength="80"
                        autocomplete="off"
                        placeholder="NOMBRES APELLIDO APELLIDO"
                        class="mt-1 block w-full rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm uppercase outline-none focus:ring-4 focus:ring-amber-100"
                      />
                    </div>
                    <label class="flex items-start gap-2.5 text-sm text-amber-900">
                      <input id="chk-verificado-fisico" type="checkbox" name="verificadoFisico" [(ngModel)]="verificadoFisico" class="mt-1 h-4 w-4 accent-vino-700" />
                      Verifiqué los datos contra el DNI físico del cliente.
                    </label>
                    <button
                      id="btn-confirmar-manual"
                      type="button"
                      (click)="confirmarManual()"
                      [disabled]="!puedeContinuarManual()"
                      class="w-full rounded-xl bg-amber-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Continuar con ingreso manual
                    </button>
                  </div>
                }
              </div>
            }

            <!-- PASO 3: datos del cliente -->
            @if (pasoReg() === 'formulario') {
              <form (ngSubmit)="registrar()" class="animar-paso space-y-6" novalidate>
                <div>
                  <h2 class="text-xl font-bold text-slate-900">Datos del cliente</h2>
                  <p class="mt-1 text-sm text-slate-500">Revisa la identidad y completa la información de contacto.</p>
                </div>

                <!-- Resumen de identidad -->
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div class="flex flex-wrap items-center gap-3">
                    <span class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-vino-100 text-vino-800">
                      <app-icono nombre="persona" class="h-6 w-6" />
                    </span>
                    <div class="min-w-0">
                      <p class="truncate text-lg font-bold text-slate-900">{{ nombresFinales() }} {{ apellidosFinales() }}</p>
                      <p class="text-sm text-slate-600">DNI <span class="font-mono font-semibold text-slate-900">{{ dniInput }}</span></p>
                    </div>
                    @if (verificadoDni()) {
                      <span class="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                        <app-icono nombre="ok" class="h-4 w-4" /> Verificado en RENIEC
                      </span>
                    } @else {
                      <span class="ml-auto rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">No verificado</span>
                    }
                  </div>
                  @if (rucValidado()) {
                    <p class="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-600">
                      <span class="font-semibold text-slate-800">RUC:</span> {{ rucValidado()!.ruc }} — {{ rucValidado()!.razon_social }}
                    </p>
                  }
                </div>

                <div class="grid gap-5 sm:grid-cols-2">
                  <!-- Vencimiento DNI (CA9) -->
                  <div>
                    <label class="block text-sm font-medium text-slate-700" for="inp-caducidad">
                      Fecha de caducidad del DNI <span class="text-red-500">*</span>
                    </label>
                    <input
                      id="inp-caducidad"
                      type="date"
                      name="caducidad"
                      [(ngModel)]="caducidad"
                      [min]="hoy"
                      [max]="maxCaducidad"
                      [disabled]="cargandoReg()"
                      class="mt-1.5 block w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-vino-500 focus:ring-4 focus:ring-vino-100 disabled:bg-slate-50"
                    />
                    <p class="mt-1 text-xs text-slate-400">Léela del DNI físico del cliente; la consulta a RENIEC no la proporciona.</p>
                    @if (errorCaducidad(); as e) {
                      <p class="mt-1 text-xs text-red-600">{{ e }}</p>
                    }
                  </div>

                  <!-- Teléfono (CA8) -->
                  <div>
                    <label class="block text-sm font-medium text-slate-700" for="inp-telefono">
                      Teléfono <span class="text-red-500">*</span>
                    </label>
                    <input
                      id="inp-telefono"
                      type="tel"
                      name="telefono"
                      [value]="telefono"
                      (input)="telefono = limpiarCampo($event, limpiarTelefono)"
                      inputmode="numeric"
                      pattern="9[0-9]{8}"
                      maxlength="9"
                      autocomplete="tel-national"
                      placeholder="987654321"
                      [disabled]="cargandoReg()"
                      class="mt-1.5 block w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-vino-500 focus:ring-4 focus:ring-vino-100 disabled:bg-slate-50"
                    />
                    <p class="mt-1 text-xs text-slate-400">Obligatorio para contacto de cobranza. 9 dígitos, empieza con 9.</p>
                    @if (errorTelefono(telefono); as e) {
                      <p class="mt-1 text-xs text-red-600">{{ e }}</p>
                    }
                  </div>
                </div>

                <!-- Dirección (opcional, CA8) -->
                <div>
                  <label class="block text-sm font-medium text-slate-700" for="inp-direccion">
                    Dirección <span class="text-slate-400">(opcional)</span>
                  </label>
                  <input
                    id="inp-direccion"
                    type="text"
                    name="direccion"
                    [value]="direccion"
                    (input)="direccion = limpiarCampo($event, limpiarDireccion)"
                    maxlength="120"
                    autocomplete="street-address"
                    [disabled]="cargandoReg()"
                    class="mt-1.5 block w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-vino-500 focus:ring-4 focus:ring-vino-100 disabled:bg-slate-50"
                  />
                </div>

                <div class="flex gap-3 pt-2">
                  <button type="button" (click)="reiniciarReg()" class="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                    Cancelar
                  </button>
                  <button
                    id="btn-registrar-cliente"
                    type="submit"
                    [disabled]="cargandoReg() || !caducidad || !!errorCaducidad() || !telefonoValido(telefono)"
                    class="flex-1 rounded-xl bg-vino-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-vino-700/25 transition hover:bg-vino-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                  >
                    {{ cargandoReg() ? 'Registrando…' : 'Registrar cliente' }}
                  </button>
                </div>
              </form>
            }

            <!-- ÉXITO -->
            @if (pasoReg() === 'exito') {
              <div class="animar-paso py-6 text-center">
                <span class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <app-icono nombre="ok" class="h-9 w-9" />
                </span>
                <h2 class="mt-5 text-2xl font-bold text-slate-900">Cliente registrado</h2>
                <p class="mt-1 text-slate-600">{{ nombresFinales() }} {{ apellidosFinales() }} — DNI {{ dniInput }}</p>
                <div class="mt-7 flex flex-wrap justify-center gap-3">
                  <a
                    id="btn-ver-ficha-nueva"
                    [routerLink]="['/clientes', clienteIdNuevo()]"
                    class="rounded-xl bg-vino-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-vino-800"
                  >
                    Ver ficha
                  </a>
                  <button
                    id="btn-registrar-otro"
                    type="button"
                    (click)="reiniciarReg()"
                    class="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Registrar otro
                  </button>
                  <button
                    type="button"
                    (click)="cambiarVista('lista')"
                    class="rounded-xl px-6 py-3 text-sm font-semibold text-slate-500 transition hover:text-vino-800"
                  >
                    Volver a clientes
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- Ventana de rechazo por documento no permitido (HU-04 CA2) -->
      @if (rechazoDocumento()) {
        <div class="animar-aparece fixed inset-0 z-50 grid place-items-center bg-vino-950/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="titulo-rechazo">
          <div class="animar-paso w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-2xl">
            <span class="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-100 text-red-700">
              <app-icono nombre="alerta" class="h-8 w-8" />
            </span>
            <h2 id="titulo-rechazo" class="mt-4 text-xl font-bold text-slate-900">Documento no permitido</h2>
            <p class="mt-2 text-sm text-slate-600">
              No se otorgan préstamos a clientes identificados solo con carnet de extranjería o pasaporte.
            </p>
            <button
              type="button"
              (click)="rechazoDocumento.set(false)"
              class="mt-6 w-full rounded-xl bg-vino-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-vino-800"
            >
              Entendido
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class Clientes implements OnInit, OnDestroy {
  private readonly svc = inject(ClientesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // ── Vista activa ──
  protected readonly vista = signal<Vista>('lista');
  protected readonly rechazoDocumento = signal(false);
  protected readonly pasos = [
    { n: 1, texto: 'Tipo de documento' },
    { n: 2, texto: 'Identidad' },
    { n: 3, texto: 'Datos del cliente' },
    { n: 4, texto: 'Confirmación' },
  ];
  protected readonly pasoNumero = computed(() => PASOS_REGISTRO[this.pasoReg()]);

  ngOnInit(): void {
    // Desde el inicio se puede abrir directamente el registro (?nuevo=1)
    if (this.route.snapshot.queryParamMap.has('nuevo')) this.vista.set('registrar');
    void this.cargarRecientes();
  }

  ngOnDestroy(): void {
    clearTimeout(this.temporizador);
  }

  protected cambiarVista(v: Vista): void {
    this.vista.set(v);
    this.errorBuscar.set(null);
    this.errorReg.set(null);
    this.infoReg.set(null);
    if (v === 'registrar') {
      this.reiniciarReg();
    } else if (!this.ultimaBusqueda()) {
      void this.cargarRecientes(); // el cliente recién registrado aparece en la lista
    }
  }

  // ════ LISTA Y BÚSQUEDA (HU-05) ════

  protected queryBuscar = '';
  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly cargandoLista = signal(false);
  protected readonly errorBuscar = signal<string | null>(null);
  protected readonly ultimaBusqueda = signal('');
  private temporizador: ReturnType<typeof setTimeout> | undefined;
  /** Número de la última consulta: una respuesta vieja no pisa a la nueva. */
  private consulta = 0;

  protected estadoEstilo(e: EstadoCliente): string {
    return ESTADO_ESTILO[e];
  }
  protected estadoTexto(e: EstadoCliente): string {
    return ESTADO_TEXTO[e];
  }
  protected iniciales(c: Cliente): string {
    return (c.nombres[0] ?? '') + (c.apellidos[0] ?? '');
  }

  protected async cargarRecientes(): Promise<void> {
    const numero = ++this.consulta;
    this.cargandoLista.set(true);
    this.errorBuscar.set(null);
    this.ultimaBusqueda.set('');
    try {
      const filas = await this.svc.listarRecientes(50);
      if (numero === this.consulta) this.clientes.set(filas);
    } catch (e) {
      if (numero === this.consulta) this.errorBuscar.set(mensajeDeError(e));
    } finally {
      if (numero === this.consulta) this.cargandoLista.set(false);
    }
  }

  /** Busca sola al dejar de escribir (a partir de 3 caracteres); con el campo vacío vuelve a la lista inicial. */
  protected alEscribir(): void {
    clearTimeout(this.temporizador);
    const q = this.queryBuscar.trim();
    if (!q) {
      void this.cargarRecientes();
    } else if (q.length >= 3) {
      this.temporizador = setTimeout(() => void this.buscar(), 400);
    }
  }

  protected async buscar(): Promise<void> {
    clearTimeout(this.temporizador);
    const q = this.queryBuscar.trim();
    if (!q) return;
    const numero = ++this.consulta;
    this.cargandoLista.set(true);
    this.errorBuscar.set(null);
    try {
      const res = await this.svc.buscar(q);
      if (numero !== this.consulta) return;
      this.clientes.set(res);
      this.ultimaBusqueda.set(q);
      if (/^\d{8}$/.test(q) && res.length === 1) {
        void this.router.navigate(['/clientes', res[0].id]);
      }
    } catch (e) {
      if (numero === this.consulta) this.errorBuscar.set(mensajeDeError(e));
    } finally {
      if (numero === this.consulta) this.cargandoLista.set(false);
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
      this.rechazoDocumento.set(true);
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
    this.rechazoDocumento.set(false);
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
