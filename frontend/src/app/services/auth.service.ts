import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ErrorBaseDatos, resultado, SUPABASE } from '../core/supabase';
import { TrabajadorSesion, Uuid } from '../core/contrato';

/** CA2: mismo texto para cualquier fallo de credenciales, sin revelar cuál falló. */
export const MENSAJE_CREDENCIALES = 'Usuario o contraseña incorrectos';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly db = inject(SUPABASE);
  private readonly router = inject(Router);
  private readonly trabajadorActual = signal<TrabajadorSesion | null>(null);

  readonly trabajador = this.trabajadorActual.asReadonly();
  readonly esAdmin = computed(() => this.trabajadorActual()?.rol === 'ADMIN');

  /** Se ejecuta al arrancar la app: recupera la sesión guardada, si la hay. */
  async inicializar(): Promise<void> {
    const { data } = await this.db.auth.getSession();
    if (data.session) {
      try {
        await this.cargarTrabajador(data.session.user.id);
      } catch {
        await this.db.auth.signOut();
      }
    }
    this.db.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') this.trabajadorActual.set(null);
    });
  }

  async iniciarSesion(email: string, password: string): Promise<void> {
    const { data, error } = await this.db.auth.signInWithPassword({ email, password });
    if (error) {
      // 4xx (salvo límite de intentos) = credenciales; lo demás es red o servicio caído
      const status = error.status ?? 0;
      const esCredencial = status >= 400 && status < 500 && status !== 429;
      throw new ErrorBaseDatos(
        esCredencial ? MENSAJE_CREDENCIALES : 'No se pudo iniciar sesión. Intenta de nuevo.',
      );
    }
    try {
      await this.cargarTrabajador(data.user.id);
    } catch {
      // Sin ficha en trabajadores o inactivo: no se distingue de unas credenciales malas
      await this.db.auth.signOut();
      throw new ErrorBaseDatos(MENSAJE_CREDENCIALES);
    }
  }

  async cerrarSesion(): Promise<void> {
    await this.db.auth.signOut();
    this.trabajadorActual.set(null);
    // replaceUrl: "atrás" no vuelve a las pantallas internas (CA4)
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  /**
   * Id que los servicios envían como p_trabajador. Es el único lugar que lo obtiene:
   * cuando la seguridad (RLS) cambie la forma de identificar al trabajador, solo cambia esto.
   */
  trabajadorId(): Uuid {
    const trabajador = this.trabajadorActual();
    if (!trabajador) throw new ErrorBaseDatos('La sesión expiró. Vuelve a iniciar sesión.');
    return trabajador.id;
  }

  private async cargarTrabajador(authUserId: Uuid): Promise<void> {
    const { activo, ...trabajador } = resultado<TrabajadorSesion & { activo: boolean }>(
      await this.db
        .from('trabajadores')
        .select('id, nombre, rol, sede_id, activo, sedes(nombre)')
        .eq('auth_user_id', authUserId)
        .single(),
    );
    if (!activo) throw new ErrorBaseDatos('Trabajador inactivo.');
    this.trabajadorActual.set(trabajador);
  }
}
