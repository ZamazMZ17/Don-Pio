import type { CSSProperties, ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

/**
 * Las piezas que se repiten en todas las pantallas. Los tamaños salen tal cual
 * del prototipo: nada por debajo de 52px de zona táctil.
 */

export const S = {
  tarjeta: {
    background: "var(--superficie)",
    borderRadius: "var(--radio-md)",
    // `border`, no `box-shadow` de 0 de difuminado: en Android ese anillo
    // duro sobre una esquina redondeada a veces sale con costuras — el
    // borde se ve entrecortado en vez de parejo. Un borde de verdad no
    // tiene ese problema, y como toda la app ya usa box-sizing: border-box,
    // no le come nada al tamaño ni al padding de la tarjeta.
    border: "1px solid var(--linea)",
  } as CSSProperties,
  rotulo: {
    fontFamily: "var(--fuente-titulo)",
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "var(--texto-4)",
  } as CSSProperties,
  scroll: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  } as CSSProperties,
  /**
   * Un botón de icono en la cabecera. Cumple el mínimo táctil de 52px de §4
   * con margen vertical negativo, para que el área que se toca crezca sin que
   * la cabecera engorde — el mismo truco del botón de orden de Hoy. Con
   * `padding: 8` medía 36px y el dedo no lo acertaba a la intemperie.
   */
  iconoCabecera: {
    minWidth: 52,
    minHeight: 52,
    margin: "-10px 0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "none",
  } as CSSProperties,
};

export function Cabecera({
  titulo,
  sub,
  volver,
  derecha,
}: {
  titulo: string;
  sub?: string;
  volver?: () => void;
  derecha?: ReactNode;
}) {
  return (
    <div
      style={{
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 20px 14px",
      }}
    >
      {volver && (
        <button
          onClick={volver}
          aria-label="Volver"
          style={{
            width: 34,
            height: 40,
            display: "flex",
            alignItems: "center",
            color: "var(--acento-claro)",
            flex: "none",
          }}
        >
          <ChevronLeft size={30} strokeWidth={2.2} />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--fuente-titulo)",
            fontSize: 27,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          {titulo}
        </div>
        {sub && <div style={{ fontSize: 13, color: "var(--texto-4)", marginTop: 4 }}>{sub}</div>}
      </div>
      {derecha}
    </div>
  );
}

/** El botón grande de acción: contorno de acento, nunca relleno. */
export function BotonPrincipal({
  children,
  onClick,
  alto = 60,
  deshabilitado,
}: {
  children: ReactNode;
  onClick?: () => void;
  alto?: number;
  deshabilitado?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={deshabilitado}
      className="pulsable-acento"
      style={{
        height: alto,
        // Sin esto se aplasta. Casi siempre cuelga de una columna flex (el
        // área de scroll de la pantalla), y ahí un item flex se encoge por
        // debajo de su `height` en cuanto el contenido desborda: en el
        // Detalle de una entrega larga medía 30px en vez de 62 —la mitad, y
        // por debajo del mínimo táctil de 52—, que es lo que lo hacía verse
        // flaco. Mismo fallo que el de los íconos del Menú (CLAUDE.md §7 bis).
        flex: "none",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radio)",
        // 2.5px y no el 1.5 del resto de la app: en estos botones el relleno
        // casi no se despega del fondo, así que el contorno *es* el botón, y
        // a 1.5px en una pantalla densa se veía como un pelo — flaco para lo
        // que es la acción principal de la pantalla. Los bordes de tarjetas,
        // chips y campos se quedan en 1.5: ahí el borde solo delimita.
        border: "2.5px solid var(--acento)",
        background: "var(--acento-900)",
        color: "var(--acento-200)",
        fontSize: 18,
        fontWeight: 600,
        opacity: deshabilitado ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function BotonSecundario({
  children,
  onClick,
  alto = 52,
}: {
  children: ReactNode;
  onClick?: () => void;
  alto?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="pulsable"
      style={{
        height: alto,
        // Igual que BotonPrincipal: sin esto se encoge en una columna flex.
        flex: "none",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radio)",
        border: "1.5px solid var(--borde)",
        color: "var(--texto-2)",
        fontSize: 16,
      }}
    >
      {children}
    </button>
  );
}

/** Los +/− de las cantidades. 52px, que es lo que se acierta con guantes. */
export function Contador({
  valor,
  onCambio,
  paso = 1,
  tamano = 52,
  apagado,
}: {
  valor: number;
  onCambio: (v: number) => void;
  paso?: number;
  tamano?: number;
  apagado?: boolean;
}) {
  const color = apagado ? "var(--texto-3)" : "var(--texto)";
  const boton: CSSProperties = {
    width: tamano,
    height: tamano,
    borderRadius: tamano > 56 ? 14 : 12,
    border: "1.5px solid var(--borde)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: tamano > 56 ? 34 : 28,
    color,
    flex: "none",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: tamano > 56 ? 0 : 16, flex: tamano > 56 ? 1 : undefined, justifyContent: "space-between" }}>
      <button
        className="pulsable"
        style={boton}
        onClick={() => onCambio(Math.max(0, valor - paso))}
        aria-label="Quitar"
      >
        −
      </button>
      <div
        style={{
          fontSize: tamano > 56 ? 56 : 30,
          fontWeight: 700,
          minWidth: 44,
          textAlign: "center",
          lineHeight: 1,
          color: apagado ? "var(--texto-2)" : "var(--texto)",
        }}
      >
        {valor}
      </div>
      <button
        className="pulsable"
        style={{ ...boton, fontSize: tamano > 56 ? 32 : 26 }}
        onClick={() => onCambio(valor + paso)}
        aria-label="Agregar"
      >
        +
      </button>
    </div>
  );
}

/** Una fila «etiqueta … valor», que es la mitad de esta interfaz. */
export function Fila({
  label,
  valor,
  color,
  tam = 16,
  peso = 400,
}: {
  label: ReactNode;
  valor: ReactNode;
  color?: string;
  tam?: number;
  peso?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
        fontSize: tam,
        padding: "7px 0",
      }}
    >
      <span style={{ color: "var(--texto-2)" }}>{label}</span>
      <span style={{ color: color ?? "var(--texto)", fontWeight: peso || 600 }}>{valor}</span>
    </div>
  );
}

export function Vacio({ titulo, sub }: { titulo: string; sub: string }) {
  return (
    <div
      style={{
        padding: "48px 28px",
        textAlign: "center",
        color: "var(--texto-4)",
        lineHeight: 1.6,
      }}
    >
      <div style={{ fontSize: 17, color: "var(--texto-2)", marginBottom: 8 }}>{titulo}</div>
      <div style={{ fontSize: 14 }}>{sub}</div>
    </div>
  );
}
