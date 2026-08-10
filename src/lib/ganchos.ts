import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { leerAjuste } from "../voz/ajustes";

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
 * Un reloj que solo avanza cada minuto. Suficiente para el encabezado, y no
 * repinta la lista sesenta veces por minuto mientras él maneja.
 */
export function useReloj(): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}
