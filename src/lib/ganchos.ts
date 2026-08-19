import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { StatusBar, Style } from "@capacitor/status-bar";
import { db } from "../db/db";
import { CLAVE_TEMA, leerAjuste } from "../voz/ajustes";
import { esNativo } from "./plataforma";

/**
 * Dónde estaba el scroll de cada lista, para no perder el sitio.
 *
 * Vive a nivel de módulo a propósito: sobrevive a que la pantalla se
 * re-renderice —o se desmonte y vuelva— tras cobrar, editar o crear algo, que
 * era lo que devolvía la lista al principio de todo cada vez.
 */
const memoriaScroll: Record<string, number> = {};

/**
 * Recuerda y restaura la posición del scroll de un contenedor.
 *
 * Devuelve el manejador para `onScroll` (guarda la posición sin parar) y
 * restaura la guardada tras cada cambio de `dep` —normalmente los datos de la
 * lista—, justo después de re-renderizar y antes de pintar, así el salto al
 * inicio no llega a verse. Como se guarda en cada scroll, restaurar tras un
 * cambio de datos cae siempre en la última posición del dedo: es un no-op
 * mientras se desplaza y solo corrige el reinicio cuando algo reordena la lista.
 */
export function useMemoriaScroll(
  ref: RefObject<HTMLElement | null>,
  clave: string,
  dep: unknown,
): () => void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = memoriaScroll[clave] ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, dep]);

  return useCallback(() => {
    const el = ref.current;
    if (el) memoriaScroll[clave] = el.scrollTop;
  }, [ref, clave]);
}

/**
 * Un ajuste como estado de React, con su valor por defecto. Se relee solo
 * cuando cambia la tabla, así que Ajustes no tiene que avisar a nadie.
 */
export function useAjuste(clave: string, defecto = ""): string {
  const valor = useLiveQuery(() => leerAjuste(clave), [clave]);
  return valor ?? defecto;
}

/**
 * Un interruptor guardado.
 *
 * El «apagado» se guarda como `"0"`, nunca como cadena vacía: `guardarAjuste`
 * borra la clave cuando el valor está vacío, y al releerla volvía el valor por
 * defecto. Los interruptores que arrancan encendidos —el sonido, el dictado por
 * teclado— **no se podían apagar**: volvían solos.
 */
export function useAjusteBool(clave: string, defecto = false): boolean {
  const v = useAjuste(clave, defecto ? "1" : "0");
  return v === "1";
}

export type Tema = "oscuro" | "claro" | "sistema";

/**
 * Aplica el tema elegido al elemento raíz, vía `data-theme` (estilos.css
 * define los tokens de `[data-theme="claro"]`; sin el atributo es oscuro).
 *
 * "Sistema" sigue `prefers-color-scheme` del teléfono y se actualiza solo si
 * lo cambia mientras la app sigue abierta — nadie tiene que reabrirla para
 * que se note.
 */
export function useTema(): void {
  const tema = useAjuste(CLAVE_TEMA, "claro") as Tema;

  useEffect(() => {
    const metaColor = document.querySelector('meta[name="theme-color"]');
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const aplicar = () => {
      const claro = tema === "claro" || (tema === "sistema" && mq.matches);
      document.documentElement.dataset.theme = claro ? "claro" : "oscuro";
      // El navegador tiñe la barra de direcciones con esto en modo PWA; sin
      // actualizarlo quedaba oscuro aunque la app ya hubiera pasado a claro.
      metaColor?.setAttribute("content", claro ? "#f3ecdd" : "#101220");
      // Solo el color de los íconos: la barra de estado sigue transparente
      // (`overlay: true`, puesto por `cerrarSplash()` en main.tsx al cerrar
      // el splash) y sin eso `--seguro-arriba` da 0 — se rompe el espaciado
      // de todas las pantallas. Íconos oscuros sobre el fondo claro, claros
      // sobre el oscuro, igual que ya hace `metaColor` arriba.
      if (esNativo) {
        void StatusBar.setStyle({ style: claro ? Style.Light : Style.Dark });
      }
    };
    aplicar();
    if (tema !== "sistema") return;
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, [tema]);
}

/**
 * Cuánto margen extra hace falta reservar al final de una lista con scroll
 * para que el micrófono flotante nunca tape el último botón — pero **solo
 * cuando de verdad hace falta**.
 *
 * El padding de abajo del cuadro de scroll (230-250px) ya despeja el
 * micrófono una vez que se hizo scroll hasta el fondo. El problema es una
 * lista corta que no llega a pedir scroll: ahí ese padding nunca se ve, y el
 * micrófono cae encima del último botón desde el primer vistazo.
 *
 * Ya se probó reservar ese espacio siempre, con `margin-bottom` fijo en el
 * cuadro de scroll — y encogía también las listas largas que nunca tuvieron
 * el problema, y en un Android de verdad eso cortaba tarjetas a la mitad
 * (ver CLAUDE.md §7 bis). Esta versión mide antes de decidir: si el
 * contenido ya necesita scroll, no toca nada — el diseño que ya funcionaba
 * bien queda exactamente igual. Solo reserva margen cuando el contenido, sin
 * reservarlo, cabría entero sin pedir scroll.
 *
 * La medición no puede depender de su propio resultado: `scrollHeight` (lo
 * que ocupa el contenido) y la posición del borde de arriba del elemento no
 * cambian por su propio `margin-bottom`, así que no hay vuelta atrás que
 * haga oscilar el cálculo.
 *
 * `scrollHeight` ya incluye el padding-bottom fijo que cada pantalla trae de
 * antes (230-250px) — hay que restarlo para saber dónde termina de verdad la
 * última tarjeta, no dónde termina el padding que la sigue.
 */
export function useHolguraMic(
  ref: RefObject<HTMLElement | null>,
  huellaPx: number,
  paddingYaReservadoPx: number,
  dep: unknown,
): string {
  const [haceFalta, setHaceFalta] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const disponible = window.innerHeight - el.getBoundingClientRect().top;
      const contenidoSinPadding = el.scrollHeight - paddingYaReservadoPx;
      // Si el contenido de verdad (sin el padding de seguridad) ya cabría
      // entero en la pantalla — sin pedir scroll por su cuenta — es una
      // lista corta: ahí es donde el micrófono puede tapar algo desde el
      // primer vistazo, y vale la pena reservarle su espacio de verdad. Si
      // ya es lo bastante larga como para pedir scroll con o sin el
      // micrófono de por medio, no hay nada que tocar: el padding de
      // siempre despeja al llegar al fondo, como ya venía funcionando.
      setHaceFalta(contenidoSinPadding <= disponible);
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);

  return haceFalta ? `calc(${huellaPx}px + var(--seguro-abajo))` : "0px";
}

/** Las tiendas, ordenadas por la ruta que la app fue aprendiendo. */
export function useTiendas() {
  return (
    useLiveQuery(async () => {
      const t = await db.tiendas.toArray();
      return t.sort((a, b) => (a.ordenRuta || 99) - (b.ordenRuta || 99));
    }, []) ?? []
  );
}

/**
 * Un reloj que solo avanza cada 30 segundos. Suficiente para el encabezado, y
 * no repinta la lista sesenta veces por minuto mientras él maneja.
 */
export function useReloj(): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}
