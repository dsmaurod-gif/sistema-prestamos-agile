import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Aviso } from '../components/aviso';
import { Icono, Logo } from '../components/icono';
import { mensajeDeError } from '../core/supabase';
import { correoValido } from '../core/validaciones';
import { AuthService } from '../services/auth.service';

const SEDES = ['Chimbote', 'Trujillo', 'Chiclayo', 'Piura', 'Tumbes'];

// HU-01 Iniciar sesión.
@Component({
  selector: 'app-pagina-login',
  imports: [FormsModule, Aviso, Icono, Logo],
  template: `
    <main class="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <!-- ── Panel de marca ── -->
      <section
        class="relative hidden flex-col justify-between overflow-hidden bg-linear-to-br from-vino-900 via-vino-800 to-vino-950 p-12 text-white lg:flex"
      >
        <!-- Formas decorativas -->
        <svg
          class="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]"
          viewBox="0 0 600 800"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <circle cx="520" cy="120" r="220" fill="none" stroke="white" stroke-width="1.5" />
          <circle cx="520" cy="120" r="150" fill="none" stroke="white" stroke-width="1.5" />
          <circle cx="40" cy="720" r="260" fill="none" stroke="white" stroke-width="1.5" />
          <path d="M0 560 C150 500 300 640 600 560 L600 800 L0 800 Z" fill="white" opacity="0.5" />
        </svg>
        <div
          class="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-vino-500/20 blur-3xl"
        ></div>

        <div class="relative flex items-center gap-4">
          <app-logo class="h-10 w-11 text-white" />
          <div class="border-l border-white/30 pl-4 leading-tight">
            <p class="text-lg font-semibold">Sistema de Gestión</p>
            <p class="text-lg font-semibold">de Préstamos</p>
          </div>
        </div>

        <div class="relative max-w-lg">
          <h1 class="text-5xl font-bold leading-[1.05] tracking-tight">
            Impulsamos<br />
            <span class="text-vino-200">tus metas</span>
          </h1>
          <p class="mt-5 max-w-md text-lg text-vino-100">
            Gestión de préstamos segura, confiable y en todas nuestras sedes.
          </p>
          <div class="mt-3 h-1 w-16 rounded bg-vino-300"></div>

          <ul class="mt-10 space-y-6">
            <li class="flex items-start gap-4">
              <span
                class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-white/20"
              >
                <app-icono nombre="escudo" class="h-6 w-6" />
              </span>
              <div>
                <p class="font-semibold">Aplicación de reglas de crédito</p>
                <p class="text-sm text-vino-200">Uniforme y trazable en todas las sedes.</p>
              </div>
            </li>
            <li class="flex items-start gap-4">
              <span
                class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-white/20"
              >
                <app-icono nombre="clientes" class="h-6 w-6" />
              </span>
              <div>
                <p class="font-semibold">Control y supervisión de la cartera</p>
                <p class="text-sm text-vino-200">Información siempre vigente y auditable.</p>
              </div>
            </li>
            <li class="flex items-start gap-4">
              <span
                class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-white/20"
              >
                <app-icono nombre="reportes" class="h-6 w-6" />
              </span>
              <div>
                <p class="font-semibold">Soporte para la toma de decisiones</p>
                <p class="text-sm text-vino-200">Reportes por sede con la información actual.</p>
              </div>
            </li>
          </ul>
        </div>

        <div class="relative flex flex-wrap gap-2">
          @for (sede of sedes; track sede) {
            <span
              class="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm text-vino-50 ring-1 ring-white/15"
            >
              <app-icono nombre="sede" class="h-4 w-4 text-vino-200" />
              {{ sede }}
            </span>
          }
        </div>
      </section>

      <!-- ── Formulario ── -->
      <section class="flex min-h-screen flex-col bg-slate-50">
        <div class="flex items-center justify-between px-6 py-5 sm:px-10">
          <div class="flex items-center gap-3 lg:invisible">
            <app-logo class="h-7 w-8 text-vino-800" />
            <span class="text-sm font-semibold text-vino-900">Gestión de Préstamos</span>
          </div>
          <p class="text-sm text-slate-500">
            Agile Development <span class="mx-2 text-slate-300">|</span> UPAO
          </p>
        </div>

        <div class="flex flex-1 items-center justify-center px-6 pb-10 sm:px-10">
          <div
            class="animar-paso w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-vino-900/5 sm:p-10"
          >
            <div class="flex items-center gap-3">
              <app-logo class="h-9 w-10 text-vino-800" />
              <div class="leading-tight">
                <p class="text-xl font-bold text-vino-900">Sistema de Gestión</p>
                <p class="text-xl font-bold text-vino-900">de Préstamos</p>
              </div>
            </div>
            <div class="mt-3 h-0.5 w-12 rounded bg-vino-700"></div>
            <p class="mt-3 text-sm text-slate-500">Controlamos hoy las oportunidades de mañana.</p>

            <h1 class="mt-8 text-2xl font-bold text-slate-900">Iniciar sesión</h1>
            <p class="mt-1 text-sm text-slate-500">
              Ingresa tus credenciales para acceder al sistema.
            </p>

            <form (ngSubmit)="entrar()" class="mt-6 space-y-4" novalidate>
              <app-aviso [mensaje]="error()" />

              <label class="block text-sm font-medium text-slate-700">
                Correo electrónico
                <span
                  class="mt-1.5 flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 transition focus-within:border-vino-500 focus-within:ring-4 focus-within:ring-vino-100"
                >
                  <app-icono nombre="correo" class="h-5 w-5 text-slate-400" />
                  <input
                    type="email"
                    name="email"
                    autocomplete="username"
                    inputmode="email"
                    maxlength="100"
                    placeholder="nombre@dominio.com"
                    required
                    [(ngModel)]="email"
                    [disabled]="cargando()"
                    class="w-full bg-transparent py-3 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60"
                  />
                </span>
              </label>

              <label class="block text-sm font-medium text-slate-700">
                Contraseña
                <span
                  class="mt-1.5 flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 transition focus-within:border-vino-500 focus-within:ring-4 focus-within:ring-vino-100"
                >
                  <app-icono nombre="candado" class="h-5 w-5 text-slate-400" />
                  <input
                    [type]="verClave() ? 'text' : 'password'"
                    name="password"
                    autocomplete="current-password"
                    maxlength="128"
                    placeholder="Tu contraseña"
                    required
                    [(ngModel)]="password"
                    [disabled]="cargando()"
                    class="w-full bg-transparent py-3 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    (click)="verClave.set(!verClave())"
                    [attr.aria-label]="verClave() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                    class="text-slate-400 transition hover:text-vino-700"
                  >
                    <app-icono [nombre]="verClave() ? 'ojoCerrado' : 'ojo'" class="h-5 w-5" />
                  </button>
                </span>
              </label>

              <button
                type="submit"
                [disabled]="cargando()"
                class="flex w-full items-center justify-center gap-2 rounded-xl bg-vino-700 px-4 py-3.5 font-semibold text-white shadow-lg shadow-vino-700/25 transition hover:bg-vino-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {{ cargando() ? 'Ingresando…' : 'Ingresar' }}
                @if (!cargando()) {
                  <app-icono nombre="flechaDer" class="h-5 w-5" />
                }
              </button>
            </form>

            <div
              class="mt-8 flex items-start gap-3 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-500"
            >
              <app-icono nombre="candado" class="mt-0.5 h-5 w-5 text-vino-700" />
              <p>
                Sistema de uso exclusivo para trabajadores y administradores. El cliente no puede
                manipular esta plataforma.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  `,
})
export class Login implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly sedes = SEDES;
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly verClave = signal(false);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    // Con sesión válida no tiene sentido ver el login
    if (this.auth.trabajador()) void this.router.navigateByUrl('/', { replaceUrl: true });
  }

  protected async entrar(): Promise<void> {
    if (this.cargando()) return;
    const email = this.email().trim();
    if (!email || !this.password()) {
      this.error.set('Ingresa tu correo y tu contraseña.');
      return;
    }
    if (!correoValido(email)) {
      this.error.set('Ingresa un correo con formato válido, por ejemplo nombre@dominio.com.');
      return;
    }
    this.cargando.set(true);
    this.error.set(null);
    try {
      await this.auth.iniciarSesion(email, this.password());
      await this.router.navigateByUrl('/', { replaceUrl: true });
    } catch (e) {
      this.error.set(mensajeDeError(e));
      this.password.set('');
    } finally {
      this.cargando.set(false);
    }
  }
}
