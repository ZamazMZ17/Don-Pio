import { useState } from "react";
import {
  Bird,
  CalendarClock,
  ClipboardCheck,
  Mic,
  Package,
  Pencil,
  RotateCcw,
  Settings,
  Store,
  Undo2,
  Play,
  type LucideIcon,
} from "lucide-react";
import { PASOS, type IconoPaso } from "../tutorial";
import { Cabecera, S } from "../ui/base";

/**
 * Los íconos por nombre. `tutorial.ts` guarda solo el nombre para no arrastrar
 * componentes de React dentro de un archivo de contenido — así el texto se
 * corrige sin tocar nada que se renderice.
 */
const ICONOS: Record<IconoPaso, LucideIcon> = {
  Package,
  Mic,
  ClipboardCheck,
  Store,
  Undo2,
  Pencil,
  RotateCcw,
  CalendarClock,
  Settings,
  Bird,
};

/**
 * El tour de la app, paso a paso.
 *
 * De a un paso por pantalla y no una parrafada larga con scroll: se lee de pie
 * y en ratos sueltos, y así siempre se ve dónde va y cuánto le falta. El
 * contenido está en `tutorial.ts`.
 */
export function Tutorial({
  volver,
  empezarTour,
}: {
  volver: () => void;
  /**
   * Arranca el tour guiado: la superposición que va señalando cada botón en
   * la app de verdad. Es el camino principal — esta pantalla escrita queda
   * como el detalle para consultar después.
   */
  empezarTour: () => void;
}) {
  const [i, setI] = useState(0);
  const paso = PASOS[i];
  const Icono = ICONOS[paso.icono];
  const primero = i === 0;
  const ultimo = i === PASOS.length - 1;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Cabecera titulo="Cómo se usa" sub={`Paso ${i + 1} de ${PASOS.length}`} volver={volver} />

      {/* La misma barra de progreso que Cobranza, para que se lea igual. */}
      <div style={{ flex: "none", padding: "0 18px 14px" }}>
        <div style={{ height: 8, background: "var(--linea)", borderRadius: 99, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${((i + 1) / PASOS.length) * 100}%`,
              background: "var(--acento)",
              borderRadius: 99,
              transition: "width 220ms ease-out",
            }}
          />
        </div>
      </div>

      <div
        className="scroll"
        style={{
          flex: 1,
          padding: "0 18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/*
          Primero el tour guiado y después la guía escrita: señalando los
          botones de verdad se aprende antes que leyendo, sobre todo si nunca
          abrió la app. Lo escrito queda para consultar un paso suelto.
        */}
        <button
          onClick={empezarTour}
          className="pulsable-acento"
          style={{
            flex: "none",
            width: "100%",
            minHeight: 60,
            borderRadius: "var(--radio)",
            border: "2.5px solid var(--acento)",
            background: "var(--acento-900)",
            color: "var(--acento-200)",
            fontSize: 17,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
          }}
        >
          <Play size={19} strokeWidth={2.4} style={{ flexShrink: 0 }} />
          Hacer el tour por la app
        </button>

        <div
          style={{
            ...S.tarjeta,
            padding: "22px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <Icono
            size={34}
            color="var(--acento-claro)"
            strokeWidth={2}
            // Como en las fichas del Menú: sin esto se aplasta cuando el
            // texto de abajo es largo (CLAUDE.md §7 bis).
            style={{ flexShrink: 0 }}
          />
          <div style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.2 }}>{paso.titulo}</div>

          {paso.cuerpo.map((parrafo) => (
            <p
              key={parrafo}
              style={{ fontSize: 17, lineHeight: 1.55, color: "var(--texto-2)", margin: 0 }}
            >
              {parrafo}
            </p>
          ))}

          {paso.truco && (
            <div
              style={{
                marginTop: 2,
                padding: "12px 14px",
                borderRadius: "var(--radio)",
                background: "var(--acento-900)",
                border: "1.5px solid var(--acento)",
              }}
            >
              <div style={{ ...S.rotulo, fontSize: 12, marginBottom: 4 }}>Truco</div>
              <div style={{ fontSize: 16, lineHeight: 1.5, color: "var(--acento-200)" }}>
                {paso.truco}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fijos abajo: no se van con el scroll de un paso largo. */}
      <div
        style={{
          flex: "none",
          display: "flex",
          gap: 10,
          padding: "0 18px calc(20px + var(--seguro-abajo))",
        }}
      >
        <button
          className="pulsable"
          onClick={() => (primero ? volver() : setI(i - 1))}
          style={{
            flex: 1,
            height: 58,
            borderRadius: "var(--radio)",
            border: "1.5px solid var(--borde)",
            color: "var(--texto-2)",
            fontSize: 17,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {primero ? "Salir" : "Atrás"}
        </button>
        <button
          className="pulsable-acento"
          onClick={() => (ultimo ? volver() : setI(i + 1))}
          style={{
            flex: 1.5,
            height: 58,
            borderRadius: "var(--radio)",
            border: "2.5px solid var(--acento)",
            background: "var(--acento-900)",
            color: "var(--acento-200)",
            fontSize: 18,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {ultimo ? "Listo" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}
