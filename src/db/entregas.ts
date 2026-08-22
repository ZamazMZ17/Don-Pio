import { db, type Deuda, type Entrega, type Pago, type Tienda } from "./db";
import { leerJornada } from "./jornada";
import { hoyISO, type DiaISO } from "../lib/fecha";
import { aCobrar, type Centimos, type Gramos } from "../lib/dinero";
import { calcular, estadoDe, repartirPago, sumarTandas, TOPE_REDONDEO } from "../dominio/calculo";
import { aprenderDeEntrega, aprenderPrecioDeEntrega } from "./tiendas";
import type { Contexto } from "../tiendas/emparejar";
import { paradaDe } from "../tiendas/ruta";

export interface DatosEntrega {
  tiendaId: number;
  pollos: number;
  piernas?: number;
  pechos?: number;
  sinPesar?: boolean;
  tandas?: Gramos[];
  peso?: Gramos;
  precioKg?: Centimos;
  precioPollo?: Centimos;
  totalDictado?: Centimos;
  notas?: string;
}

/**
 * Registra una entrega y aprende de ella.
 *
 * Varias entregas a la misma tienda el mismo día conviven como filas
 * separadas: si vuelve a pasar por donde Julio, es una entrega más, no una
 * corrección de la anterior (plan §9.8).
 */
export async function registrarEntrega(
  datos: DatosEntrega,
  ctx: Contexto,
  opciones: { fecha?: DiaISO; dictado?: string } = {},
): Promise<number> {
  const fecha = opciones.fecha ?? hoyISO();
  const cuenta = calcular(datos);
  const tandas = datos.tandas ?? [];

  const entrega: Entrega = {
    fecha,
    tiendaId: datos.tiendaId,
    orden: ctx.posicion,
    minuto: ctx.minuto,
    pollos: datos.pollos,
    piernas: datos.piernas ?? 0,
    pechos: datos.pechos ?? 0,
    sinPesar: datos.sinPesar ? 1 : 0,
    tandas,
    peso: cuenta.peso,
    precioKg: cuenta.precioKg,
    totalCalculado: cuenta.total,
    totalCobrado: 0,
    descuentoRedondeo: 0,
    estadoPago: "pendiente",
    notas: datos.notas ?? "",
    creada: Date.now(),
  };

  const id = await db.entregas.add(entrega);

  // El precio base del día, para que la tienda aprenda su diferencia respecto
  // de él (ver `precioOffsetKg`).
  const jornada = await leerJornada(fecha);

  await aprenderDeEntrega(datos.tiendaId, ctx, {
    dictado: opciones.dictado,
    /*
     * Se aprende de `cuenta.precioKg` — lo que de verdad resultó cobrado por
     * kilo — no de `datos.precioKg`, que cuando no dictó un precio explícito
     * es solo la sugerencia de siempre (base + su diferencia ya conocida).
     * Usar esa sugerencia como si fuera lo dictado es un no-op casi siempre
     * (la diferencia sale igual a la que ya tenía), pero cuando dicta un
     * total («son 17.68 soles») y el precio real que eso implica ya no
     * coincide con la sugerencia vieja, la diferencia se quedaba pegada al
     * valor de siempre y nunca se corregía — aunque llevara días cobrando
     * otra cosa. `cuenta.precioKg` es 0 en las entregas sin pesar (se cobra
     * por pollo, no por kilo), y `aprenderDeEntrega` ya ignora un precio en
     * 0, así que esas no aprenden nada — como debe ser.
     */
    precioKg: cuenta.precioKg,
    precioPollo: datos.precioPollo,
    sinPesar: datos.sinPesar,
    precioBaseKg: jornada.precioBaseKg,
  });

  return id;
}

/** Recalcula el total tras editar cantidades, tandas o precio. */
export async function editarEntrega(
  id: number,
  cambios: Partial<
    Pick<
      Entrega,
      "pollos" | "piernas" | "pechos" | "tandas" | "peso" | "precioKg" | "sinPesar" | "notas"
    >
  >,
): Promise<void> {
  const e = await db.entregas.get(id);
  if (!e) return;

  const tandas = cambios.tandas ?? e.tandas;
  const precioKg = cambios.precioKg ?? e.precioKg;

  /*
   * El peso sale de las tandas **solo si las hay**. Muchas entregas son de una
   * sola pesada y se guardan con `peso` y sin tandas; recalcularlo desde una
   * lista vacía lo ponía a cero, y entonces cambiar el precio por kilo borraba
   * el peso y dejaba el total viejo colgado.
   */
  const peso =
    cambios.peso ??
    (tandas.length > 0 ? sumarTandas(tandas) : cambios.tandas !== undefined ? 0 : e.peso);

  // Si la entrega nació de un total dictado no hay precio por kilo que aplicar:
  // bajar el peso por merma no puede convertirla en gratis.
  const total =
    precioKg > 0 && peso > 0 ? Math.round((precioKg * peso) / 1000) : e.totalCalculado;

  await db.transaction("rw", db.entregas, db.deudas, db.jornadas, async () => {
    await db.entregas.update(id, {
      ...cambios,
      tandas,
      peso,
      precioKg,
      totalCalculado: total,
      estadoPago: estadoDe(total, e.totalCobrado + e.descuentoRedondeo),
    });
    // Si el día ya está cerrado, lo que quedó por cobrar vive en `deudas`: la
    // corrección tiene que llegar hasta ahí o la diferencia se pierde.
    await ajustarDeudaTrasCorregir(e, saldoDe(e), total - e.totalCobrado - e.descuentoRedondeo);
  });

  /*
   * Corregir el precio aquí también enseña. Es como él trabaja de verdad:
   * registra la entrega y al rato cuadra el precio en el Detalle. Sin esto,
   * la entrega quedaba con el precio bueno pero la tienda no se enteraba, y
   * al día siguiente volvía a proponer el de antes.
   *
   * Se mide contra el base de **su** jornada, no el de hoy: una entrega de un
   * día cerrado se corrige contra el precio que regía ese día.
   */
  if (precioKg > 0 && precioKg !== e.precioKg) {
    const jornada = await leerJornada(e.fecha);
    await aprenderPrecioDeEntrega(e.tiendaId, precioKg, jornada.precioBaseKg);
  }
}

/**
 * Fija el total a mano, sin pasar por peso × precio.
 *
 * Hace falta porque muchas veces es una sola pesada y lo que él sabe es el
 * total: obligarle a cuadrarlo moviendo el precio es al revés de como piensa.
 * Si hay peso, el precio por kilo se recalcula para que la cuenta siga siendo
 * coherente y el historial de precios de esa tienda no mienta.
 */
export async function fijarTotal(id: number, total: Centimos): Promise<void> {
  const e = await db.entregas.get(id);
  if (!e) return;
  const precioKg = e.peso > 0 ? Math.round((total * 1000) / e.peso) : e.precioKg;
  const nuevo = Math.max(0, total);
  await db.transaction("rw", db.entregas, db.deudas, db.jornadas, async () => {
    await db.entregas.update(id, {
      totalCalculado: nuevo,
      precioKg,
      estadoPago: estadoDe(nuevo, e.totalCobrado + e.descuentoRedondeo),
    });
    await ajustarDeudaTrasCorregir(e, saldoDe(e), nuevo - e.totalCobrado - e.descuentoRedondeo);
  });

  // Poner el total a mano fija también el precio por kilo que salió: la
  // tienda aprende de él igual que si lo hubiera dictado (ver `editarEntrega`).
  if (precioKg > 0 && precioKg !== e.precioKg) {
    const jornada = await leerJornada(e.fecha);
    await aprenderPrecioDeEntrega(e.tiendaId, precioKg, jornada.precioBaseKg);
  }
}

/**
 * Deja el peso como una sola pesada suelta, sin tandas: no se inventa una
 * «Primera tanda» para algo que se pesó de una vez.
 */
export async function fijarPeso(id: number, peso: Gramos): Promise<void> {
  await editarEntrega(id, { peso: Math.max(0, peso), tandas: [] });
}

/**
 * Suma una pesada a una entrega.
 *
 * Si la entrega tenía un peso de **una sola pesada** —guardado en `peso`, sin
 * `tandas`, que es lo más frecuente—, ese peso ya cuenta como la primera tanda:
 * la nueva se le suma, no lo reemplaza. Antes, agregar la segunda pesada
 * convertía la lista vacía en `[nueva]` y el peso se recalculaba solo desde ahí,
 * borrando lo que ya se había pesado y descuadrando el total.
 */
export async function agregarTanda(id: number, tanda: Gramos): Promise<void> {
  if (tanda <= 0) return;
  const e = await db.entregas.get(id);
  if (!e) return;
  const base = e.tandas.length === 0 && e.peso > 0 ? [e.peso] : e.tandas;
  await editarEntrega(id, { tandas: [...base, tanda] });
}

/** Lo que le falta por pagar a una entrega. */
export function saldoDe(e: Pick<Entrega, "totalCalculado" | "totalCobrado" | "descuentoRedondeo">) {
  return e.totalCalculado - e.totalCobrado - e.descuentoRedondeo;
}

/**
 * Ajusta la deuda de una entrega de un **día ya cerrado** cuando su total
 * cambia al corregirla.
 *
 * Sin esto la plata se evaporaba: al cerrar el día, lo que quedó sin cobrar
 * pasa a `deudas` y la entrega deja de contar como saldo del día (§8). Así que
 * corregir después «le cobré a 7 y eran 8» subía el `totalCalculado` de la
 * entrega y nadie se enteraba — ni nacía deuda, ni salía en Cobranza al día
 * siguiente. Los soles de diferencia simplemente desaparecían.
 *
 * Va por **diferencia, no por absoluto**, y esto es lo delicado: cobrar una
 * deuda mueve `deudas.saldado` pero **no toca la entrega** (ver
 * `registrarCobro`), así que el saldo de una entrega de un día cerrado se
 * queda congelado en lo que valía al cerrar. Igualar la deuda a ese saldo
 * congelado resucitaría una deuda ya pagada. Lo que sí es cierto es que la
 * corrección cambió la cuenta en `delta`, y eso es lo que se le suma a lo que
 * debe.
 *
 * @param saldoAntes  lo que le faltaba a la entrega antes de corregirla
 * @param saldoDespues lo que le falta ya corregida
 */
async function ajustarDeudaTrasCorregir(
  e: Entrega,
  saldoAntes: Centimos,
  saldoDespues: Centimos,
): Promise<void> {
  const delta = saldoDespues - saldoAntes;
  if (delta === 0) return;

  const jornada = await db.jornadas.get(e.fecha);
  // Día abierto: manda la propia entrega y Cobranza ya la lee de ahí. Crear
  // una deuda ahora contaría la diferencia dos veces.
  if (jornada?.estado !== "cerrada") return;

  const suyas = (await db.deudas.where("tiendaId").equals(e.tiendaId).toArray()).filter(
    (d) => d.entregaId === e.id && !d.cerrada,
  );

  if (suyas.length > 0) {
    // Se reparte sobre las que tenga abiertas (normalmente una sola). `monto`
    // nunca baja de lo ya saldado: si corrigió tanto hacia abajo que le cobró
    // de más, la deuda se cierra y de ahí para abajo es plata que le debe al
    // cliente, no una deuda negativa.
    let resto = delta;
    for (const d of suyas) {
      if (resto === 0) break;
      const nuevo = Math.max(d.saldado, d.monto + resto);
      resto -= nuevo - d.monto;
      await db.deudas.update(d.id!, { monto: nuevo, cerrada: nuevo <= d.saldado ? 1 : 0 });
    }
    return;
  }

  // No le quedaba deuda abierta —la pagó entera, o al cerrar no quedó nada— y
  // ahora resulta que debía más.
  if (delta <= 0) return;
  /*
   * Una diferencia por debajo de la moneda más chica no es una deuda: no hay
   * con qué pagarla. Se perdona como descuento, igual que hace `cerrarDia`,
   * en vez de dejar una migaja imposible de cobrar (§7 bis).
   */
  if (aCobrar(delta) === 0) {
    const perdonado = e.descuentoRedondeo + delta;
    await db.entregas.update(e.id!, {
      descuentoRedondeo: perdonado,
      estadoPago: estadoDe(e.totalCalculado, e.totalCobrado + perdonado),
    });
    return;
  }
  await db.deudas.add({
    tiendaId: e.tiendaId,
    entregaId: e.id ?? null,
    fechaOrigen: e.fecha,
    monto: delta,
    saldado: 0,
    cerrada: 0,
    creada: Date.now(),
  });
}

export async function borrarEntrega(id: number): Promise<void> {
  await db.transaction("rw", db.entregas, db.pagos, db.deudas, async () => {
    const e = await db.entregas.get(id);
    // Si era de un día cerrado, su deuda se va con ella: dejarla suelta le
    // seguiría cobrando al cliente algo que ya no existe.
    if (e) {
      const suyas = (await db.deudas.where("tiendaId").equals(e.tiendaId).toArray()).filter(
        (d) => d.entregaId === id && !d.cerrada,
      );
      for (const d of suyas) await db.deudas.update(d.id!, { cerrada: 1 });
    }
    /*
     * Solo los pagos que se aplicaron a **esta** entrega el mismo día
     * (`tipo: "delDia"`): esos sí desaparecen con ella. `Pago.entregaId`
     * también aparece en pagos `"deudaAnterior"` — ahí solo dice qué entrega
     * *originó* la deuda que se estaba pagando, no que el pago sea de esta
     * entrega. Ese pago pudo hacerse días después, ya con el día cerrado; un
     * `.where("entregaId")` sin filtrar por tipo se lo llevaba también, y
     * borrar una entrega vieja ya del todo pagada le recortaba el «cobrado»
     * a un día completamente distinto y ya cerrado.
     */
    await db.pagos
      .where("entregaId")
      .equals(id)
      .filter((p) => p.tipo === "delDia")
      .delete();
    await db.entregas.delete(id);
  });
}

/* ── Cobros ──────────────────────────────────────────────────────────── */

/**
 * Cobra **esta** entrega y nada más — ni la deuda vieja de la tienda ni otra
 * entrega del mismo día. Hace falta cuando pasa dos veces por la misma
 * tienda: si usara `registrarCobro`, que paga lo más viejo primero, la plata
 * de esta entrega podría irse a saldar la deuda o la entrega anterior en vez
 * de esta, que es justo lo que pidió cobrar.
 */
export async function cobrarEntrega(id: number, montoRecibido: Centimos): Promise<void> {
  await db.transaction("rw", db.entregas, db.pagos, async () => {
    const e = await db.entregas.get(id);
    if (!e) return;
    const falta = e.totalCalculado - e.totalCobrado - e.descuentoRedondeo;
    const aplica = Math.min(Math.max(0, montoRecibido), falta);
    if (aplica <= 0) return;

    const cobrado = e.totalCobrado + aplica;
    await db.entregas.update(id, {
      totalCobrado: cobrado,
      estadoPago: estadoDe(e.totalCalculado, cobrado + e.descuentoRedondeo),
    });
    await db.pagos.add({
      tiendaId: e.tiendaId,
      entregaId: id,
      fecha: e.fecha,
      monto: aplica,
      tipo: "delDia",
      creada: Date.now(),
    });
  });
}

export interface CuentaTienda {
  tienda: Tienda;
  /** Lo que falta de las entregas de hoy. */
  delDia: Centimos;
  /** Lo que arrastra de días ya cerrados. */
  deuda: Centimos;
  /** El día de la deuda más vieja, para el texto «del jueves». */
  deudaDesde: DiaISO | null;
  total: Centimos;
  entregas: Entrega[];
  /**
   * Ya recibió un abono y todavía debe: pagó una parte, no todo. Va al final
   * de la lista para no estorbar arriba mientras se sigue cobrando el resto de
   * la ruta — el que aún no pagó nada sube al tope.
   */
  tocada: boolean;
  /**
   * Tiene hoy una entrega sin precio: la marcó "sin pesar" por voz, o
   * simplemente confirmó la tarjeta sin poner el total todavía. En los dos
   * casos `totalCalculado` queda en 0 y hay que poder cobrarla igual.
   */
  tieneSinPesar: boolean;
  /** No le queda nada por cobrar ahora mismo: ni de hoy, ni de antes. */
  pagada: boolean;
  /**
   * Lo que se le cobró hoy en total, de lo de hoy y de deuda vieja junto —
   * para la vista Ruta, donde una ya saldada se queda marcada en vez de
   * desaparecer y hay que decir cuánto se le sacó, no solo que ya pagó.
   */
  cobradoHoy: Centimos;
}

/**
 * Lo que hay que cobrarle a cada tienda: lo de hoy más lo que arrastra, en
 * orden de ruta. Es exactamente la pantalla de Cobranza.
 */
export type OrdenCobranza = "retorno" | "ruta";

/**
 * Arma la cuenta de una tienda a partir de los datos ya cargados. Sacado
 * aparte para que `cuentasPendientes` (solo las que aún deben) y
 * `cuentasDelDia` (todas las de la ruta, cobradas o no) usen exactamente la
 * misma lógica.
 */
function armarCuenta(
  tienda: Tienda,
  entregas: Entrega[],
  deudas: Deuda[],
  pagos: Pago[],
  diaCerrado: boolean,
): CuentaTienda {
  const id = tienda.id!;
  const suyas = entregas.filter((e) => e.tiendaId === id);
  const delDia = diaCerrado
    ? 0
    : suyas.reduce(
        (a, e) => a + Math.max(0, e.totalCalculado - e.totalCobrado - e.descuentoRedondeo),
        0,
      );
  const abiertas = deudas
    .filter((d) => d.tiendaId === id && !d.cerrada)
    .sort((a, b) => (a.fechaOrigen < b.fechaOrigen ? -1 : 1));
  const deuda = abiertas.reduce((a, d) => a + (d.monto - d.saldado), 0);

  // `totalCalculado === 0` siempre quiere decir "todavía no tiene precio"
  // (`calcular()` solo devuelve 0 por la rama `incompleto`) — sin importar
  // si se marcó explícitamente "sin pesar" por voz o si simplemente
  // confirmó la tarjeta sin poner el total. Sin esto, una tienda con una
  // entrega sin precio desaparecía de Cobranza igual que antes del arreglo:
  // no había forma de cobrarle.
  const sinPrecioPendiente =
    !diaCerrado && suyas.some((e) => e.totalCalculado === 0 && e.estadoPago === "pendiente");

  // Hacia abajo a los 10 céntimos: es lo que se puede pagar con monedas.
  const total = aCobrar(delDia + deuda);
  // Recibió algo y aún debe: un pago parcial en una entrega de hoy
  // (`totalCobrado`/`descuentoRedondeo`) o un abono a una deuda vieja
  // (`saldado`). El día cerrado no cuenta lo de hoy, así que ahí solo mira
  // la deuda.
  const tocada =
    (!diaCerrado && suyas.some((e) => e.totalCobrado > 0 || e.descuentoRedondeo > 0)) ||
    abiertas.some((d) => d.saldado > 0);
  const cobradoHoy = pagos
    .filter((p) => p.tiendaId === id)
    .reduce((a, p) => a + p.monto, 0);
  return {
    tienda,
    delDia,
    deuda,
    deudaDesde: abiertas[0]?.fechaOrigen ?? null,
    total,
    entregas: suyas,
    tocada,
    tieneSinPesar: sinPrecioPendiente,
    // Si lo que queda —sumando todo— no llega ni a una moneda de 10 céntimos,
    // no hay nada que cobrar: son migajas de redondeo que el modelo ya da
    // por perdonadas.
    pagada: total <= 0 && !sinPrecioPendiente,
    cobradoHoy,
  };
}

export async function cuentasPendientes(
  fecha: DiaISO = hoyISO(),
  orden: OrdenCobranza = "retorno",
): Promise<CuentaTienda[]> {
  const [entregas, deudas, tiendas, jornada, pagos] = await Promise.all([
    db.entregas.where("fecha").equals(fecha).toArray(),
    db.deudas.toArray(),
    db.tiendas.toArray(),
    db.jornadas.get(fecha),
    db.pagos.where("fecha").equals(fecha).toArray(),
  ]);
  // Con el día cerrado, lo que faltaba ya vive como deuda: contarlo también
  // como saldo del día lo duplicaría en la pantalla de cobranza.
  const diaCerrado = jornada?.estado === "cerrada";

  const porId = new Map(tiendas.map((t) => [t.id!, t]));
  const ids = new Set<number>();
  for (const e of entregas) ids.add(e.tiendaId);
  for (const d of deudas) if (!d.cerrada) ids.add(d.tiendaId);

  const cuentas: CuentaTienda[] = [];
  for (const id of ids) {
    const tienda = porId.get(id);
    if (!tienda) continue;
    const c = armarCuenta(tienda, entregas, deudas, pagos, diaCerrado);
    if (c.pagada) continue;
    cuentas.push(c);
  }

  /*
   * `retorno` es el orden natural de cobrar: reparte de ida y cobra de vuelta,
   * así que la última tienda a la que le dejó es la primera que se reencuentra.
   *
   * Las tiendas sin parada aprendida quedan al final en los dos órdenes: no se
   * sabe dónde caen, y ponerlas primero solo estorbaría.
   */
  const sinRuta = 9999;
  return cuentas.sort((a, b) => {
    // Las que ya abonaron parte se van al fondo, sin importar la ruta: así el
    // siguiente por cobrar del todo sube y no estorban las que quedan colgando
    // por un resto.
    if (a.tocada !== b.tocada) return a.tocada ? 1 : -1;
    const x = a.tienda.ordenRuta || sinRuta;
    const y = b.tienda.ordenRuta || sinRuta;
    if (x === sinRuta || y === sinRuta) return x - y;
    return orden === "retorno" ? y - x : x - y;
  });
}

/**
 * **Todas** las tiendas de la ruta, cobradas o no, entregadas o no. Para la
 * vista "Ruta" de Cobranza: el pedido es que se vea igual que la vista de
 * ruta de Hoy —misma lista, mismo orden— pero con lo cobrado marcado y las
 * pendientes tapables para cobrar. A diferencia de `cuentasPendientes`, ni
 * se descartan las saldadas ni las sin actividad: se quedan en su sitio para
 * que el scroll no salte bajo el dedo cada vez que se cobra una.
 */
export async function cuentasDelDia(fecha: DiaISO = hoyISO()): Promise<CuentaTienda[]> {
  const [entregas, deudas, tiendas, jornada, pagos] = await Promise.all([
    db.entregas.where("fecha").equals(fecha).toArray(),
    db.deudas.toArray(),
    db.tiendas.toArray(),
    db.jornadas.get(fecha),
    db.pagos.where("fecha").equals(fecha).toArray(),
  ]);
  const diaCerrado = jornada?.estado === "cerrada";

  const cuentas = tiendas.map((t) => armarCuenta(t, entregas, deudas, pagos, diaCerrado));

  // Ascendente: primera parada primero. **No** en retorno — el pedido es que
  // las dos vistas de ruta (Hoy y Cobranza) se lean igual, y por eso las dos
  // ordenan con el mismo `paradaDe` de `tiendas/ruta.ts`.
  const paradaCuenta = (c: CuentaTienda): number =>
    paradaDe(
      c.tienda,
      c.entregas.length > 0 ? Math.max(...c.entregas.map((e) => e.orden)) : undefined,
    );
  return cuentas.sort((a, b) => paradaCuenta(a) - paradaCuenta(b));
}

/**
 * Aplica un cobro a una tienda.
 *
 * La deuda vieja se salda **primero** — es la regla del negocio y además es lo
 * viejo lo que corre riesgo de no cobrarse nunca. Dentro de cada grupo, lo más
 * antiguo primero.
 *
 * `aceptarRedondeo` convierte el resto pequeño en descuento a favor del
 * cliente en vez de dejarlo como deuda. La pantalla lo muestra antes de que él
 * lo confirme; aquí no se decide solo.
 */
export async function registrarCobro(
  tiendaId: number,
  montoRecibido: Centimos,
  opciones: { fecha?: DiaISO; aceptarRedondeo?: boolean } = {},
): Promise<void> {
  const fecha = opciones.fecha ?? hoyISO();

  await db.transaction("rw", db.entregas, db.deudas, db.pagos, async () => {
    const abiertas = (await db.deudas.where("tiendaId").equals(tiendaId).toArray())
      .filter((d) => !d.cerrada)
      .sort((a, b) => (a.fechaOrigen < b.fechaOrigen ? -1 : 1));

    const delDia = (await db.entregas.where("[fecha+tiendaId]").equals([fecha, tiendaId]).toArray())
      .filter((e) => e.totalCalculado - e.totalCobrado - e.descuentoRedondeo > 0)
      .sort((a, b) => a.orden - b.orden);

    let resto = Math.max(0, montoRecibido);
    const ahora = Date.now();

    for (const d of abiertas) {
      if (resto <= 0) break;
      const falta = d.monto - d.saldado;
      const aplica = Math.min(resto, falta);
      await db.deudas.update(d.id!, {
        saldado: d.saldado + aplica,
        cerrada: d.saldado + aplica >= d.monto ? 1 : 0,
      });
      await db.pagos.add({
        tiendaId,
        entregaId: d.entregaId,
        fecha,
        monto: aplica,
        tipo: "deudaAnterior",
        creada: ahora,
      });
      resto -= aplica;
    }

    for (const e of delDia) {
      if (resto <= 0) break;
      const falta = e.totalCalculado - e.totalCobrado - e.descuentoRedondeo;
      const aplica = Math.min(resto, falta);
      const cobrado = e.totalCobrado + aplica;
      await db.entregas.update(e.id!, {
        totalCobrado: cobrado,
        estadoPago: estadoDe(e.totalCalculado, cobrado + e.descuentoRedondeo),
      });
      await db.pagos.add({
        tiendaId,
        entregaId: e.id!,
        fecha,
        monto: aplica,
        tipo: "delDia",
        creada: ahora,
      });
      resto -= aplica;
    }

    if (resto > 0) {
      // Igual que en `cuentasPendientes`: cualquier entrega de hoy que
      // todavía no tenga precio, se haya marcado "sin pesar" o no.
      const sinPrecioHoy = (
        await db.entregas.where("[fecha+tiendaId]").equals([fecha, tiendaId]).toArray()
      )
        .filter((e) => e.totalCalculado === 0)
        .sort((a, b) => a.orden - b.orden);

      /*
       * Si hay varias, el resto se reparte entre todas — a prorrata de
       * pollos, que es la única señal de tamaño que tienen sin peso ni
       * precio. Antes se le ponía **todo** el monto a la primera y ahí se
       * quedaba `resto = 0`: la segunda entrega sin pesar del día se quedaba
       * en S/ 0.00 para siempre, sin dinero asignado y sin forma de cobrarla
       * — el botón de cobrar se deshabilita en 0. Pasa cada vez que se
       * reparte dos veces a la misma tienda sin precio el mismo día y luego
       * se cobra todo junto.
       *
       * Los pollos en 0 (piernas o pechos sueltos) van a partes iguales entre
       * sí; el resto de centavos que no divide exacto se lo lleva la última,
       * para que la suma cuadre siempre con lo que de verdad recibió.
       */
      const totalPollos = sinPrecioHoy.reduce((a, e) => a + e.pollos, 0);
      const pesoDe = (e: (typeof sinPrecioHoy)[number]) => (totalPollos > 0 ? e.pollos : 1);
      const sumaPesos = totalPollos > 0 ? totalPollos : sinPrecioHoy.length;
      // Cada una hacia abajo (nunca puede sobrepasar lo que queda) y la
      // última se lleva el resto exacto: así la suma siempre cuadra con lo
      // recibido, sin importar cómo caigan los redondeos por el camino.
      let quedan = resto;
      for (let i = 0; i < sinPrecioHoy.length; i++) {
        const e = sinPrecioHoy[i];
        const esUltima = i === sinPrecioHoy.length - 1;
        const parte = esUltima ? quedan : Math.floor((resto * pesoDe(e)) / sumaPesos);
        if (parte <= 0) continue;
        quedan -= parte;
        await db.entregas.update(e.id!, {
          totalCalculado: parte,
          totalCobrado: parte,
          estadoPago: estadoDe(parte, parte),
        });
        await db.pagos.add({
          tiendaId,
          entregaId: e.id!,
          fecha,
          monto: parte,
          tipo: "delDia",
          creada: ahora,
          // Este pago es el que le puso el total: si se deshace, el total se
          // va con él (ver `deshacerCobro`).
          totalFijado: parte,
        });
      }
      resto = 0;
    }

    if (!opciones.aceptarRedondeo) return;

    // El resto que quedó a deber, si es pequeño, se perdona explícitamente y
    // queda **registrado** como descuento. El cálculo exacto no se toca: es lo
    // que luego permite decirle cuánto regala al mes.
    const cuenta =
      abiertas.reduce((a, d) => a + (d.monto - d.saldado), 0) +
      delDia.reduce((a, e) => a + (e.totalCalculado - e.totalCobrado - e.descuentoRedondeo), 0);
    const reparto = repartirPago(montoRecibido, 0, cuenta);
    if (!reparto.esRedondeo) return;

    let porPerdonar = reparto.restante;
    for (const e of delDia) {
      if (porPerdonar <= 0) break;
      const actual = await db.entregas.get(e.id!);
      if (!actual) continue;
      const falta = actual.totalCalculado - actual.totalCobrado - actual.descuentoRedondeo;
      if (falta <= 0) continue;
      const perdona = Math.min(porPerdonar, falta, TOPE_REDONDEO);
      await db.entregas.update(e.id!, {
        descuentoRedondeo: actual.descuentoRedondeo + perdona,
        estadoPago: estadoDe(
          actual.totalCalculado,
          actual.totalCobrado + actual.descuentoRedondeo + perdona,
        ),
      });
      porPerdonar -= perdona;
    }

    /*
     * Si todavía queda por perdonar, es que el resto cayó en la deuda vieja,
     * no en lo de hoy — pasa cuando esa tienda no tiene entregas hoy y solo se
     * le está cobrando lo de antes. Sin esto, el redondeo se aceptaba en la
     * pantalla pero no se aplicaba en ningún lado: la deuda se quedaba abierta
     * por unos centavos para siempre. `saldado` no tiene un campo de
     * descuento propio como las entregas; se perdona igual que se salda —
     * subiendo `saldado` — y se cierra al llegar a `monto`.
     */
    for (const d of abiertas) {
      if (porPerdonar <= 0) break;
      const actual = await db.deudas.get(d.id!);
      if (!actual || actual.cerrada) continue;
      const falta = actual.monto - actual.saldado;
      if (falta <= 0) continue;
      const perdona = Math.min(porPerdonar, falta, TOPE_REDONDEO);
      await db.deudas.update(d.id!, {
        saldado: actual.saldado + perdona,
        cerrada: actual.saldado + perdona >= actual.monto ? 1 : 0,
      });
      porPerdonar -= perdona;
    }
  });
}

/* ── Deshacer un cobro ───────────────────────────────────────────────── */

/**
 * Un cobro tal y como lo hizo: una sola vez que le pagaron.
 *
 * `registrarCobro` reparte un solo billete entre varias filas —primero las
 * deudas viejas, después las entregas del día—, así que lo que para él fue
 * «Rosa me pagó 80» pueden ser tres `pagos` distintos. Se agrupan por el
 * instante en que se guardaron (`creada`), que es lo que los hace uno solo:
 * deshacer media entrega de plata no significa nada.
 */
export interface CobroHecho {
  creada: number;
  fecha: DiaISO;
  tiendaId: number;
  /** Lo que entregó en total esa vez. */
  monto: Centimos;
  /** Cuánto de eso fue a saldar deuda de días anteriores. */
  aDeuda: Centimos;
  pagos: Pago[];
}

/** Los cobros que se le hicieron a una tienda en un día, del último al primero. */
export async function cobrosDe(tiendaId: number, fecha: DiaISO): Promise<CobroHecho[]> {
  const pagos = (await db.pagos.where("tiendaId").equals(tiendaId).toArray()).filter(
    (p) => p.fecha === fecha,
  );

  const porInstante = new Map<number, Pago[]>();
  for (const p of pagos) {
    const grupo = porInstante.get(p.creada) ?? [];
    grupo.push(p);
    porInstante.set(p.creada, grupo);
  }

  return [...porInstante.entries()]
    .map(([creada, grupo]) => ({
      creada,
      fecha,
      tiendaId,
      monto: grupo.reduce((a, p) => a + p.monto, 0),
      aDeuda: grupo
        .filter((p) => p.tipo === "deudaAnterior")
        .reduce((a, p) => a + p.monto, 0),
      pagos: grupo,
    }))
    .sort((a, b) => b.creada - a.creada);
}

/**
 * Devuelve a la deuda de la tienda lo que un pago le había saldado.
 *
 * No se puede ir directo a «la deuda de ese pago»: `Pago.entregaId` apunta a
 * la entrega que **originó** la deuda, no a la deuda, y puede ser `null`. Así
 * que se prefiere la que coincide en `entregaId` y se sigue por las demás que
 * tengan algo saldado — total, son todas deuda de la misma tienda y lo que
 * importa es que su saldo vuelva a subir exactamente lo cobrado.
 *
 * Si no queda dónde devolverlo (la deuda se borró con su entrega, por
 * ejemplo), se recrea: antes que perder el rastro de la plata, una fila nueva.
 */
async function devolverADeuda(p: Pago): Promise<void> {
  const candidatas = (await db.deudas.where("tiendaId").equals(p.tiendaId).toArray())
    .filter((d) => d.saldado > 0)
    .sort((a, b) => {
      const suya = (d: Deuda) => (d.entregaId === p.entregaId ? 0 : 1);
      return suya(a) - suya(b) || b.creada - a.creada;
    });

  let resto = p.monto;
  for (const d of candidatas) {
    if (resto <= 0) break;
    const quita = Math.min(resto, d.saldado);
    await db.deudas.update(d.id!, { saldado: d.saldado - quita, cerrada: 0 });
    resto -= quita;
  }

  if (resto > 0) {
    await db.deudas.add({
      tiendaId: p.tiendaId,
      entregaId: p.entregaId,
      fechaOrigen: p.fecha,
      monto: resto,
      saldado: 0,
      cerrada: 0,
      creada: Date.now(),
    });
  }
}

/**
 * Deshace un cobro entero: la plata vuelve a estar por cobrar.
 *
 * Hacía falta porque no había ninguna forma de arreglar un cobro mal
 * tecleado. Un 100 donde iban 10 quedaba así para siempre: el cliente
 * aparecía al día, la caja del cierre no cuadraba, y lo único que se podía
 * hacer era inventarle una deuda a mano para compensar.
 *
 * Deshace el grupo entero (ver `CobroHecho`) y en el orden inverso a como se
 * aplicó: lo que fue a entregas se les descuenta, lo que fue a deudas viejas
 * vuelve a deberse, y los `pagos` se borran para que no queden contados dos
 * veces en el resumen del día.
 */
export async function deshacerCobro(tiendaId: number, creada: number): Promise<void> {
  // `db.jornadas` entra por `ajustarDeudaTrasCorregir`, que mira si el día de
  // la entrega ya cerró.
  await db.transaction("rw", db.entregas, db.deudas, db.pagos, db.jornadas, async () => {
    const grupo = (await db.pagos.where("tiendaId").equals(tiendaId).toArray()).filter(
      (p) => p.creada === creada,
    );

    for (const p of grupo) {
      if (p.tipo === "deudaAnterior") {
        await devolverADeuda(p);
      } else if (p.entregaId !== null) {
        const e = await db.entregas.get(p.entregaId);
        if (e) {
          const cobrado = Math.max(0, e.totalCobrado - p.monto);
          /*
           * Si este pago fue el que le puso el total a una entrega sin precio,
           * el total se va con él: solo existía porque pagó esa cantidad.
           * Dejarlo pondría a deber un precio que él nunca acordó.
           */
          const total = p.totalFijado !== undefined ? 0 : e.totalCalculado;
          await db.entregas.update(p.entregaId, {
            totalCobrado: cobrado,
            totalCalculado: total,
            estadoPago: estadoDe(total, cobrado + e.descuentoRedondeo),
          });
          /*
           * Si el día de esa entrega ya cerró, lo que vuelve a faltar tiene
           * que llegar hasta `deudas` — igual que al corregir desde el
           * Detalle (`editarEntrega`/`fijarTotal`). Sin esto, deshacer un
           * cobro de un día cerrado hacía desaparecer la plata sin dejar
           * rastro: la entrega volvía a deber, pero ni Cobranza ni la ficha
           * del cliente la contaban — las dos confían en `deudas` para todo
           * lo que ya cerró, y ahí no había nada.
           */
          await ajustarDeudaTrasCorregir(e, saldoDe(e), total - cobrado - e.descuentoRedondeo);
        }
      }
      await db.pagos.delete(p.id!);
    }
  });
}
