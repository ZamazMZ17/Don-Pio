import { db, type Entrega, type Tienda } from "./db";
import { hoyISO, type DiaISO } from "../lib/fecha";
import { aCobrar, type Centimos, type Gramos } from "../lib/dinero";
import { calcular, estadoDe, repartirPago, sumarTandas, TOPE_REDONDEO } from "../dominio/calculo";
import { aprenderDeEntrega } from "./tiendas";
import type { Contexto } from "../tiendas/emparejar";

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

  await aprenderDeEntrega(datos.tiendaId, ctx, {
    dictado: opciones.dictado,
    // Solo se recuerda el precio si vino del dictado, no el implícito de un
    // total redondo: si no, un «son 40 soles» le cambiaría el precio por kilo.
    precioKg: datos.precioKg,
    precioPollo: datos.precioPollo,
    sinPesar: datos.sinPesar,
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

  await db.entregas.update(id, {
    ...cambios,
    tandas,
    peso,
    precioKg,
    totalCalculado: total,
    estadoPago: estadoDe(total, e.totalCobrado + e.descuentoRedondeo),
  });
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
  await db.entregas.update(id, {
    totalCalculado: Math.max(0, total),
    precioKg: e.peso > 0 ? Math.round((total * 1000) / e.peso) : e.precioKg,
    estadoPago: estadoDe(Math.max(0, total), e.totalCobrado + e.descuentoRedondeo),
  });
}

/**
 * Deja el peso como una sola pesada suelta, sin tandas: no se inventa una
 * «Primera tanda» para algo que se pesó de una vez.
 */
export async function fijarPeso(id: number, peso: Gramos): Promise<void> {
  await editarEntrega(id, { peso: Math.max(0, peso), tandas: [] });
}

export async function borrarEntrega(id: number): Promise<void> {
  await db.transaction("rw", db.entregas, db.pagos, async () => {
    await db.pagos.where("entregaId").equals(id).delete();
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
}

/**
 * Lo que hay que cobrarle a cada tienda: lo de hoy más lo que arrastra, en
 * orden de ruta. Es exactamente la pantalla de Cobranza.
 */
export type OrdenCobranza = "retorno" | "ruta";

export async function cuentasPendientes(
  fecha: DiaISO = hoyISO(),
  orden: OrdenCobranza = "retorno",
): Promise<CuentaTienda[]> {
  const [entregas, deudas, tiendas, jornada] = await Promise.all([
    db.entregas.where("fecha").equals(fecha).toArray(),
    db.deudas.toArray(),
    db.tiendas.toArray(),
    db.jornadas.get(fecha),
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

    // Hacia abajo a los 10 céntimos: es lo que se puede pagar con monedas.
    const total = aCobrar(delDia + deuda);
    // Si lo que queda —sumando todo— no llega ni a una moneda de 10 céntimos,
    // no hay nada que cobrar: mostrarla con «A cobrar S/ 0.00» solo estorba y
    // no se puede saldar cobrando (cobrar S/ 0 no hace nada). Son migajas de
    // redondeo que el modelo ya da por perdonadas. Se mira el saldo entero, no
    // cada deuda suelta: tres migajas de 4 céntimos sí suman una moneda y esa
    // sí se cobra.
    if (total <= 0) continue;
    cuentas.push({
      tienda,
      delDia,
      deuda,
      deudaDesde: abiertas[0]?.fechaOrigen ?? null,
      total,
      entregas: suyas,
    });
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
    const x = a.tienda.ordenRuta || sinRuta;
    const y = b.tienda.ordenRuta || sinRuta;
    if (x === sinRuta || y === sinRuta) return x - y;
    return orden === "retorno" ? y - x : x - y;
  });
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
