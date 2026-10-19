import { Component, computed, input } from '@angular/core';

export type TipoAviso = 'error' | 'advertencia' | 'info';

const ESTILOS: Record<TipoAviso, string> = {
  error: 'border-red-300 bg-red-50 text-red-800',
  advertencia: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-sky-300 bg-sky-50 text-sky-900',
};

/** Aviso reutilizable. Los errores de la base de datos se pasan en `mensaje` tal cual llegan. */
@Component({
  selector: 'app-aviso',
  template: `
    @if (mensaje()) {
      <div
        class="rounded-md border px-4 py-3 text-sm"
        [class]="estilo()"
        [attr.role]="tipo() === 'error' ? 'alert' : 'status'"
      >
        {{ mensaje() }}
      </div>
    }
  `,
})
export class Aviso {
  readonly mensaje = input<string | null>(null);
  readonly tipo = input<TipoAviso>('error');
  protected readonly estilo = computed(() => ESTILOS[this.tipo()]);
}
