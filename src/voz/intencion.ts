/**
 * Lo que la app entiende de un dictado.
 *
 * Es el contrato entre las tres formas de interpretar (Gemini, el parser local
 * y la corrección a mano) y el resto de la app: todas producen esto y nada
 * más, así que cambiar de proveedor de IA no toca ninguna pantalla.
 *
 * Los números vienen en unidades **de humano** (soles con decimales, kilos),
 * porque es lo que sale de la voz. La conversión a céntimos y gramos se hace
 * al construir la entrega.
 */

export type TipoIntencion =
  | "nueva_entrega"
  | "registrar_pago"
  | "abono_deuda"
  | "ajuste_entrega"
  | "consulta"
  | "cargar_stock"
  | "desconocida";

export interface Intencion {
  intencion: TipoIntencion;
  /** El nombre tal como se dictó. La app lo empareja con el directorio. */
  cliente: string;
  pollos: number;
  piernas: number;
  /** Pechos: solo salen de partir un pollo en dos (pecho + pierna). */
  pechos: number;
  sinPesar: boolean;
  /** Las pesadas en kilos, tal como las dictó. */
  tandasKg: number[];
  /** Peso total en kilos si lo dijo directo, sin desglosar tandas. */
  pesoTotalKg: number | null;
  precioPorKg: number | null;
  /** Si dijo el total de frente («son 42 soles»). */
  totalDictado: number | null;
  /** Para pagos: cuánto le dio. `null` con `pagoTodo` significa la cuenta entera. */
  monto: number | null;
  pagoTodo: boolean;
  /** Para cargar_stock. */
  stockPollos: number | null;
  stockPiernas: number | null;
  notas: string;
}

export function intencionVacia(): Intencion {
  return {
    intencion: "desconocida",
    cliente: "",
    pollos: 0,
    piernas: 0,
    pechos: 0,
    sinPesar: false,
    tandasKg: [],
    pesoTotalKg: null,
    precioPorKg: null,
    totalDictado: null,
    monto: null,
    pagoTodo: false,
    stockPollos: null,
    stockPiernas: null,
    notas: "",
  };
}

/**
 * Normaliza lo que devuelve cualquier intérprete. Gemini a veces manda `null`
 * donde se pidió un número, o strings donde se pidió número; el parser local
 * puede dejar campos fuera. Todo pasa por aquí antes de tocar la app.
 */
export function sanear(bruto: Partial<Intencion> & Record<string, unknown>): Intencion {
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const entero = (v: unknown): number => Math.max(0, Math.round(num(v) ?? 0));

  const tandas = Array.isArray(bruto.tandasKg)
    ? bruto.tandasKg.map(num).filter((n): n is number => n !== null && n > 0)
    : [];

  const tipos: TipoIntencion[] = [
    "nueva_entrega",
    "registrar_pago",
    "abono_deuda",
    "ajuste_entrega",
    "consulta",
    "cargar_stock",
  ];
  const intencion = tipos.includes(bruto.intencion as TipoIntencion)
    ? (bruto.intencion as TipoIntencion)
    : "desconocida";

  const positivo = (v: unknown): number | null => {
    const n = num(v);
    return n !== null && n > 0 ? n : null;
  };

  return {
    intencion,
    cliente: typeof bruto.cliente === "string" ? bruto.cliente.trim() : "",
    pollos: entero(bruto.pollos),
    piernas: entero(bruto.piernas),
    pechos: entero(bruto.pechos),
    sinPesar: bruto.sinPesar === true,
    tandasKg: tandas,
    // Si vinieron tandas, el peso total es su suma y lo demás sobra.
    pesoTotalKg: tandas.length
      ? Number(tandas.reduce((a, b) => a + b, 0).toFixed(3))
      : positivo(bruto.pesoTotalKg),
    precioPorKg: positivo(bruto.precioPorKg),
    totalDictado: positivo(bruto.totalDictado),
    monto: positivo(bruto.monto),
    pagoTodo: bruto.pagoTodo === true,
    stockPollos: positivo(bruto.stockPollos),
    stockPiernas: positivo(bruto.stockPiernas),
    notas: typeof bruto.notas === "string" ? bruto.notas.trim() : "",
  };
}
