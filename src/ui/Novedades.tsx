import { useCallback, useEffect, useState } from "react";
import { CAMBIOS, type Cambio } from "../cambios";
import { CLAVE_CAMBIOS_VISTOS, guardarAjuste, leerAjuste } from "../voz/ajustes";
import { BotonPrincipal, S } from "./base";

/**
 * Qué le falta ver del registro de cambios, y cómo marcarlo como visto.
 *
 * Se resuelve con una lectura puntual (`leerAjuste`, no `useLiveQuery`): la
 * primera vez que abre la app en un teléfono no hay nada guardado todavía, y
 * ahí no hay «novedades» que anunciar — solo se marca el punto de partida en
 * silencio, para no recibirlo con una pantalla que no venía a cuento.
 */
export function useNovedades(): { nuevas: Cambio[]; cerrar: () => void } {
  const [nuevas, setNuevas] = useState<Cambio[]>([]);

  useEffect(() => {
    void (async () => {
      const guardado = await leerAjuste(CLAVE_CAMBIOS_VISTOS);
      if (guardado === undefined) {
        await guardarAjuste(CLAVE_CAMBIOS_VISTOS, String(CAMBIOS.length));
        return;
      }
      const vistos = Number(guardado) || 0;
      if (vistos < CAMBIOS.length) setNuevas(CAMBIOS.slice(vistos));
    })();
  }, []);

  const cerrar = useCallback(() => {
    setNuevas([]);
    void guardarAjuste(CLAVE_CAMBIOS_VISTOS, String(CAMBIOS.length));
  }, []);

  return { nuevas, cerrar };
}

/** La tarjeta de «qué cambió», la primera vez que abre una actualización. */
export function HojaNovedades({ cambios, onCerrar }: { cambios: Cambio[]; onCerrar: () => void }) {
  return (
    <div
      style={{
        pointerEvents: "auto",
        margin: "0 18px 14px",
        background: "var(--superficie)",
        borderRadius: "var(--radio-lg)",
        padding: 20,
        border: "1px solid var(--borde)",
        boxShadow: "0 16px 40px rgba(0,0,0,.65)",
        animation: "dpup .22s ease-out",
        maxHeight: "72vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ ...S.rotulo, fontSize: 13, marginBottom: 4 }}>Se actualizó</div>
      <div
        style={{
          fontFamily: "var(--fuente-titulo)",
          fontSize: 24,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        Novedades
      </div>
      <ul
        style={{
          margin: "0 0 18px",
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflowY: "auto",
          minHeight: 0,
        }}
      >
        {/* La más nueva primero: es la que más le importa a alguien que
            actualizó hace rato y ya vio varias entradas anteriores. */}
        {[...cambios].reverse().map((c, idx) => (
          <li
            key={idx}
            style={{ fontSize: 15, lineHeight: 1.5, color: "var(--texto-2)", display: "flex", gap: 10 }}
          >
            <span style={{ color: "var(--acento-claro)", flex: "none" }}>•</span>
            <span>{c.texto}</span>
          </li>
        ))}
      </ul>
      <BotonPrincipal onClick={onCerrar}>Entendido</BotonPrincipal>
    </div>
  );
}
