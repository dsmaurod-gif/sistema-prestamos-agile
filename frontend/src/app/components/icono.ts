import { Component, computed, input } from '@angular/core';

/** Íconos de trazo (24×24) usados en el menú, los encabezados y los formularios. */
const ICONOS = {
  inicio: 'M3 11.5L12 4l9 7.5M5.5 10v9.5a1 1 0 001 1H10v-5.5h4v5.5h3.5a1 1 0 001-1V10',
  clientes:
    'M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 11a3.25 3.25 0 100-6.5 3.25 3.25 0 000 6.5zM20 19v-1.2a3 3 0 00-2.2-2.9M15.5 4.7a3.25 3.25 0 010 6.1',
  prestamoNuevo:
    'M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5M12 11.5v5M9.5 14h5',
  prestamos: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  reportes: 'M3 21h18M6 21V11M12 21V4M18 21v-7',
  demo: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  buscar: 'M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z',
  usuario: 'M20 21a8 8 0 10-16 0M12 12a4 4 0 100-8 4 4 0 000 8z',
  sede: 'M12 21s7-5.7 7-11a7 7 0 10-14 0c0 5.3 7 11 7 11zM12 12.2a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z',
  calendario:
    'M7 3v3M17 3v3M4 9.5h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  salir: 'M15 16.5l4.5-4.5L15 7.5M19.5 12H9M9 4H5.5a1 1 0 00-1 1v14a1 1 0 001 1H9',
  mas: 'M12 5v14M5 12h14',
  ok: 'M8.5 12.5l2.5 2.5 4.5-5M12 21a9 9 0 100-18 9 9 0 000 18z',
  alerta:
    'M12 9v4M12 16.8h.01M10.3 4.2L2.5 17.7A2 2 0 004.2 20.7h15.6a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z',
  info: 'M12 16v-4.5M12 8.2h.01M12 21a9 9 0 100-18 9 9 0 000 18z',
  ojo: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  ojoCerrado:
    'M3 3l18 18M10.6 6.1A9.8 9.8 0 0112 6c6.5 0 10 6 10 6a17 17 0 01-3.2 3.9M6.6 6.7C3.9 8.4 2 12 2 12s3.5 6 10 6a9.7 9.7 0 004.1-.9M9.9 9.9a3 3 0 004.2 4.2',
  correo: 'M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1zM3.5 7.5L12 13l8.5-5.5',
  candado:
    'M7.5 11V8a4.5 4.5 0 019 0v3M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z',
  flechaDer: 'M5 12h14M13 6l6 6-6 6',
  flechaIzq: 'M19 12H5M11 6l-6 6 6 6',
  abajo: 'M6 9l6 6 6-6',
  escudo: 'M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6l8-3zM9 12l2.2 2.2L15.5 10',
  documento: 'M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5M9 13h6M9 17h6',
  monedas:
    'M12 5.5c4.1 0 7.5 1 7.5 2.3S16.1 10 12 10 4.5 9 4.5 7.8 7.9 5.5 12 5.5zM4.5 7.8v4c0 1.3 3.4 2.3 7.5 2.3s7.5-1 7.5-2.3v-4M4.5 11.8v4c0 1.3 3.4 2.3 7.5 2.3s7.5-1 7.5-2.3v-4',
  descargar: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  imprimir:
    'M7 8V4h10v4M6 17H4a1 1 0 01-1-1v-6a1 1 0 011-1h16a1 1 0 011 1v6a1 1 0 01-1 1h-2M7 14h10v6H7v-6z',
  cerrar: 'M6 6l12 12M18 6L6 18',
  edificio:
    'M5 21V5a1 1 0 011-1h8a1 1 0 011 1v16M15 10h3a1 1 0 011 1v10M3 21h18M9 8h2M9 12h2M9 16h2',
  bandeja:
    'M4 13h4.5l1.5 2.5h4l1.5-2.5H20M4 13V6a1 1 0 011-1h14a1 1 0 011 1v7M4 13v5a1 1 0 001 1h14a1 1 0 001-1v-5',
  reloj: 'M12 7.5V12l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  persona: 'M12 12a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM4.5 21a7.5 7.5 0 0115 0',
} as const;

export type NombreIcono = keyof typeof ICONOS;

/** Uso: <app-icono nombre="clientes" class="h-5 w-5" /> (el tamaño y el color los da la clase). */
@Component({
  selector: 'app-icono',
  host: { class: 'inline-block shrink-0 align-middle' },
  template: `
    <svg
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path [attr.d]="trazo()" />
    </svg>
  `,
})
export class Icono {
  readonly nombre = input.required<NombreIcono>();
  protected readonly trazo = computed(() => ICONOS[this.nombre()]);
}

/** Marca del sistema: tres barras ascendentes con base. */
@Component({
  selector: 'app-logo',
  host: { class: 'inline-block shrink-0' },
  template: `
    <svg viewBox="0 0 40 36" width="100%" height="100%" aria-hidden="true">
      <rect x="3" y="20" width="8" height="12" rx="1.5" fill="currentColor" opacity="0.75" />
      <rect x="15" y="12" width="8" height="20" rx="1.5" fill="currentColor" opacity="0.9" />
      <rect x="27" y="3" width="8" height="29" rx="1.5" fill="currentColor" />
      <rect x="1" y="34" width="38" height="2" rx="1" fill="#e8a3b6" />
    </svg>
  `,
})
export class Logo {}
