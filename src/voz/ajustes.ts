import { db } from "../db/db";

/**
 * La key vive en el dispositivo y nunca sale de aquí salvo hacia el proveedor.
 * **No se publica la app con la key dentro** (CLAUDE.md §3).
 */
export const CLAVE_API = "iaApiKey";
export const CLAVE_MODELO = "iaModelo";
export const CLAVE_HORA_CIERRE = "horaCierre";
export const CLAVE_STOCK_DEFECTO = "stockDefecto";
export const CLAVE_REDONDEO = "redondeoAbajo";
export const CLAVE_SONIDO = "avisoSonido";
export const CLAVE_ORDEN = "ordenLista";
/**
 * Cómo se ve la pantalla Hoy: "agenda" (lo ya hecho, como siempre) o "ruta"
 * (todos los clientes en orden de ruta, para ir tocando y registrando de uno
 * en uno). Por defecto "agenda": es la vista de siempre.
 */
export const CLAVE_MODO_HOY = "modoHoy";
/**
 * Cómo se ordena la cobranza. Por defecto `retorno`: **del último al primero**,
 * porque reparte de ida y cobra de vuelta, así que la última tienda a la que le
 * dejó es la primera que se vuelve a encontrar.
 */
export const CLAVE_ORDEN_COBRANZA = "ordenCobranza";
/**
 * Cómo se ve Cobranza: "deudas" (solo las que faltan por cobrar, y
 * desaparecen al pagar, como siempre) o "ruta" (todas las tiendas de hoy en
 * orden real, cobradas o no, sin desaparecer — para ir tocando de vuelta sin
 * que el scroll salte). Por defecto "deudas": es la vista de siempre.
 */
export const CLAVE_MODO_COBRANZA = "modoCobranza";
/** Cómo se ordena el directorio: "ruta" (por parada) o "abc" (alfabético). */
export const CLAVE_ORDEN_TIENDAS = "ordenTiendas";
/**
 * Dictar con el micrófono del teclado (Gboard) en vez de grabar audio para
 * Gemini. Es gratis, no gasta cuota de la API y transcribe muy bien: el teclado
 * de Google usa el mismo motor, pero sin pasar por nuestra clave.
 */
export const CLAVE_MODO_TECLADO = "modoTeclado";
/**
 * El día en que ya se le preguntó con cuánto sale. Guardarlo evita que la
 * pantalla vuelva a saltar cada vez que entra a Hoy: preguntar una vez es
 * ayudar, insistir es estorbar.
 */
export const CLAVE_STOCK_OFRECIDO = "stockOfrecido";
/**
 * "oscuro" | "claro" | "sistema". Por defecto **claro**, no "sistema": pedido
 * explícito del dueño — ver estilos.css.
 */
export const CLAVE_TEMA = "tema";

/** Hasta qué hora tiene sentido preguntar por el stock del día. */
export const HORA_TOPE_STOCK = 11;

/**
 * Los nombres de modelo cambian cada pocos meses, así que el modelo se edita
 * desde Ajustes sin tocar el código. Este es el que ya está comprobado con la
 * key de este usuario en Lykari; `gemini-2.5-flash` le devolvía 404.
 */
export const MODELO_POR_DEFECTO = "gemini-3.5-flash";

export async function leerAjuste(clave: string): Promise<string | undefined> {
  return (await db.ajustes.get(clave))?.valor;
}

export async function guardarAjuste(clave: string, valor: string): Promise<void> {
  const limpio = valor.trim();
  if (limpio) await db.ajustes.put({ clave, valor: limpio });
  else await db.ajustes.delete(clave);
}

export interface ConfigIA {
  apiKey?: string;
  modelo: string;
}

export async function configuracionIA(): Promise<ConfigIA> {
  const [apiKey, modelo] = await Promise.all([leerAjuste(CLAVE_API), leerAjuste(CLAVE_MODELO)]);
  return { apiKey, modelo: modelo || MODELO_POR_DEFECTO };
}

export async function hayKey(): Promise<boolean> {
  return !!(await leerAjuste(CLAVE_API));
}
