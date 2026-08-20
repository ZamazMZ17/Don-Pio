import type { Centimos, Gramos } from "../lib/dinero";
import { kgCorto, totalDePeso } from "../lib/dinero";
import type { EstadoPago, Entrega } from "../db/db";

/**
 * Los datos de una entrega en una línea: «3 pollos · 7.7 kg · 8.80/kg». Se usa
 * igual en la agenda de Hoy, en la vista de ruta y en Cobranza, para que lo
 * entregado se lea igual en todas.
 */
export function descripcionEntrega(
  e: Pick<Entrega, "pollos" | "pechos" | "piernas" | "peso" | "precioKg">,
): string {
  // Singular de verdad: «1 pollos» se lee a error de la app.
  const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
  const partes: string[] = [];
  if (e.pollos) partes.push(cuantos(e.pollos, "pollo", "pollos"));
  if (e.pechos) partes.push(cuantos(e.pechos, "pecho", "pechos"));
  if (e.piernas) partes.push(cuantos(e.piernas, "pierna", "piernas"));
  if (partes.length === 0) partes.push("sin cantidad");
  // Sin peso no se enseña «0.0 kg · 0.00/kg»: eso parece un error de la app,
  // no una entrega de trato cerrado.
  partes.push(e.peso > 0 ? `${kgCorto(e.peso)} · ${(e.precioKg / 100).toFixed(2)}/kg` : "sin pesar");
  return partes.join(" · ");
}

/**
 * Las reglas de cálculo del negocio, sin nada de React ni de base de datos.
 * Todo aquí es una función pura, y por eso es lo único que se prueba a fondo:
 * si esto está mal, el repartidor pierde plata de verdad.
 */

export interface EntradaEntrega {
  /** Las pesadas. Si vienen, el peso es su suma y no se discute. */
  tandas?: Gramos[];
  /** Peso ya sumado, para cuando lo dictó directo («veintiséis kilos»). */
  peso?: Gramos;
  precioKg?: Centimos;
  /** Él dijo el total de frente («son 42 soles»). Manda sobre el cálculo. */
  totalDictado?: Centimos;
  sinPesar?: boolean;
  pollos?: number;
  /** Precio por pollo, para las tiendas de trato cerrado. */
  precioPollo?: Centimos;
}

export interface Cuenta {
  peso: Gramos;
  precioKg: Centimos;
  total: Centimos;
  /** De dónde salió el total. Se muestra en la tarjeta para que no se confunda. */
  origen: "peso" | "dictado" | "pollos" | "incompleto";
}

/** El peso es la suma de las tandas. Sin sorpresas: gramos enteros. */
export function sumarTandas(tandas: Gramos[]): Gramos {
  return tandas.reduce((a, t) => a + t, 0);
}

/**
 * Arma la cuenta de una entrega a partir de lo que se pudo sacar del dictado.
 *
 * El orden de precedencia importa y sale del plan §4.3:
 *   1. Si dictó el total, ese es el total. Punto — él sabe lo que cobró.
 *   2. Si hay peso y precio por kilo, total = peso × precio.
 *   3. Si es sin pesar y hay precio por pollo, total = pollos × precio.
 *   4. Si no alcanza para nada, `incompleto` y la tarjeta lo pide a mano.
 */
export function calcular(e: EntradaEntrega): Cuenta {
  const peso = e.tandas?.length ? sumarTandas(e.tandas) : (e.peso ?? 0);
  const precioKg = e.precioKg ?? 0;

  if (e.totalDictado !== undefined && e.totalDictado > 0) {
    return {
      peso,
      // Si dictó total y peso, se deduce el precio por kilo. No cambia lo que
      // cobra hoy, pero es lo que deja ver luego si a alguien le está dejando
      // el kilo muy barato.
      precioKg: peso > 0 ? precioImplicito(e.totalDictado, peso) : precioKg,
      total: e.totalDictado,
      origen: "dictado",
    };
  }

  if (peso > 0 && precioKg > 0) {
    return { peso, precioKg, total: totalDePeso(precioKg, peso), origen: "peso" };
  }

  if (e.sinPesar && e.pollos && e.precioPollo) {
    return { peso: 0, precioKg: 0, total: e.pollos * e.precioPollo, origen: "pollos" };
  }

  return { peso, precioKg, total: 0, origen: "incompleto" };
}

/** Cuánto salió el kilo, dado un total y un peso. Para el historial. */
export function precioImplicito(total: Centimos, peso: Gramos): Centimos {
  if (peso <= 0) return 0;
  return Math.round((total * 1000) / peso);
}

/* ── Cobros ──────────────────────────────────────────────────────────── */

export interface Reparto {
  /** Lo que se va a saldar de días anteriores. */
  aDeuda: Centimos;
  /** Lo que se va a lo de hoy. */
  aHoy: Centimos;
  /** Lo que le sigue quedando debiendo después de este pago. */
  restante: Centimos;
  /** Lo que dio de más, si dio de más. */
  vuelto: Centimos;
  /**
   * Si el resto es tan chico que es evidente que fue un redondeo a su favor
   * («son 56.90, tome 56.50»), se marca aparte en vez de dejarlo como deuda.
   */
  esRedondeo: boolean;
}

/**
 * Hasta cuánto puede perdonarse como descuento en vez de quedar como deuda.
 *
 * Veinte soles, porque no siempre es un redondeo: a veces un ala viene mal y
 * le baja un sol, o le rebaja bastante más por producto en mal estado. Por
 * encima de eso ya es que se quedó debiendo, y perdonarlo le escondería
 * plata. (Empezó en cinco soles; subido a veinte a pedido del dueño.)
 *
 * **Nunca se aplica solo**: él lo marca en la pantalla de cobro.
 */
export const TOPE_REDONDEO = 2000;

/**
 * Reparte un pago entre la deuda vieja y lo del día. **La deuda va primero**:
 * es la regla del negocio (CLAUDE.md §7) y además es lo que él espera, porque
 * lo viejo es lo que corre riesgo de no cobrarse nunca.
 */
export function repartirPago(
  monto: Centimos,
  deuda: Centimos,
  saldoDia: Centimos,
): Reparto {
  const aDeuda = Math.min(Math.max(monto, 0), deuda);
  const aHoy = Math.min(Math.max(monto - aDeuda, 0), saldoDia);
  const cuenta = deuda + saldoDia;
  const diferencia = cuenta - monto;

  const restante = Math.max(0, diferencia);
  const vuelto = Math.max(0, -diferencia);

  return {
    aDeuda,
    aHoy,
    restante,
    vuelto,
    esRedondeo: restante > 0 && restante <= TOPE_REDONDEO,
  };
}

/**
 * Redondeo hacia abajo opcional (Ajustes). Nunca reemplaza al cálculo: solo
 * sugiere qué cobrar. `totalCalculado` se guarda intacto siempre.
 */
export function redondearAbajo(total: Centimos, a: 50 | 100): Centimos {
  return Math.floor(total / a) * a;
}

export function estadoDe(totalCalculado: Centimos, cobrado: Centimos): EstadoPago {
  /*
   * Sin total no hay nada que dar por pagado. Pasaba con las entregas que deja
   * sin pesar: total 0, cobrado 0, y `0 >= 0` las pintaba de verde como si ya
   * hubiera cobrado. Una entrega a medias está pendiente, que es justo lo que
   * él necesita ver para volver a pesarla.
   */
  if (totalCalculado <= 0) return "pendiente";
  if (cobrado >= totalCalculado) return "pagado";
  if (cobrado > 0) return "parcial";
  return "pendiente";
}

export const COLOR_ESTADO: Record<EstadoPago, string> = {
  pagado: "var(--verde)",
  parcial: "var(--ambar-señal)",
  pendiente: "var(--rojo)",
};

export const TEXTO_ESTADO: Record<EstadoPago, string> = {
  pagado: "Pagado",
  parcial: "Parcial",
  pendiente: "Pendiente",
};
