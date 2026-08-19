import type { DiaISO } from "./lib/fecha";

/**
 * El registro de novedades que se le enseña al abrir la app después de una
 * actualización (ver `ui/Novedades.tsx`).
 *
 * Cada vez que se publica un cambio que él va a notar, se agrega una entrada
 * acá — en orden cronológico, la más vieja primero. `useNovedades()` compara
 * cuántas ya vio contra `CAMBIOS.length`, así que **nunca se borra ni se
 * reordena una entrada existente**: solo se agregan nuevas al final, o se
 * rompería la cuenta de qué es viejo y qué es nuevo para quien ya abrió la
 * app antes.
 */
export interface Cambio {
  fecha: DiaISO;
  texto: string;
}

export const CAMBIOS: Cambio[] = [
  {
    fecha: "2026-08-19",
    texto:
      "Al decir «ya pagó todo» por voz, ahora redondea a la moneda más chica y perdona el resto — igual que el botón de Cobranza.",
  },
  {
    fecha: "2026-08-19",
    texto: "El botón de cobrar una deuda vieja desde el Detalle de una entrega también redondea.",
  },
  {
    fecha: "2026-08-19",
    texto:
      "Un dictado que no se entiende, o que es solo una pregunta («¿cuánto me debe...?»), ya no crea una entrega vacía.",
  },
  {
    fecha: "2026-08-19",
    texto: "El contador de «pechos» en Hoy ahora muestra los que te quedan por vender, no los que ya entregaste.",
  },
  {
    fecha: "2026-08-19",
    texto: "La tarjeta de confirmar una entrega le da más sitio al peso y al precio por kilo, y menos a pollos y piernas.",
  },
  {
    fecha: "2026-08-19",
    texto: "La app avisa de las novedades cada vez que instalas una actualización — como esta pantalla.",
  },
];
