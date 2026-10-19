// Validación de comodidad en los formularios. La autoridad sigue siendo la base de datos:
// aquí solo se evita escribir caracteres que la base va a rechazar de todos modos.

const LETRAS_NOMBRE = /[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s'’-]/g;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Deja solo dígitos y corta al largo indicado (sirve al escribir y al pegar). */
export function soloDigitos(valor: string, max: number): string {
  return valor.replace(/\D/g, '').slice(0, max);
}

/** Teléfono de 9 dígitos: al pegar "+51 987 654 321" se descarta el prefijo del país. */
export function limpiarTelefono(valor: string): string {
  const digitos = valor.replace(/\D/g, '');
  const nacional = digitos.length > 9 && digitos.startsWith('51') ? digitos.slice(2) : digitos;
  return nacional.slice(0, 9);
}

/** Nombres y apellidos: letras (con tildes y ñ), espacios, apóstrofe y guion; sin números. */
export function limpiarNombre(valor: string, max = 80): string {
  return valor
    .replace(LETRAS_NOMBRE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '')
    .slice(0, max);
}

/** Texto libre en una línea (dirección): sin saltos ni caracteres de control. */
export function limpiarTexto(valor: string, max: number): string {
  const sinControl = Array.from(valor, (c) => {
    const codigo = c.charCodeAt(0);
    return codigo < 32 || codigo === 127 ? ' ' : c;
  }).join('');
  return sinControl.replace(/^s+/, '').slice(0, max);
}

/** Monto: solo dígitos y un punto decimal, hasta 2 decimales y 6 dígitos enteros. La coma se toma como punto. */
export function limpiarMonto(valor: string): string {
  const limpio = valor.replace(',', '.').replace(/[^0-9.]/g, '');
  const [entero, ...resto] = limpio.split('.');
  const decimales = resto.join('').slice(0, 2);
  const parteEntera = entero.slice(0, 6);
  return resto.length > 0 ? `${parteEntera}.${decimales}` : parteEntera;
}

/** Aplica un sanitizador al campo que disparó el evento y devuelve el texto limpio. */
export function limpiarCampo(evento: Event, limpiar: (valor: string) => string): string {
  const campo = evento.target as HTMLInputElement;
  const limpio = limpiar(campo.value);
  if (campo.value !== limpio) campo.value = limpio;
  return limpio;
}

/** En campos numéricos enteros: bloquea e, E, +, -, punto y coma (el resto de teclas sigue igual). */
export function bloquearNoEnteros(evento: KeyboardEvent): void {
  if (['e', 'E', '+', '-', '.', ','].includes(evento.key)) evento.preventDefault();
}

export function errorDni(valor: string): string | null {
  return valor && valor.length !== 8 ? 'El DNI debe tener exactamente 8 dígitos.' : null;
}

export function errorRuc(valor: string): string | null {
  if (!valor) return null;
  if (valor.length >= 2 && !/^(10|20)/.test(valor)) return 'El RUC debe empezar con 10 o 20.';
  return valor.length !== 11 ? 'El RUC debe tener exactamente 11 dígitos.' : null;
}

export function errorTelefono(valor: string): string | null {
  if (!valor) return null;
  if (!valor.startsWith('9')) return 'El teléfono debe empezar con 9.';
  return valor.length !== 9 ? 'El teléfono debe tener exactamente 9 dígitos.' : null;
}

export function telefonoValido(valor: string): boolean {
  return /^9\d{8}$/.test(valor);
}

export function correoValido(valor: string): boolean {
  return CORREO.test(valor);
}

/** Fecha de hoy del navegador como 'AAAA-MM-DD' (sin pasar por UTC, para no correr el día). */
export function hoyISO(): string {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

/** Suma años a una fecha 'AAAA-MM-DD'. */
export function sumarAnios(fecha: string, anios: number): string {
  return `${Number(fecha.slice(0, 4)) + anios}${fecha.slice(4)}`;
}

/**
 * Quita las tildes y diéresis (á, é, í, ó, ú, ü) para comparar nombres sin importar cómo se escribieron.
 * La ñ se conserva: es otra letra ("PEÑA" no es "PENA").
 */
export function sinTildes(valor: string): string {
  return valor
    .replace(/ñ/g, '')
    .replace(/Ñ/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(//g, 'ñ')
    .replace(//g, 'Ñ');
}
