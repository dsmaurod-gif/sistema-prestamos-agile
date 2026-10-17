import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Rol } from './contrato';

/** Deja pasar solo con sesión iniciada y trabajador vinculado; si no, va a /login. */
export const authGuard: CanActivateFn = () =>
  inject(AuthService).trabajador() ? true : inject(Router).createUrlTree(['/login']);

/** Deja pasar solo a los roles indicados; el resto vuelve a /clientes. */
export function rolGuard(...roles: Rol[]): CanActivateFn {
  return () => {
    const rol = inject(AuthService).trabajador()?.rol;
    return rol && roles.includes(rol) ? true : inject(Router).createUrlTree(['/clientes']);
  };
}
