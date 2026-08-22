import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PASOS_TOUR, type PasoTour } from "../tour";
import type { Pantalla } from "../lib/navegacion";

/** Lo que ocupa el elemento señalado, en coordenadas de pantalla. */
interface Hueco {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Cuánto aire se le deja alrededor al elemento dentro del recorte. */
const AIRE = 8;

/**
 * El tour guiado: oscurece la app, recorta el botón del que se está hablando
 * y lo rodea con un anillo que late, con una burbuja al lado que dice para qué
 * sirve.
 *
 * Va sobre la app **de verdad**, no sobre capturas: cada paso navega a su
 * pantalla y busca el elemento por su `data-tour`. Así no puede quedar
 * desactualizado enseñando un botón que ya se movió — si el elemento deja de
 * existir, el paso se nota en el acto (cae al modo sin recorte) en vez de
 * mentir en silencio.
 *
 * El oscurecido son **cuatro rectángulos** alrededor del hueco y no un
 * `box-shadow` gigante: en Android un anillo duro sobre esquinas redondeadas
 * sale con costuras (CLAUDE.md §7 bis), y cuatro divs opacos no tienen ese
 * problema.
 */
export function Tour({
  pantalla,
  irA,
  cerrar,
}: {
  pantalla: Pantalla;
  /** El tour maneja la navegación: cada paso vive en su pantalla. */
  irA: (p: Pantalla) => void;
  cerrar: () => void;
}) {
  const [i, setI] = useState(0);
  const [hueco, setHueco] = useState<Hueco | null>(null);
  const paso: PasoTour = PASOS_TOUR[i];
  const ultimo = i === PASOS_TOUR.length - 1;
  /** Para no volver a pedir la misma pantalla en cada medición. */
  const pedida = useRef<Pantalla | null>(null);

  // Cada paso vive en su pantalla: si no estamos ahí, el tour navega solo.
  useEffect(() => {
    if (pantalla !== paso.pantalla && pedida.current !== paso.pantalla) {
      pedida.current = paso.pantalla;
      irA(paso.pantalla);
    }
  }, [paso, pantalla, irA]);

  /*
   * Medir después de pintar, y repetir un par de veces: al cambiar de pantalla
   * la lista todavía se está montando (Dexie resuelve un frame después), así
   * que la primera medida puede caer sobre un hueco que aún no existe.
   */
  useLayoutEffect(() => {
    let vivo = true;
    const medir = () => {
      if (!vivo) return;
      if (!paso.objetivo) {
        setHueco(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(`[data-tour="${paso.objetivo}"]`);
      if (!el) {
        setHueco(null);
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "auto" });
      const r = el.getBoundingClientRect();
      /*
       * Recortado a la pantalla. Los elementos que ocupan todo el ancho —la
       * lista de Hoy, una tarjeta de Cobranza— más el aire de los lados se
       * salían del viewport, y el anillo aparecía cortado por el borde.
       */
      const x = Math.max(0, r.left - AIRE);
      const y = Math.max(0, r.top - AIRE);
      setHueco({
        x,
        y,
        ancho: Math.min(r.width + AIRE * 2, window.innerWidth - x),
        alto: Math.min(r.height + AIRE * 2, window.innerHeight - y),
      });
    };

    medir();
    const reintentos = [60, 180, 400, 700].map((ms) => setTimeout(medir, ms));
    window.addEventListener("resize", medir);
    return () => {
      vivo = false;
      reintentos.forEach(clearTimeout);
      window.removeEventListener("resize", medir);
    };
  }, [paso, pantalla]);

  const avanzar = () => (ultimo ? cerrar() : setI(i + 1));

  /*
   * Dónde poner la burbuja. Se mide el hueco que queda a cada lado del
   * elemento y se elige el que de verdad la aguanta; si ninguno llega
   * —porque lo resaltado ocupa casi toda la pantalla, como la lista de Hoy—
   * se ancla abajo del todo y flota por encima. Antes se decidía solo por si
   * el elemento estaba en la mitad de arriba, y con un elemento alto la
   * burbuja se salía por el borde superior sin que se leyera nada.
   *
   * Sin hueco (el elemento no existe todavía — Cobranza sin cuentas, Hoy sin
   * clientes) se centra, y el paso lo dice con otras palabras (`siFalta`).
   */
  const alto = window.innerHeight;
  const MINIMO_BURBUJA = 240;
  const espacioArriba = hueco ? hueco.y : 0;
  const espacioAbajo = hueco ? alto - (hueco.y + hueco.alto) : 0;
  const lado: "arriba" | "abajo" | "flotante" = !hueco
    ? "flotante"
    : espacioAbajo >= MINIMO_BURBUJA
      ? "abajo"
      : espacioArriba >= MINIMO_BURBUJA
        ? "arriba"
        : "flotante";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 90,
        // La capa entera come toques: durante el tour no se opera la app, se
        // mira. Así un toque de más no registra una entrega de verdad.
        pointerEvents: "auto",
      }}
      onClick={avanzar}
    >
      {hueco ? (
        <>
          <Sombra style={{ left: 0, top: 0, right: 0, height: hueco.y }} />
          <Sombra style={{ left: 0, top: hueco.y + hueco.alto, right: 0, bottom: 0 }} />
          <Sombra style={{ left: 0, top: hueco.y, width: hueco.x, height: hueco.alto }} />
          <Sombra
            style={{ left: hueco.x + hueco.ancho, top: hueco.y, right: 0, height: hueco.alto }}
          />
          {/* El anillo que late alrededor del botón. */}
          <div
            className="tour-anillo"
            style={{
              position: "absolute",
              left: hueco.x,
              top: hueco.y,
              width: hueco.ancho,
              height: hueco.alto,
              borderRadius: "var(--radio)",
              border: "3px solid var(--acento-claro)",
              pointerEvents: "none",
            }}
          />
        </>
      ) : (
        <Sombra style={{ inset: 0 }} />
      )}

      <Burbuja
        paso={paso}
        sinObjetivo={!hueco}
        indice={i}
        total={PASOS_TOUR.length}
        lado={lado}
        anclaY={hueco ? (lado === "abajo" ? hueco.y + hueco.alto + 14 : hueco.y - 14) : 0}
        onSiguiente={avanzar}
        onAtras={i === 0 ? null : () => setI(i - 1)}
        onSaltar={cerrar}
      />
    </div>
  );
}

/** Un trozo del oscurecido. Cuatro de estos dejan el hueco en el medio. */
function Sombra({ style }: { style: React.CSSProperties }) {
  return <div style={{ position: "absolute", background: "rgba(0,0,0,.72)", ...style }} />;
}

function Burbuja({
  paso,
  sinObjetivo,
  indice,
  total,
  lado,
  anclaY,
  onSiguiente,
  onAtras,
  onSaltar,
}: {
  paso: PasoTour;
  sinObjetivo: boolean;
  indice: number;
  total: number;
  /**
   * `abajo` cuelga desde el ancla hacia abajo, `arriba` sube desde ella, y
   * `flotante` la fija al pie de la pantalla — para cuando lo resaltado es
   * tan grande que no deja sitio a ningún lado.
   */
  lado: "arriba" | "abajo" | "flotante";
  anclaY: number;
  onSiguiente: () => void;
  onAtras: (() => void) | null;
  onSaltar: () => void;
}) {
  const posicion =
    lado === "abajo"
      ? { top: anclaY }
      : lado === "arriba"
        ? { bottom: `calc(100% - ${anclaY}px)` }
        : { bottom: "calc(18px + var(--seguro-abajo))" };

  return (
    <div
      // Se para el toque: dentro de la burbuja mandan sus botones, no el
      // "toca donde sea para avanzar" de la capa de atrás.
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: 14,
        right: 14,
        ...posicion,
        background: "var(--superficie)",
        border: "1.5px solid var(--acento)",
        borderRadius: "var(--radio-lg)",
        padding: "16px 18px 14px",
        boxShadow: "0 10px 30px rgba(0,0,0,.45)",
        animation: "dpup .18s ease-out",
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--texto-4)", marginBottom: 6 }}>
        {indice + 1} DE {total}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25, marginBottom: 6 }}>
        {paso.titulo}
      </div>
      <div style={{ fontSize: 16, lineHeight: 1.5, color: "var(--texto-2)" }}>
        {sinObjetivo && paso.siFalta ? paso.siFalta : paso.texto}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
        <button
          onClick={onSaltar}
          style={{
            minHeight: 52,
            padding: "0 12px",
            margin: "-6px 0",
            color: "var(--texto-4)",
            fontSize: 15,
            flex: "none",
          }}
        >
          Salir
        </button>
        <div style={{ flex: 1 }} />
        {onAtras && (
          <button
            onClick={onAtras}
            className="pulsable"
            style={{
              minHeight: 52,
              padding: "0 16px",
              borderRadius: "var(--radio)",
              border: "1.5px solid var(--borde)",
              color: "var(--texto-2)",
              fontSize: 16,
              flex: "none",
            }}
          >
            Atrás
          </button>
        )}
        <button
          onClick={onSiguiente}
          className="pulsable-acento"
          style={{
            minHeight: 52,
            padding: "0 22px",
            borderRadius: "var(--radio)",
            border: "2px solid var(--acento)",
            background: "var(--acento-900)",
            color: "var(--acento-200)",
            fontSize: 17,
            fontWeight: 600,
            flex: "none",
          }}
        >
          {indice + 1 === total ? "Listo" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}
