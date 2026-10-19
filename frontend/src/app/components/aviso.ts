import { Component, computed, input } from '@angular/core';
import { Icono, NombreIcono } from './icono';

export type TipoAviso = 'error' | 'advertencia' | 'info';

const ESTILOS: Record<TipoAviso, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  advertencia: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-vino-200 bg-vino-50 text-vino-900',
};

const ICONOS: Record<TipoAviso, NombreIcono> = {
  error: 'alerta',
  advertencia: 'alerta',
  info: 'info',
};

/** Aviso reutilizable. Los errores de la base de datos se pasan en `mensaje` tal cual llegan. */
@Component({
  selector: 'app-aviso',
  imports: [Icono],
  template: `
    @if (mensaje()) {
      <div
        class="animar-aparece flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"
        [class]="estilo()"
        [attr.role]="tipo() === 'error' ? 'alert' : 'status'"
      >
        <app-icono [nombre]="icono()" class="mt-0.5 h-5 w-5" />
        <span class="min-w-0 flex-1">{{ mensaje() }}</span>
      </div>
    }
  `,
})
export class Aviso {
  readonly mensaje = input<string | null>(null);
  readonly tipo = input<TipoAviso>('error');
  protected readonly estilo = computed(() => ESTILOS[this.tipo()]);
  protected readonly icono = computed(() => ICONOS[this.tipo()]);
}
