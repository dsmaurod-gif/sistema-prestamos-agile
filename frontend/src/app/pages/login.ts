import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Aviso } from '../components/aviso';
import { mensajeDeError } from '../core/supabase';
import { correoValido } from '../core/validaciones';
import { AuthService } from '../services/auth.service';

// HU-01 Iniciar sesión.
@Component({
  selector: 'app-pagina-login',
  imports: [FormsModule, Aviso],
  template: `
    <main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 class="mb-1 text-2xl font-semibold text-slate-900">Iniciar sesión</h1>
      <p class="mb-6 text-sm text-slate-600">
        Sistema de Préstamos · uso exclusivo de trabajadores
      </p>

      <form (ngSubmit)="entrar()" class="space-y-4" novalidate>
        <app-aviso [mensaje]="error()" />

        <label class="block text-sm font-medium text-slate-700">
          Correo
          <input
            type="email"
            name="email"
            autocomplete="username"
            inputmode="email"
            maxlength="100"
            required
            [(ngModel)]="email"
            [disabled]="cargando()"
            class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 disabled:bg-slate-100"
          />
        </label>

        <label class="block text-sm font-medium text-slate-700">
          Contraseña
          <input
            type="password"
            name="password"
            autocomplete="current-password"
            maxlength="128"
            required
            [(ngModel)]="password"
            [disabled]="cargando()"
            class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 disabled:bg-slate-100"
          />
        </label>

        <button
          type="submit"
          [disabled]="cargando()"
          class="w-full rounded bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ cargando() ? 'Ingresando…' : 'Ingresar' }}
        </button>
      </form>
    </main>
  `,
})
export class Login implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly password = signal('');
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
