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
      "Al decir «ya pagó todo» por voz, ahora redondea a la moneda más chica y perdona el resto, igual que el botón de Cobranza.",
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
    texto: "La app avisa de las novedades cada vez que instalas una actualización, como esta pantalla.",
  },
  {
    fecha: "2026-08-19",
    texto:
      "Restaurar un respaldo en otro teléfono ya no puede mezclar el historial de una tienda borrada con una tienda real de ese teléfono que no tiene nada que ver.",
  },
  {
    fecha: "2026-08-19",
    texto:
      "El aviso de «Compartir respaldo» / «Restaurar» ahora se ve en rojo cuando algo falla y en verde cuando queda listo. Antes los dos se veían igual.",
  },
  {
    fecha: "2026-08-19",
    texto:
      "Al cobrar, el máximo que se puede perdonar como descuento (en vez de quedar como deuda) subió de S/ 5 a S/ 20.",
  },
  {
    fecha: "2026-08-20",
    texto:
      "La tarjeta de cobro en Cobranza es más compacta: «A cobrar» y «Cuánto te dio» ahora van en la misma fila.",
  },
  {
    fecha: "2026-08-20",
    texto:
      "Al abrir «Me dio otra cantidad» en Cobranza, el buscador y los botones Deudas/Ruta se esconden mientras cobras, y vuelven al cancelar o confirmar.",
  },
  {
    fecha: "2026-08-20",
    texto:
      "El logo del pollo en Hoy ahora tiene su propia versión para el modo oscuro (trazo dorado). Antes se volvía blanco liso y perdía el dibujo.",
  },
  {
    fecha: "2026-08-20",
    texto:
      "Las deudas que enseña Hoy («Debe S/ X de antes») ahora se redondean a la moneda de 10 céntimos, igual que en Cobranza, y una migaja de menos de 10 céntimos ya no se enseña, porque no se puede cobrar.",
  },
  {
    fecha: "2026-08-20",
    texto:
      "Corregido: si un día dictabas solo el total (sin decir el precio por kilo), la diferencia de precio aprendida de esa tienda no se actualizaba y se quedaba pegada a un valor viejo. Ahora aprende de lo que el total realmente implicó.",
  },
  {
    fecha: "2026-08-20",
    texto:
      "El botón «+» de Ruta (dar de alta a alguien nuevo) ahora sugiere tiendas parecidas mientras escribes el nombre, igual que hace el dictado, para no crear un duplicado de alguien que ya está en el directorio.",
  },
  {
    fecha: "2026-08-21",
    texto:
      "Ahora sí: cuando corriges el precio por kilo (o el total) de una entrega ya registrada, la tienda lo aprende. Antes la entrega quedaba bien pero la tienda no se enteraba, y al día siguiente volvía a proponerte el precio viejo.",
  },
  {
    fecha: "2026-08-21",
    texto:
      "Se acabaron las deudas de céntimos imposibles de cobrar. Un resto por debajo de S/ 0.10 ya no queda como deuda al cerrar el día (se perdona, que es lo que era), y las que ya tenías colgadas («Debe S/ 0.05») se limpian solas al abrir la app.",
  },
  {
    fecha: "2026-08-21",
    texto:
      "Corregido: después de un día de reparto, salir de Historial o de un día cerrado te abría a editar una entrega cualquiera en vez de volver a Hoy. El atrás ya no se acuerda de por dónde pasaste: cada pantalla sale siempre al mismo sitio.",
  },
  {
    fecha: "2026-08-22",
    texto:
      "Hoy ya no trae el interruptor Agenda / Ruta: va directo a la Ruta, que es como repartes, y esa fila de arriba se la queda la lista. Si alguna vez quieres la Agenda de vuelta, se enciende y se apaga en Ajustes → «Ver la Agenda en Hoy».",
  },
  {
    fecha: "2026-08-22",
    texto:
      "El orden de la Ruta ahora mira las dos últimas semanas, no los dos últimos días. Un día raro (una tienda cerrada, un desvío) ya no te reordena la lista entera al día siguiente; para que la ruta cambie, el cambio tiene que repetirse.",
  },
  {
    fecha: "2026-08-22",
    texto:
      "Desde Cobranza ya puedes corregir una entrega sin salir de la vuelta: toca la línea de lo que le dejaste («5 pollos · 12.4 kg · 9.50/kg») y se abre para cambiar cantidades, peso, precio o total. También en las que ya cobraste, por si te diste cuenta tarde de que le sacaste la cuenta a menos. Al terminar vuelves a Cobranza, no a Hoy.",
  },
  {
    fecha: "2026-08-22",
    texto:
      "Ya puedes corregir una entrega de un día cerrado: Más → Historial → el día → «Corregir esta entrega». Y lo más importante, la diferencia ya no se pierde: si resulta que le cobraste de menos, lo que falta pasa a lo que te debe y te sale en Cobranza. Antes esos soles desaparecían sin avisar.",
  },
  {
    fecha: "2026-08-22",
    texto:
      "Un cobro mal tecleado ya se puede deshacer. Abre la entrega (desde Hoy, desde Cobranza o desde el Historial), busca «Cobros de ese día» y toca Deshacer. La plata vuelve a estar por cobrar y, si parte de ese cobro había saldado una deuda vieja, esa deuda vuelve también. Pide confirmación antes, que mueve plata de verdad.",
  },
  {
    fecha: "2026-08-22",
    texto:
      "Cada cliente tiene ahora su ficha: Tiendas → tócalo → «Ver su historial». Ahí ves cuánto te debe, a cómo le vienes cobrando (y entre qué precios se ha movido), cuánto te ha comprado en total, cuántas veces te quedó debiendo, lo que le has regalado en redondeos, y sus últimas entregas una por una.",
  },
  {
    fecha: "2026-08-22",
    texto:
      "Las tarjetas de Cobranza se leen más grandes: la línea de lo que le dejaste, el «De hoy» y la deuda subieron de tamaño, y el lápiz de corregir pasó a ser un botón con recuadro en vez de un icono diminuto.",
  },
  {
    fecha: "2026-08-22",
    texto:
      "El Detalle de una entrega estrena arriba un botón de reloj que abre el historial de ese cliente: ver a cómo le vienes cobrando mientras corriges su cuenta, sin dar el rodeo por Tiendas. Al salir vuelves a la entrega, no al directorio.",
  },
  {
    fecha: "2026-08-22",
    texto:
      "En Cobranza, los botones Deudas / Ruta ya no se llevan una fila entera: ahora van al ancho de su texto, compartiendo fila con el buscador. La lista empieza 54px más arriba y se ven más tiendas de una sola mirada.",
  },
  {
    fecha: "2026-08-22",
    texto:
      "Corregidos tres casos donde la plata se podía perder sin avisar, encontrados simulando dos meses de reparto: dejarle dos veces sin pesar a la misma tienda el mismo día y cobrarle todo junto ya no le mete el dinero solo a la primera entrega; deshacer un cobro de un día ya cerrado ya no deja ese saldo invisible; y borrar una entrega vieja ya no le recorta el «cobrado» a otro día distinto donde de verdad se cobró algo.",
  },
  {
    fecha: "2026-08-22",
    texto:
      "Nueva ficha en Más → «Cómo se usa»: un tour de 10 pasos por toda la app, en el orden real del día (salir, repartir, cobrar de vuelta, cuadrar la caja). Sirve para enseñarle a alguien más a usarla, o para recordar dónde estaba algo.",
  },
  {
    fecha: "2026-08-22",
    texto:
      "El «Cómo se usa» ahora trae un tour guiado de verdad: oscurece la app, te señala cada botón con un anillo que parpadea y te dice para qué sirve, pasando solo de pantalla en pantalla. Va sobre la app real, así que si todavía no tienes datos te explica igual qué va a salir en cada sitio.",
  },
  {
    fecha: "2026-08-22",
    texto:
      "«¿Con cuánto sales?» ahora tiene un campo aparte para los pechos que compraste ya sueltos, cuando te faltó mercadería y le compraste a otro repartidor. Antes, entregar esos pechos se contaba como si hubieras partido uno de tus propios pollos, y eso inflaba de más las piernas que te quedaban por vender.",
  },
  {
    fecha: "2026-08-22",
    texto:
      "El dictado por micrófono entiende muchas más formas de hablar: precios como «a nueve y treinta» o «al precio de 9.80», totales como «sale 42» o «le cobré 42», pesos como «pesó 12.4» o «dos kilos y medio», pagos por Yape o Plin, «canceló todito», y corregirte a mitad de dictado con «digo» («dos pollos digo tres»). También agarra el nombre si lo dices al final («dos pollos para la Rosa»), ignora las muletillas del arranque («ya anota…»), y ya no confunde «le llevo 2 pollos a Rosa» con la carga de la mañana.",
  },
  {
    fecha: "2026-08-22",
    texto:
      "El micrófono ahora escucha con un motor propio, mejor afinado: aguanta tus pausas sin cortarse (antes perdía palabras en cada corte), reconoce en el mismo teléfono sin esperar a la red (ahí estaba la demora), y ya no se queda «mudo» después de un error. Truco: si descargas el paquete de voz en español de Google (Ajustes de Android → Sistema → Dictado por voz), transcribe rápido incluso sin señal.",
  },
];
