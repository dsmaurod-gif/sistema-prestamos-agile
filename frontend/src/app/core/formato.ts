import { Pipe, PipeTransform } from '@angular/core';

const numero = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fechaLima = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** 1234.5 → 'S/ 1,234.50' */
export function formatearMonto(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '';
  return `S/ ${numero.format(Number(valor))}`;
}

/** '2026-10-19' o una marca de tiempo → '19/10/2026' (hora de Lima) */
export function formatearFecha(valor: string | null | undefined): string {
  if (!valor) return '';
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}/${soloFecha[1]}`;
  return fechaLima.format(new Date(valor));
}

@Pipe({ name: 'monto' })
export class MontoPipe implements PipeTransform {
  transform(valor: number | string | null | undefined): string {
    return formatearMonto(valor);
  }
}

@Pipe({ name: 'fecha' })
export class FechaPipe implements PipeTransform {
  transform(valor: string | null | undefined): string {
    return formatearFecha(valor);
  }
}
