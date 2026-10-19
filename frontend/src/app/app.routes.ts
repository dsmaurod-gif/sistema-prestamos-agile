import { Routes } from '@angular/router';
import { authGuard, rolGuard } from './core/guards';
import { Layout } from './components/layout';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión',
    loadComponent: () => import('./pages/login').then((m) => m.Login),
  },
  {
    path: '',
    component: Layout,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Inicio',
        loadComponent: () => import('./pages/inicio').then((m) => m.Inicio),
      },
      {
        path: 'clientes',
        title: 'Clientes',
        loadComponent: () => import('./pages/clientes').then((m) => m.Clientes),
      },
      {
        path: 'clientes/:id',
        title: 'Ficha del cliente',
        loadComponent: () => import('./pages/cliente-ficha').then((m) => m.ClienteFicha),
      },
      {
        path: 'prestamos/nuevo',
        title: 'Nuevo préstamo',
        loadComponent: () => import('./pages/prestamo-nuevo').then((m) => m.PrestamoNuevo),
      },
      {
        path: 'prestamos',
        title: 'Préstamos',
        loadComponent: () => import('./pages/prestamos').then((m) => m.Prestamos),
      },
      {
        path: 'solicitud-capital',
        title: 'Solicitud de capital',
        canActivate: [rolGuard('TRABAJADOR')],
        loadComponent: () =>
          import('./pages/solicitud-capital').then((m) => m.SolicitudCapital),
      },
      {
        path: 'solicitudes',
        title: 'Gestionar solicitudes',
        canActivate: [rolGuard('ADMIN')],
        loadComponent: () =>
          import('./pages/gestionar-solicitudes').then((m) => m.GestionarSolicitudes),
      },
      {
        path: 'reportes',
        title: 'Reportes',
        canActivate: [rolGuard('ADMIN')],
        loadComponent: () => import('./pages/reportes').then((m) => m.Reportes),
      },
      {
        path: 'demo',
        title: 'Modo demostración',
        canActivate: [rolGuard('ADMIN')],
        loadComponent: () => import('./pages/demo').then((m) => m.Demo),
      },
    ],
  },
  { path: '**', redirectTo: 'inicio' },
];
