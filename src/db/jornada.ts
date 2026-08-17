import { db, type Jornada } from "./db";
import { diaSemana, hoyISO, type DiaISO } from "../lib/fecha";
import type { Centimos } from "../lib/dinero";
import { estadoDe } from "../dominio/calculo";

/** Hora de cierre por defecto. Se cambia desde Ajustes. */
export const HORA_CIERRE_DEFECTO = "19:30";

/**
 * Una jornada en blanco, **sin escribirla**.
 *
 * Empieza siempre con stock 0 y sin entregas: cada mañana la lista arranca
 * vacía y se llena con lo que él dicte. No se arrastra nada del día anterior
 * salvo las deudas, que viven en la tienda.
 */
export function jornadaVacia(fecha: DiaISO): Jornada {
  return {
    fecha,
    stockPollos: 0,
    stockPiernas: 0,
    horaCierre: HORA_CIERRE_DEFECTO,
    estado: "abierta",
    cajaContada: null,
    cuadro: null,
    creada: Date.now(),
    cerradaEn: null,
  };
}

/**
 * La jornada de un día, **solo lectura**. Si todavía no existe devuelve una en
 * blanco sin guardarla.
 *
 * Que no escriba es lo que permite llamarla desde `useLiveQuery`: Dexie corre
 * esas consultas en una transacción de solo lectura y cualquier escritura las
 * revienta. La fila se crea de verdad cuando él carga el stock o cierra el día.
 */
export async function leerJornada(fecha: DiaISO = hoyISO()): Promise<Jornada> {
  return (await db.jornadas.get(fecha)) ?? jornadaVacia(fecha);
}

export async function guardarStock(
  fecha: DiaISO,
  stockPollos: number,
  stockPiernas: number,
  /** El precio base por kilo del día. Si no se pasa, se conserva el que hubiera. */
  precioBaseKg?: Centimos,
): Promise<void> {
  const actual = await leerJornada(fecha);
  await db.jornadas.put({
    ...actual,
    stockPollos,
    stockPiernas,
    precioBaseKg: precioBaseKg ?? actual.precioBaseKg,
  });
}

/**
 * El último precio base que puso, para sugerirlo por defecto: casi siempre es
 * el mismo del día anterior, y así no lo teclea cada mañana.
 */
export async function sugerirPrecioBase(fecha: DiaISO): Promise<Centimos> {
  const previas = await db.jornadas.where("fecha").below(fecha).toArray();
  const conBase = previas
    .filter((j) => (j.precioBaseKg ?? 0) > 0)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return conBase[0]?.precioBaseKg ?? 0;
}

/**
 * Cuánto salió, cuánto queda, cuánto cobró y cuánto falta cobrar: las cuatro
 * cifras del encabezado de Hoy.
 */
export interface ResumenDia {
  stockPollos: number;
  stockPiernas: number;
  repartidoPollos: number;
  repartidoPiernas: number;
  /** Pechos entregados = pollos que se partieron en dos. */
  repartidoPechos: number;
  restantePollos: number;
  restantePiernas: number;
  /**
   * Pechos sueltos por vender: el reverso del despiece. Si entregó más
   * piernas de las que tenía sueltas o le dejaron los pechos, esa diferencia
   * solo pudo salir de partir pollos enteros por la pierna, y cada uno dejó
   * un pecho sin dueño todavía.
   */
  pechosLibres: number;
  cobrado: Centimos;
  /** Lo del día que falta, **sin** las deudas viejas. */
  porCobrarDelDia: Centimos;
  descuentos: Centimos;
  /** Lo que gastó hoy y salió de la misma caja. */
  gastos: Centimos;
  tiendas: number;
  entregas: number;
}

export async function resumenDe(fecha: DiaISO): Promise<ResumenDia> {
  const [jornada, entregas, gastos] = await Promise.all([
    leerJornada(fecha),
    db.entregas.where("fecha").equals(fecha).toArray(),
    db.gastos.where("fecha").equals(fecha).toArray(),
  ]);

  const repartidoPollos = entregas.reduce((a, e) => a + e.pollos, 0);
  const repartidoPiernas = entregas.reduce((a, e) => a + e.piernas, 0);
  const repartidoPechos = entregas.reduce((a, e) => a + (e.pechos ?? 0), 0);

  /*
   * El despiece va en las dos direcciones:
   *
   * Cada pecho entregado salió de romper un pollo entero, así que se
   * descuenta del stock de pollos igual que uno entero. Y ese mismo pollo
   * dejó una pierna suelta, que se suma al montón de piernas por vender —
   * las que compró aparte más las que va sacando en ruta.
   *
   * Si aun así entregó más piernas de las que tenía sueltas, esas de más
   * solo pudieron salir de partir pollos enteros por la pierna: cada una
   * gasta un pollo más y deja un pecho suelto, todavía sin vender.
   */
  const piernasDisponibles = jornada.stockPiernas + repartidoPechos;
  const roturasPorPierna = Math.max(0, repartidoPiernas - piernasDisponibles);

  return {
    stockPollos: jornada.stockPollos,
    stockPiernas: jornada.stockPiernas,
    repartidoPollos,
    repartidoPiernas,
    repartidoPechos,
    restantePollos: jornada.stockPollos - repartidoPollos - repartidoPechos - roturasPorPierna,
    restantePiernas: Math.max(0, piernasDisponibles - repartidoPiernas),
    pechosLibres: roturasPorPierna,
    cobrado: entregas.reduce((a, e) => a + e.totalCobrado, 0),
    // Solo mientras el día está abierto. Al cerrarlo, lo que faltaba se
    // convirtió en deuda de la tienda; seguir contándolo aquí lo sumaría dos
    // veces y le enseñaría un «por cobrar» inflado.
    porCobrarDelDia:
      jornada.estado === "cerrada"
        ? 0
        : entregas.reduce(
            (a, e) => a + Math.max(0, e.totalCalculado - e.totalCobrado - e.descuentoRedondeo),
            0,
          ),
    descuentos: entregas.reduce((a, e) => a + e.descuentoRedondeo, 0),
    gastos: gastos.reduce((a, g) => a + g.monto, 0),
    tiendas: new Set(entregas.map((e) => e.tiendaId)).size,
    entregas: entregas.length,
  };
}

/**
 * Cierra el día. Lo que quedó sin cobrar **pasa a deuda de cada tienda**, que
 * es lo que hace que al día siguiente aparezca en Cobranza junto a lo nuevo.
 *
 * Es la única operación que no se puede deshacer desde la interfaz, así que la
 * pantalla pregunta antes.
 */
export async function cerrarDia(
  fecha: DiaISO,
  cajaContada: Centimos | null,
  cuadro: boolean | null,
): Promise<void> {
  await db.transaction("rw", db.jornadas, db.entregas, db.deudas, async () => {
    // Puede que no exista todavía: se cierra igual, con el stock en cero.
    const jornada = (await db.jornadas.get(fecha)) ?? jornadaVacia(fecha);
    // Cerrar dos veces duplicaría todas las deudas del día, y el repartidor
    // vería a sus clientes debiendo el doble sin haber hecho nada.
    if (jornada.estado === "cerrada") return;

    const entregas = await db.entregas.where("fecha").equals(fecha).toArray();
    const ahora = Date.now();

    for (const e of entregas) {
      const saldo = e.totalCalculado - e.totalCobrado - e.descuentoRedondeo;
      if (saldo <= 0) continue;
      await db.deudas.add({
        tiendaId: e.tiendaId,
        entregaId: e.id ?? null,
        fechaOrigen: fecha,
        monto: saldo,
        saldado: 0,
        cerrada: 0,
        creada: ahora,
      });
    }

    await db.jornadas.put({
      ...jornada,
      estado: "cerrada",
      cajaContada,
      cuadro: cuadro === null ? null : cuadro ? 1 : 0,
      cerradaEn: ahora,
    });
  });
}

/**
 * Cierra solos los días que quedaron abiertos.
 *
 * Si él no cierra la jornada —y en la calle se olvida—, lo que quedó sin cobrar
 * nunca pasa a deuda y al día siguiente no aparece en Cobranza: la plata se
 * vuelve invisible. Esto se ejecuta al abrir la app y cierra todo día anterior
 * a hoy que siga abierto, incluidos los que ni siquiera tienen fila de jornada
 * porque ese día no llegó a cargar stock.
 *
 * No toca el día de hoy: ese lo cierra él cuando cuadra la caja.
 */
export async function cerrarDiasPasados(hoy: DiaISO = hoyISO()): Promise<number> {
  const [jornadas, entregas] = await Promise.all([
    db.jornadas.toArray(),
    db.entregas.toArray(),
  ]);

  const pendientes = new Set<DiaISO>();
  for (const j of jornadas) if (j.fecha < hoy && j.estado === "abierta") pendientes.add(j.fecha);
  // Días con entregas pero sin jornada: también hay que cerrarlos.
  const cerradas = new Set(jornadas.filter((j) => j.estado === "cerrada").map((j) => j.fecha));
  for (const e of entregas) if (e.fecha < hoy && !cerradas.has(e.fecha)) pendientes.add(e.fecha);

  for (const fecha of pendientes) {
    // Sin caja contada: no la contó, y apuntar un número inventado sería peor.
    await cerrarDia(fecha, null, null);
  }
  return pendientes.size;
}

/**
 * Cuánto suele cargar un día como este. Es una recomendación, no una orden:
 * promedia lo repartido los mismos días de semana y avisa de lo que sobró.
 */
export interface Sugerencia {
  pollos: number;
  piernas: number;
  /** El texto que se muestra bajo los contadores. "" si no hay historia. */
  texto: string;
}

export async function sugerirStock(fecha: DiaISO): Promise<Sugerencia> {
  const dow = diaSemana(fecha);
  const cerradas = await db.jornadas.where("estado").equals("cerrada").toArray();
  const mismos = cerradas
    .filter((j) => diaSemana(j.fecha) === dow && j.fecha < fecha)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .slice(0, 4);

  if (mismos.length === 0) return { pollos: 0, piernas: 0, texto: "" };

  const repartos = await Promise.all(mismos.map((j) => resumenDe(j.fecha)));
  const media = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

  const pollos = media(repartos.map((r) => r.repartidoPollos));
  const piernas = media(repartos.map((r) => r.repartidoPiernas));
  const sobraron = repartos[0].restantePollos;

  const nombreDia = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"][
    dow
  ];
  const cola =
    sobraron > 0
      ? ` El ${nombreDia.replace(/s$/, "")} pasado te sobraron ${sobraron}.`
      : sobraron < 0
        ? ` El ${nombreDia.replace(/s$/, "")} pasado te faltaron ${-sobraron}.`
        : "";

  return {
    pollos,
    piernas,
    texto: `Los ${nombreDia} repartes ~${pollos} pollos.${cola}`,
  };
}

/** Reexporta lo que las pantallas necesitan sin importar de dos sitios. */
export { estadoDe };
