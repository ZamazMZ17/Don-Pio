import { db } from "../db/db";
import { cuentasPendientes } from "../db/entregas";
import { leerJornada, resumenDe } from "../db/jornada";
import { configuracionIA } from "./ajustes";
import { pedirJSON, type Esquema } from "./gemini";
import { money } from "../lib/dinero";
import { diaLargo, hoyISO, ultimosDias, type DiaISO } from "../lib/fecha";

/**
 * Los informes: el único lugar donde Gemini toca la app. Le llegan números ya
 * cerrados —nunca calcula nada, eso lo sigue haciendo la app determinista— y
 * los cuenta en un par de frases. Uno al cerrar el día, otro por semana.
 */

export interface Informe {
  resumen: string;
  destacados: string[];
}

const ESQUEMA_INFORME: Esquema = {
  type: "object",
  properties: {
    resumen: { type: "string" },
    destacados: { type: "array", items: { type: "string" } },
  },
  required: ["resumen", "destacados"],
  propertyOrdering: ["resumen", "destacados"],
};

const INSTRUCCIONES = `Eres el contador de un repartidor de pollos en Perú, que reparte solo a
más de 50 tiendas y cobra en el retorno de la misma ruta. Te paso los números de su día o de su
semana, ya cerrados. Escribe un informe corto, en español peruano cercano (tú, no usted), como
si se lo contaras esa misma noche.

- "resumen": 2 a 4 frases seguidas, en un solo párrafo, con lo esencial: cuánto repartió,
  cuánto cobró, si cuadró la caja o le quedó algo importante pendiente.
- "destacados": de 0 a 5 frases cortas, cada una un dato suelto que valga la pena que note —una
  deuda vieja que sigue sin cobrarse, cuánto está regalando en redondeos, un día flojo o fuerte
  comparado con lo normal, stock que sobró o faltó—. Si no hay nada que destacar, deja la lista
  vacía: no inventes algo forzado solo por llenarla.

Nunca inventes un número que no esté en los datos de abajo. No repitas los datos como una
tabla; cuéntalo. No uses emojis ni markdown.`;

async function pedirInforme(datos: string): Promise<Informe> {
  const config = await configuracionIA();
  const bruto = await pedirJSON<Partial<Informe>>(config, {
    prompt: `${INSTRUCCIONES}\n\nDatos:\n"""\n${datos}\n"""`,
    esquema: ESQUEMA_INFORME,
  });
  return {
    resumen: typeof bruto.resumen === "string" ? bruto.resumen.trim() : "",
    destacados: Array.isArray(bruto.destacados)
      ? bruto.destacados.filter((d): d is string => typeof d === "string" && d.trim() !== "")
      : [],
  };
}

/** Los números de un día, en texto llano, para que Gemini los cuente. */
async function datosDelDia(fecha: DiaISO): Promise<string> {
  const [resumen, jornada, cuentas] = await Promise.all([
    resumenDe(fecha),
    leerJornada(fecha),
    cuentasPendientes(fecha),
  ]);
  const pendienteHoy = cuentas.reduce((a, c) => a + c.total, 0);

  const lineas = [
    `Día: ${diaLargo(fecha)}.`,
    `Salió con ${resumen.stockPollos} pollos${resumen.stockPiernas ? ` y ${resumen.stockPiernas} piernas` : ""}${resumen.stockPechos ? `, y compró ${resumen.stockPechos} pechos sueltos aparte` : ""}.`,
    `Repartió ${resumen.repartidoPollos} pollos en ${resumen.entregas} entregas, a ${resumen.tiendas} tiendas.`,
    resumen.restantePollos !== 0
      ? `Le ${resumen.restantePollos > 0 ? "sobraron" : "faltaron"} ${Math.abs(resumen.restantePollos)} pollos contra lo que cargó.`
      : "El stock de pollos cuadró exacto con lo cargado.",
    resumen.pechosLibres > 0 ? `Le quedaron ${resumen.pechosLibres} pechos sueltos, todavía sin vender.` : "",
    `Cobró ${money(resumen.cobrado)}.`,
    pendienteHoy > 0
      ? `Le quedó pendiente de hoy ${money(pendienteHoy)}, entre ${cuentas.length} ${cuentas.length === 1 ? "cliente" : "clientes"}.`
      : "No le quedó nada pendiente de hoy.",
    resumen.descuentos > 0 ? `Regaló ${money(resumen.descuentos)} en redondeos a favor del cliente.` : "",
    resumen.gastos > 0 ? `Gastó ${money(resumen.gastos)} de la misma caja (comida, gasolina, etc).` : "",
    jornada.cuadro === null
      ? "Todavía no dijo si le cuadró la caja."
      : jornada.cuadro
        ? "Al contar la caja, le cuadró."
        : "Al contar la caja, NO le cuadró.",
  ].filter(Boolean);

  if (cuentas.length > 0) {
    lineas.push("Quién le quedó debiendo hoy, de más a menos:");
    for (const c of [...cuentas].sort((a, b) => b.total - a.total).slice(0, 15)) {
      lineas.push(
        `- ${c.tienda.nombre}: ${money(c.total)}${c.deudaDesde ? ` (arrastra desde ${diaLargo(c.deudaDesde)})` : ""}`,
      );
    }
  }

  return lineas.join("\n");
}

/** Los números de los últimos 7 días, en texto llano. */
async function datosDeLaSemana(): Promise<string> {
  const hoy = hoyISO();
  const semana = ultimosDias(hoy, 7);
  const resumenes = await Promise.all(semana.map((d) => resumenDe(d)));

  const [todasLasDeudas, tiendas] = await Promise.all([db.deudas.toArray(), db.tiendas.toArray()]);
  const deudas = todasLasDeudas.filter((d) => !d.cerrada);
  const porId = new Map(tiendas.map((t) => [t.id!, t]));
  const deudaPorTienda = new Map<number, number>();
  for (const d of deudas) {
    deudaPorTienda.set(d.tiendaId, (deudaPorTienda.get(d.tiendaId) ?? 0) + (d.monto - d.saldado));
  }
  const deudaTotal = [...deudaPorTienda.values()].reduce((a, b) => a + b, 0);

  const repartidoSemana = resumenes.reduce((a, r) => a + r.repartidoPollos, 0);
  const cobradoSemana = resumenes.reduce((a, r) => a + r.cobrado, 0);
  const gastosSemana = resumenes.reduce((a, r) => a + r.gastos, 0);
  const descuentosSemana = resumenes.reduce((a, r) => a + r.descuentos, 0);

  const lineas = [
    `Semana del ${diaLargo(semana[0])} al ${diaLargo(semana[6])}.`,
    ...semana.map(
      (d, i) => `${diaLargo(d)}: ${resumenes[i].repartidoPollos} pollos repartidos, cobró ${money(resumenes[i].cobrado)}.`,
    ),
    `En total repartió ${repartidoSemana} pollos y cobró ${money(cobradoSemana)}.`,
    gastosSemana > 0 ? `Gastó ${money(gastosSemana)} de la caja en la semana.` : "",
    descuentosSemana > 0 ? `Regaló ${money(descuentosSemana)} en redondeos durante la semana.` : "",
    `Ahora mismo, sumando todos los días, le deben ${money(deudaTotal)}.`,
  ].filter(Boolean);

  const peores = [...deudaPorTienda.entries()]
    .filter(([, monto]) => monto > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (peores.length > 0) {
    lineas.push("Quiénes le deben más ahora mismo:");
    for (const [id, monto] of peores) {
      lineas.push(`- ${porId.get(id)?.nombre ?? "Sin nombre"}: ${money(monto)}`);
    }
  }

  return lineas.join("\n");
}

/**
 * El informe de un día, con caché: se genera una sola vez salvo que se pida
 * `forzar`, para no gastar cuota volviendo a contar lo mismo cada vez que se
 * abre la pantalla.
 */
export async function informeDelDia(fecha: DiaISO, forzar = false): Promise<Informe> {
  const clave = `dia-${fecha}`;
  if (!forzar) {
    const guardado = await db.informes.get(clave);
    if (guardado) return guardado;
  }
  const informe = await pedirInforme(await datosDelDia(fecha));
  await db.informes.put({ clave, ...informe, creado: Date.now() });
  return informe;
}

/**
 * El informe de la semana. La clave lleva la fecha de hoy porque la ventana
 * de 7 días se corre a diario: pedirlo mañana es, con razón, otro informe.
 */
export async function informeDeLaSemana(forzar = false): Promise<Informe> {
  const clave = `semana-${hoyISO()}`;
  if (!forzar) {
    const guardado = await db.informes.get(clave);
    if (guardado) return guardado;
  }
  const informe = await pedirInforme(await datosDeLaSemana());
  await db.informes.put({ clave, ...informe, creado: Date.now() });
  return informe;
}
