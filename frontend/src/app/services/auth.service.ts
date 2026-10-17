import { computed, inject, Injectable, signal } from '@angular/core';
import { ErrorBaseDatos, resultado, SUPABASE } from '../core/supabase';
import { TrabajadorSesion, Uuid } from '../core/contrato';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly db = inject(SUPABASE);
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
    if (error) throw new ErrorBaseDatos(error.message);
    try {
      await this.cargarTrabajador(data.user.id);
    } catch (e) {
      await this.db.auth.signOut();
      throw e;
    }
  }

  async cerrarSesion(): Promise<void> {
    await this.db.auth.signOut();
    this.trabajadorActual.set(null);
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
    const trabajador = resultado<TrabajadorSesion>(
      await this.db
        .from('trabajadores')
        .select('id, nombre, rol, sede_id, sedes(nombre)')
        .eq('auth_user_id', authUserId)
        .single(),
    );
    this.trabajadorActual.set(trabajador);
  }
}
