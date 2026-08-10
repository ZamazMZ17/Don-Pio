/**
 * Fechas en local, nunca en UTC.
 *
 * La jornada es «el día del repartidor», que empieza a las 5 a.m. y termina
 * cuando él cierra caja. Si se usara UTC, en Perú (UTC-5) todo lo dictado antes
 * de las 7 p.m. caería en el día correcto pero lo de después no, y las entregas
 * de la tarde aparecerían en la jornada de mañana.
 */

/** "2026-08-07". Es la clave primaria de las jornadas. */
export type DiaISO = string;

export function hoyISO(fecha = new Date()): DiaISO {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function desdeISO(dia: DiaISO): Date {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "Lunes 8" — el encabezado de Hoy. */
export function diaCorto(dia: DiaISO): string {
  const f = desdeISO(dia);
  return `${DIAS[f.getDay()]} ${f.getDate()}`;
}

/** "8 de agosto" — el subtítulo del detalle de un día cerrado. */
export function diaLargo(dia: DiaISO): string {
  const f = desdeISO(dia);
  return `${f.getDate()} de ${MESES[f.getMonth()]}`;
}

/** "Lu" — la etiqueta de las barras del historial. */
export function inicialDia(dia: DiaISO): string {
  return ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"][desdeISO(dia).getDay()];
}

/** 0 = domingo … 6 = sábado. La sugerencia de stock se agrupa por esto. */
export function diaSemana(dia: DiaISO): number {
  return desdeISO(dia).getDay();
}

export function sumarDias(dia: DiaISO, n: number): DiaISO {
  const f = desdeISO(dia);
  f.setDate(f.getDate() + n);
  return hoyISO(f);
}

/** Los últimos `n` días terminando en `dia`, del más viejo al más nuevo. */
export function ultimosDias(dia: DiaISO, n: number): DiaISO[] {
  return Array.from({ length: n }, (_, i) => sumarDias(dia, i - n + 1));
}

/**
 * Minuto del día (0–1439). Es la señal de hora que usa la correlación de
 * tiendas: lo que separa a la Elsa de la mañanita de la Elsa de la tarde.
 */
export function minutoDelDia(fecha = new Date()): number {
  return fecha.getHours() * 60 + fecha.getMinutes();
}

/** 640 → "10:40". Se muestra al desambiguar («sueles verla 10:40»). */
export function horaTxt(minuto: number): string {
  const h = Math.floor(minuto / 60) % 24;
  const m = minuto % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** "5:04 a.m." — la cabecera de Cargar stock. */
export function horaAmPm(fecha = new Date()): string {
  const h = fecha.getHours();
  const m = String(fecha.getMinutes()).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${h < 12 ? "a.m." : "p.m."}`;
}
