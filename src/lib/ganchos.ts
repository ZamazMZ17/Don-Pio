import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { CLAVE_TEMA, leerAjuste } from "../voz/ajustes";

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
  const tema = useAjuste(CLAVE_TEMA, "oscuro") as Tema;

  useEffect(() => {
    const metaColor = document.querySelector('meta[name="theme-color"]');
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const aplicar = () => {
      const claro = tema === "claro" || (tema === "sistema" && mq.matches);
      document.documentElement.dataset.theme = claro ? "claro" : "oscuro";
      // El navegador tiñe la barra de direcciones con esto en modo PWA; sin
      // actualizarlo quedaba oscuro aunque la app ya hubiera pasado a claro.
      metaColor?.setAttribute("content", claro ? "#f3ecdd" : "#161826");
    };
    aplicar();
    if (tema !== "sistema") return;
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, [tema]);
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
