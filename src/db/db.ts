import Dexie, { type Table } from "dexie";
import type { DiaISO } from "../lib/fecha";
import type { Centimos, Gramos } from "../lib/dinero";

/**
 * IndexedDB no admite booleanos como clave, así que todo campo que se indexa
 * se guarda como 0 | 1.
 */
export type Bandera = 0 | 1;

export type EstadoPago = "pendiente" | "parcial" | "pagado";

/**
 * Una tienda del directorio.
 *
 * Nunca se cargan a mano: nacen del primer dictado que las nombra y se van
 * afinando solas. Los tres campos de señales son lo que permite distinguir a
 * dos clientes con el mismo nombre — ver CLAUDE.md §6.
 */
export interface Tienda {
  id?: number;
  nombre: string;
  /** El nombre pasado por `normalizar()`: sin acentos, sin honoríficos. Indexado. */
  nombreNorm: string;
  /** Otras formas en que la ha nombrado al dictar. También normalizadas. */
  alias: string[];

  /** 0 = no tiene precio fijo todavía. En céntimos por kilo. */
  precioKgDefecto: Centimos;
  /**
   * Cuánto más (o menos, si es negativo) que el **precio base del día** cobra
   * esta tienda, en céntimos por kilo. Se aprende al registrar: si un día con
   * base S/ 9.50 se le cobra S/ 9.70, su offset queda en +20. Así, cuando el
   * base cambia otro día, su precio se recalcula solo (base + offset), sin
   * perder que a ella se le da «dos puntos más». `undefined` = todavía no se
   * sabe su diferencia; se usa su `precioKgDefecto` absoluto mientras tanto.
   */
  precioOffsetKg?: Centimos;
  /** Para las tiendas sin pesar: precio por pollo, en céntimos. */
  precioPolloDefecto: Centimos;
  /** 1 si se le pesa el pollo, 0 si es de trato cerrado. */
  pesa: Bandera;

  /** Posición típica en la ruta. Se recalcula al aprender. 0 = desconocida. */
  ordenRuta: number;
  notas: string;

  /* ── Señales aprendidas para la correlación ────────────────────────── */
  /** Minuto del día de cada entrega pasada. Se conservan las últimas 40. */
  minutos: number[];
  /** Ordinal dentro de su jornada (1 = primera parada del día). Últimas 40. */
  posiciones: number[];
  /** { id de la tienda que la precedió: cuántas veces }. */
  precedentes: Record<number, number>;

  /** Cuántas entregas se le han hecho. Un desempate barato en frío. */
  vistas: number;
  creada: number;
  ultimaVez: number;
}

/** Un día de reparto. La clave primaria es la fecha: solo hay uno por día. */
export interface Jornada {
  fecha: DiaISO;
  stockPollos: number;
  stockPiernas: number;
  /**
   * El precio por kilo base del día, en céntimos. Se aplica a todas las
   * entregas por defecto; cada tienda lo ajusta con su `precioOffsetKg`. Hay
   * días que el precio sube o baja para todos, y aquí es donde se pone.
   * `undefined`/0 = no se fijó, y cada tienda usa su precio absoluto.
   */
  precioBaseKg?: Centimos;
  /** "19:30". Solo para el recordatorio de cuadrar caja. */
  horaCierre: string;
  /** `abierta` mientras reparte; `cerrada` congela el día. */
  estado: "abierta" | "cerrada";
  /** Lo que contó de verdad en el bolsillo, si lo registró. */
  cajaContada: Centimos | null;
  /** 1 si al cerrar dijo que cuadraba. */
  cuadro: Bandera | null;
  creada: number;
  cerradaEn: number | null;
}

/**
 * Una entrega. Puede haber varias a la misma tienda el mismo día y no se
 * mezclan: cada una es su propia fila (plan §9.8).
 */
export interface Entrega {
  id?: number;
  fecha: DiaISO;
  tiendaId: number;
  /** Ordinal dentro del día: 1 = la primera que registró. */
  orden: number;
  /** Minuto del día en que se registró. Alimenta la correlación. */
  minuto: number;

  /** Pollos enteros. */
  pollos: number;
  /** Piernas del stock que compra aparte. */
  piernas: number;
  /**
   * Pechos, que solo salen de partir un pollo en dos (pecho + pierna).
   *
   * Por eso un pecho entregado significa que se rompió un pollo entero: se
   * descuenta del stock de pollos, y la pierna que sobró entra al montón de
   * piernas por vender. Esa es toda la contabilidad del despiece.
   */
  pechos: number;
  /** 1 = cliente de confianza, no se pesa: manda el total dictado. */
  sinPesar: Bandera;
  /** Las pesadas, en gramos. Se suman para dar `peso`. */
  tandas: Gramos[];
  peso: Gramos;
  /** Céntimos por kilo. 0 si fue sin pesar. */
  precioKg: Centimos;

  /**
   * `totalCalculado` y `totalCobrado` van separados a propósito: es lo que
   * permite el redondeo a favor del cliente sin perder el cálculo exacto.
   */
  totalCalculado: Centimos;
  totalCobrado: Centimos;
  /** Lo que dejó de cobrar por redondear. La suma del mes es cuánto regala. */
  descuentoRedondeo: Centimos;
  estadoPago: EstadoPago;

  notas: string;
  creada: number;
}

/** Un cobro. `deudaAnterior` es lo que se aplicó a días pasados. */
export interface Pago {
  id?: number;
  tiendaId: number;
  entregaId: number | null;
  fecha: DiaISO;
  monto: Centimos;
  tipo: "delDia" | "deudaAnterior";
  creada: number;
}

/**
 * Lo que quedó debiendo un día que ya cerró. Vive en la tienda, no en el día:
 * al cobrar de retorno se salda junto con lo de hoy, y **primero la deuda**.
 */
export interface Deuda {
  id?: number;
  tiendaId: number;
  entregaId: number | null;
  fechaOrigen: DiaISO;
  monto: Centimos;
  saldado: Centimos;
  cerrada: Bandera;
  creada: number;
}

export type EstadoDictado = "pendiente" | "procesado" | "descartado" | "error";

/**
 * La cola offline. El audio se guarda **antes** de llamar a nada: si Gemini
 * falla, no hay señal o no hay key, lo dicho no se pierde y se reintenta.
 */
export interface Dictado {
  id?: number;
  fecha: DiaISO;
  minuto: number;
  audioBlob?: Blob;
  duracionMs: number;
  /** Lo que entendió el reconocedor de Android. Puede estar vacío si falló. */
  transcripcion: string;
  estado: EstadoDictado;
  /** Qué intención se dedujo, y con qué. */
  intencion?: string;
  json?: string;
  /** `local` = lo armó el parser de reglas y conviene que Gemini lo repase. */
  origen?: "gemini" | "local";
  /** A qué entrega/pago dio lugar, para poder deshacer. */
  entregaId?: number;
  error?: string;
  creada: number;
}

/**
 * Un gasto del día: el almuerzo, la gasolina, un antojo.
 *
 * Va aparte de las entregas porque no es plata de un cliente, pero **sí sale de
 * la misma caja**: sin apuntarlo, al cuadrar por la noche siempre falta dinero
 * y parece que alguien no pagó.
 */
export interface Gasto {
  id?: number;
  fecha: DiaISO;
  concepto: string;
  monto: Centimos;
  creada: number;
}

/** Clave-valor para lo que configura el usuario (la API key, el modelo…). */
export interface Ajuste {
  clave: string;
  valor: string;
}

/**
 * Un informe de Gemini, guardado para no tener que regenerarlo cada vez que
 * se vuelve a ver. `clave` es `dia-2026-08-18` o `semana-2026-08-18` (esta
 * última fechada el día en que se generó, porque la ventana de 7 días se
 * corre a diario).
 */
export interface Informe {
  clave: string;
  resumen: string;
  destacados: string[];
  creado: number;
}

class BaseDonPio extends Dexie {
  tiendas!: Table<Tienda, number>;
  jornadas!: Table<Jornada, string>;
  entregas!: Table<Entrega, number>;
  pagos!: Table<Pago, number>;
  deudas!: Table<Deuda, number>;
  dictados!: Table<Dictado, number>;
  gastos!: Table<Gasto, number>;
  ajustes!: Table<Ajuste, string>;
  informes!: Table<Informe, string>;

  constructor() {
    super("donpio");
    this.version(1).stores({
      tiendas: "++id, nombreNorm, ordenRuta, ultimaVez",
      jornadas: "fecha, estado",
      entregas: "++id, fecha, tiendaId, orden, [fecha+tiendaId]",
      pagos: "++id, tiendaId, fecha, entregaId",
      deudas: "++id, tiendaId, cerrada, fechaOrigen",
      dictados: "++id, fecha, estado, creada",
      ajustes: "clave",
    });

    // `pechos` no se indexa, así que los índices no cambian; la migración solo
    // existe para que las entregas ya guardadas tengan 0 en vez de `undefined`
    // y no envenenen las sumas con NaN.
    this.version(2)
      .stores({})
      .upgrade((tx) =>
        tx
          .table<Entrega>("entregas")
          .toCollection()
          .modify((e) => {
            e.pechos = e.pechos ?? 0;
          }),
      );

    this.version(4).stores({ gastos: "++id, fecha, creada" });

    this.version(5).stores({ informes: "clave" });
  }
}

export const db = new BaseDonPio();

/** Una tienda recién nacida, con todas sus señales vacías. */
export function tiendaNueva(nombre: string, nombreNorm: string): Tienda {
  const ahora = Date.now();
  return {
    nombre,
    nombreNorm,
    alias: [],
    precioKgDefecto: 0,
    precioPolloDefecto: 0,
    pesa: 1,
    ordenRuta: 0,
    notas: "",
    minutos: [],
    posiciones: [],
    precedentes: {},
    vistas: 0,
    creada: ahora,
    ultimaVez: 0,
  };
}
