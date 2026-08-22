/**
 * El tour de la app, paso a paso. Se llega desde Menú → «Cómo se usa».
 *
 * Vive aparte de la pantalla, como `cambios.ts`, por dos motivos: el texto se
 * corrige sin tocar el componente, y así queda a la vista que **hay que
 * actualizarlo cuando la app cambia**. Un tutorial que describe una versión
 * vieja es peor que no tener ninguno: enseña a buscar botones que ya no
 * están.
 *
 * Está escrito para alguien que nunca la abrió, así que va en el orden real
 * del día —salir, repartir, cobrar de vuelta, cuadrar la caja— y no en el
 * orden de las pestañas. Cada paso cabe en una pantalla sin desplazar.
 */

/** El nombre del ícono de `lucide-react` que ilustra el paso. */
export type IconoPaso =
  | "Package"
  | "Mic"
  | "ClipboardCheck"
  | "Store"
  | "Undo2"
  | "Pencil"
  | "RotateCcw"
  | "CalendarClock"
  | "Settings"
  | "Bird";

export interface PasoTutorial {
  icono: IconoPaso;
  titulo: string;
  /** Cada párrafo va suelto, para que respire en pantalla. */
  cuerpo: string[];
  /** Un detalle que ahorra un problema. Se pinta aparte, en acento. */
  truco?: string;
}

export const PASOS: PasoTutorial[] = [
  {
    icono: "Bird",
    titulo: "Tu día, en tres pasos",
    cuerpo: [
      "Esta app lleva la cuenta de tres cosas: con cuánto saliste, qué dejaste en cada tienda, y cuánto cobraste de vuelta.",
      "Al final del día te dice cuánta plata deberías tener en la caja, para que cuadre con la que de verdad tienes en el bolsillo.",
      "Todo funciona sin señal. Registrar una entrega nunca necesita internet.",
    ],
  },
  {
    icono: "Package",
    titulo: "1 · Con cuánto sales",
    cuerpo: [
      "Por la mañana la app te pregunta con cuántos pollos y piernas sales, y a qué precio por kilo va el día.",
      "No es obligatorio: si andas apurado, dale «Ahora no» y repartes igual. Solo que sin eso no puede decirte cuánto te queda en el camión.",
    ],
    truco: "¿Se te pasó? Toca el encabezado de Hoy, donde dice «Has repartido», y lo cargas cuando quieras.",
  },
  {
    icono: "Mic",
    titulo: "2 · Dictar una entrega",
    cuerpo: [
      "El botón grande de abajo a la derecha es el micrófono. Púlsalo y di a quién le dejaste, cuántos pollos, cuánto pesaron y a cómo.",
      "Por ejemplo: «a doña Elsa cinco pollos, doce kilos setecientos, a nueve treinta».",
      "Sale una tarjeta con lo que entendió. Si algo salió mal, lo corriges ahí mismo antes de guardar.",
    ],
    truco: "Suena y vibra al guardar, para que sepas que quedó registrado sin mirar la pantalla.",
  },
  {
    icono: "Store",
    titulo: "3 · O tocando la Ruta",
    cuerpo: [
      "La pantalla Hoy te lista a todos tus clientes en el orden en que los visitas. Vas tocando de uno en uno según avanzas.",
      "Al que todavía no le dejaste nada, se abre la tarjeta para registrar. Al que ya le dejaste, se abre su detalle para corregir.",
      "Con el botón + agregas a alguien que todavía no está en tu lista. Según escribes te sugiere parecidos, para no crear dos veces al mismo.",
    ],
    truco: "La lista aprende sola: tras unos días se ordena según el recorrido que de verdad haces.",
  },
  {
    icono: "Undo2",
    titulo: "4 · Cobrar de vuelta",
    cuerpo: [
      "En la pestaña Cobranza está lo que te deben, ordenado del último al primero: repartes de ida y cobras de vuelta, así que el último al que dejaste es el primero que reencuentras.",
      "Lo que te debe de días anteriores ya viene sumado con lo de hoy. No tienes que juntar nada de cabeza.",
      "«Me pagó todo» cobra la cuenta completa. «Me dio otra cantidad» abre el teclado para poner lo que te dio.",
    ],
    truco: "Si te da de menos, lo que falta le queda debiendo y aparece mañana solo. Si son unos céntimos, te ofrece perdonarlos.",
  },
  {
    icono: "Pencil",
    titulo: "5 · Corregir una cuenta",
    cuerpo: [
      "Cobrando es cuando saltan los errores: le sacaste la cuenta a menos kilaje, o al precio de otro día.",
      "Toca el lápiz en la tarjeta, la línea que dice qué le dejaste, y ahí cambias cantidades, peso, precio o total.",
      "Si resulta que le cobraste de menos, la diferencia pasa a lo que te debe y te aparece para cobrar. No se pierde.",
    ],
    truco: "También sirve en las que ya cobraste, por si te diste cuenta tarde.",
  },
  {
    icono: "RotateCcw",
    titulo: "6 · Deshacer un cobro",
    cuerpo: [
      "¿Tecleaste 100 donde iban 10? Abre esa entrega, busca «Cobros de ese día» y toca Deshacer.",
      "La plata vuelve a estar por cobrar, y si parte de ese cobro había saldado una deuda vieja, esa deuda vuelve también.",
    ],
    truco: "Pide confirmación antes, porque mueve plata de verdad.",
  },
  {
    icono: "ClipboardCheck",
    titulo: "7 · Cerrar el día",
    cuerpo: [
      "Al terminar, en Más → «Cierre del día», te dice cuánto deberías tener en la caja. Cuenta tu plata y compara.",
      "Al cerrar, lo que quedó sin cobrar pasa a ser deuda de cada cliente, y por eso mañana te aparece en Cobranza.",
    ],
    truco: "Si se te olvida cerrar, la app cierra sola los días atrasados la próxima vez que la abras. No se pierde nada.",
  },
  {
    icono: "CalendarClock",
    titulo: "8 · Historial y clientes",
    cuerpo: [
      "En Más → Historial ves los días ya cerrados, entrega por entrega. Sirve para cuando alguien discute una cuenta.",
      "Ahí puedes corregir una entrega vieja con «Corregir esta entrega», y la diferencia llega hasta lo que te debe.",
      "En Tiendas, tocando un cliente y luego «Ver su historial», ves cuánto te debe, a cómo le vienes cobrando y cuántas veces te quedó debiendo.",
    ],
  },
  {
    icono: "Settings",
    titulo: "9 · Ajustes",
    cuerpo: [
      "Ahí eliges si la app se ve clara u oscura, la hora de cierre, y si quieres el sonido al guardar.",
      "También está el respaldo: guarda una copia de vez en cuando, sobre todo antes de cambiar de teléfono.",
      "Y «Ver la Agenda en Hoy», por si quieres además la lista de lo ya entregado del día.",
    ],
    truco: "La clave de Gemini es solo para los informes del día y de la semana. El dictado funciona sin ella.",
  },
];
