import { useEffect, useState } from "react";
import { db } from "../db/db";
import { configuracionIA } from "./ajustes";
import { conGemini, hayInternet } from "./interpretar";

/**
 * La cola de dictados que se interpretaron sin señal.
 *
 * Lo que el parser local sacó ya está registrado y funcionando; esto solo lo
 * **afina** cuando vuelve el internet: un nombre mejor escrito, un precio que
 * el parser no pilló. Nunca reescribe una entrega ya guardada — eso cambiaría
 * números que él ya dio por buenos, y a lo mejor ya cobró.
 *
 * El resultado se guarda en el dictado. Si difiere de lo registrado, la app lo
 * puede ofrecer como corrección; lo que no hace es aplicarlo por su cuenta.
 */

export async function pendientes(): Promise<number> {
  return db.dictados.where("estado").equals("pendiente").count();
}

export async function procesarCola(limite = 10): Promise<number> {
  if (!hayInternet()) return 0;
  const config = await configuracionIA();
  if (!config.apiKey) return 0;

  const cola = await db.dictados.where("estado").equals("pendiente").limit(limite).toArray();
  let hechos = 0;

  for (const d of cola) {
    if (!d.transcripcion.trim()) {
      // Un dictado sin texto no tiene nada que repasar. Se descarta para que
      // no se quede dando vueltas en la cola para siempre.
      await db.dictados.update(d.id!, { estado: "descartado" });
      continue;
    }
    try {
      const intencion = await conGemini(d.transcripcion);
      await db.dictados.update(d.id!, {
        json: JSON.stringify(intencion),
        intencion: intencion.intencion,
        origen: "gemini",
        estado: "procesado",
        error: undefined,
      });
      hechos++;
    } catch (e) {
      const motivo = e instanceof Error ? e.message : "Falló el repaso";
      /*
       * Con la cuota agotada no hay nada que esperar: el plan gratuito no se
       * repone hasta el día siguiente y reintentar solo gasta batería. Los
       * dictados se dan por buenos con lo que sacó el parser, que es lo que él
       * ya vio y confirmó en la tarjeta.
       */
      if (/cuota/i.test(motivo)) {
        const cola = await db.dictados.where("estado").equals("pendiente").toArray();
        for (const p of cola) await db.dictados.update(p.id!, { estado: "procesado", error: motivo });
        return hechos;
      }
      await db.dictados.update(d.id!, { error: motivo });
      break; // si falló uno, los demás fallarán igual: no gastar cuota.
    }
  }

  return hechos;
}

/**
 * Lanza el repaso al recuperar la conexión y al volver a la app. No hay
 * temporizador: gastar batería reintentando cada minuto en una ruta sin
 * cobertura no arregla nada.
 */
export function useCola() {
  const [enCola, setEnCola] = useState(0);

  useEffect(() => {
    let vivo = true;

    const revisar = async () => {
      if (!vivo) return;
      await procesarCola();
      if (vivo) setEnCola(await pendientes());
    };

    void revisar();
    window.addEventListener("online", revisar);
    document.addEventListener("visibilitychange", revisar);
    return () => {
      vivo = false;
      window.removeEventListener("online", revisar);
      document.removeEventListener("visibilitychange", revisar);
    };
  }, []);

  return enCola;
}

/** Estado de la conexión, para el aviso del encabezado. */
export function useConexion(): boolean {
  const [enLinea, setEnLinea] = useState(hayInternet);

  useEffect(() => {
    const arriba = () => setEnLinea(true);
    const abajo = () => setEnLinea(false);
    window.addEventListener("online", arriba);
    window.addEventListener("offline", abajo);
    return () => {
      window.removeEventListener("online", arriba);
      window.removeEventListener("offline", abajo);
    };
  }, []);

  return enLinea;
}
