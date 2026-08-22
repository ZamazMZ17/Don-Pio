import type { Pantalla } from "./lib/navegacion";

/**
 * Los pasos del tour guiado (`ui/Tour.tsx`): la superposición que oscurece la
 * app, recorta un botón de verdad y explica para qué sirve.
 *
 * `objetivo` es el `data-tour="..."` del elemento a señalar. Va sobre la app
 * real, así que **si se mueve o se renombra un botón hay que actualizar su
 * `data-tour` aquí**. Cuando el elemento no aparece —porque todavía no hay
 * datos: Cobranza sin cuentas, Hoy sin clientes— el paso no se rompe: se
 * enseña centrado y con el texto de `siFalta`, que explica qué va a salir ahí
 * cuando lo use de verdad.
 */
export interface PasoTour {
  /** En qué pantalla vive el paso. El tour navega solo hasta ella. */
  pantalla: Pantalla;
  /** El `data-tour` del elemento a resaltar. Sin él, la burbuja va centrada. */
  objetivo?: string;
  titulo: string;
  texto: string;
  /** Qué decir si ese elemento todavía no existe por falta de datos. */
  siFalta?: string;
}

export const PASOS_TOUR: PasoTour[] = [
  {
    pantalla: "hoy",
    titulo: "Te muestro la app",
    texto:
      "Voy a ir señalando cada botón y para qué sirve. Toca «Siguiente» (o cualquier parte de la pantalla) para avanzar.",
  },
  {
    pantalla: "hoy",
    objetivo: "encabezado",
    titulo: "Con cuánto saliste",
    texto:
      "Aquí arriba está tu día: cuántos pollos repartiste, cuántos te quedan, y lo cobrado. Tócalo para cargar con cuánto sales por la mañana.",
  },
  {
    pantalla: "hoy",
    objetivo: "lista",
    titulo: "Tus clientes, en orden de ruta",
    texto:
      "Esta es la lista del día. Vas tocando de uno en uno según avanzas: al que no le has dejado nada se abre para registrar, y al que ya le dejaste se abre para corregir.",
    siFalta:
      "Aquí van a salir tus clientes en el orden en que los visitas. Todavía no tienes ninguno: se van creando solos al dictar.",
  },
  {
    pantalla: "hoy",
    objetivo: "flotante",
    titulo: "El botón grande",
    texto:
      "Con el micrófono dictas la entrega: «a doña Elsa cinco pollos, doce kilos setecientos, a nueve treinta». Si estás en la vista de Ruta, este botón es un + para dar de alta a alguien nuevo.",
  },
  {
    pantalla: "cobranza",
    objetivo: "tab-cobranza",
    titulo: "La vuelta: cobrar",
    texto:
      "Esta pestaña es para el retorno. Sale lo que te deben, del último al primero: repartes de ida y cobras de vuelta.",
  },
  {
    pantalla: "cobranza",
    objetivo: "cuenta",
    titulo: "La cuenta ya sacada",
    texto:
      "Cada tarjeta trae lo de hoy más lo que te debe de antes, ya sumado. No tienes que juntar nada de cabeza.",
    siFalta:
      "Cuando tengas entregas sin cobrar, aquí sale cada cliente con su cuenta: lo de hoy más lo que te debe de antes, ya sumado.",
  },
  {
    pantalla: "cobranza",
    objetivo: "corregir",
    titulo: "¿La cuenta salió mal?",
    texto:
      "Este lápiz abre la entrega para corregirla sin salir de la vuelta: cantidades, peso, precio o total. Si le cobraste de menos, la diferencia pasa a lo que te debe.",
    siFalta:
      "En cada tarjeta hay un lápiz que abre la entrega para corregirla ahí mismo, por si le sacaste la cuenta a menos kilaje o al precio de otro día.",
  },
  {
    pantalla: "cobranza",
    objetivo: "cobrar",
    titulo: "Cobrar",
    texto:
      "«Me pagó todo» cobra la cuenta completa. Si te dio otra cantidad, el otro botón abre el teclado, y lo que falte le queda debiendo para mañana.",
    siFalta:
      "Para cobrar hay dos botones: «Me pagó todo» cobra la cuenta completa, y «Me dio otra cantidad» abre el teclado para poner lo que te dio.",
  },
  {
    pantalla: "tiendas",
    objetivo: "tab-tiendas",
    titulo: "Tus clientes",
    texto:
      "Aquí está tu directorio, que se arma solo con lo que vas dictando. Tocando un cliente puedes renombrarlo, apuntarle una deuda vieja, o ver su historial.",
  },
  {
    pantalla: "menu",
    objetivo: "tab-mas",
    titulo: "Todo lo demás",
    texto: "En «Más» está lo que no usas cada rato pero necesitas tener a mano.",
  },
  {
    pantalla: "menu",
    objetivo: "menu-cierre",
    titulo: "Cerrar el día",
    texto:
      "Al terminar, aquí te dice cuánta plata deberías tener en la caja para que cuadre con la del bolsillo. Lo que quedó sin cobrar pasa a deuda y te aparece mañana.",
  },
  {
    pantalla: "menu",
    objetivo: "menu-historial",
    titulo: "Los días de antes",
    texto:
      "El Historial guarda cada día cerrado, entrega por entrega, para cuando alguien discute una cuenta. Desde ahí también puedes corregir una entrega vieja.",
  },
  {
    pantalla: "menu",
    objetivo: "menu-tutorial",
    titulo: "Y eso es todo",
    texto:
      "Puedes repetir este tour cuando quieras desde aquí. Ahí mismo está la guía escrita, con más detalle de cada paso.",
  },
];
