import { Children, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Las piezas que se repiten en todas las pantallas. Los tamaños salen tal cual
 * del prototipo: nada por debajo de 52px de zona táctil.
 *
 * V2 (iOS/macOS): mismas piezas, mismas firmas — ninguna pantalla que todavía
 * no se tocó se rompe —, pero por dentro hablan el idioma de iOS: elevación
 * con sombra suave en vez de borde duro, radios más generosos, el resorte de
 * `--resorte` donde algo aparece. Se suman tres piezas nuevas que no
 * existían: `Grupo`/`FilaToque` (la lista agrupada de Ajustes/Settings),
 * `Segmentado` (el control de Agenda/Ruta, Deudas/Ruta) e `Interruptor` (el
 * switch, que antes se armaba a mano cada vez que hacía falta uno).
 */

export const S = {
  /**
   * Una superficie elevada suelta — un panel, la tarjeta de dictado, un campo
   * de Stock. V2 la separa del fondo con una sombra difusa, no con un borde
   * de 1px: así es como iOS despega una capa de otra. **Ojo**: esto no es el
   * mismo patrón que costó el bug de CLAUDE.md §7 bis — aquel era un
   * `box-shadow` **sin difuminar** (`0 0 0 Npx color`) usado como sustituto
   * de borde, y esa combinación sí sale con costuras en Android/Skia. Una
   * sombra con blur de verdad (la de aquí) es un camino de render distinto
   * y no tiene ese problema — es el mismo tipo de sombra que ya usa medio
   * Android desde Material Design.
   */
  tarjeta: {
    background: "var(--superficie)",
    borderRadius: "var(--radio-md)",
    boxShadow: "var(--sombra-sm)",
  } as CSSProperties,
  /** Mayúsculas chicas, como los rótulos de sección de Ajustes en iOS. */
  rotulo: {
    fontFamily: "var(--fuente-titulo)",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.8,
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
   * con margen negativo, para que el área que se toca crezca sin que la
   * cabecera engorde — el mismo truco del botón de orden de Hoy. Con
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
        gap: 10,
        padding: "12px 20px 16px",
      }}
    >
      {volver && (
        <button
          onClick={volver}
          aria-label="Volver"
          className="toque"
          // El target de 52px de siempre (S.iconoCabecera), corrido hacia la
          // izquierda para que la flecha quede pegada al borde de la
          // pantalla en vez de flotar en medio de un hueco — antes el botón
          // medía 34×40, por debajo del mínimo de §4.
          style={{ ...S.iconoCabecera, marginLeft: -14, color: "var(--acento-claro)" }}
        >
          <ChevronLeft size={28} strokeWidth={2.3} />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/*
          El título grande de iOS: Inter pesado, sin mayúsculas forzadas, con
          el tracking cerrado que usan los "Large Title" de Apple. V1 usaba
          Bebas Neue condensada en mayúsculas — un aire de rótulo de camión
          que no encaja con el resto del rediseño; se deja atrás a propósito.
        */}
        <div
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: -0.6,
            lineHeight: 1.08,
            color: "var(--texto)",
          }}
        >
          {titulo}
        </div>
        {sub && <div style={{ fontSize: 14, color: "var(--texto-4)", marginTop: 4 }}>{sub}</div>}
      </div>
      {derecha}
    </div>
  );
}

/**
 * El botón grande de acción. V2: capsular y con relleno tintado — el patrón
 * de botón "tinted" de iOS (fondo suave del color de acento, texto del mismo
 * color, sin contorno). V1 llevaba un contorno de 2.5px porque el relleno
 * casi no se despegaba del fondo; en V2 una sombra suave hace ese trabajo
 * sin necesitar un borde duro.
 */
export function BotonPrincipal({
  children,
  onClick,
  alto = 58,
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
      className="toque"
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
        // Capsular de verdad: el radio es la mitad del alto.
        borderRadius: alto / 2,
        border: "none",
        background: "var(--acento-900)",
        boxShadow: "var(--sombra-sm)",
        color: "var(--acento-300)",
        fontSize: 18,
        fontWeight: 700,
        opacity: deshabilitado ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

/**
 * El botón grande, pero sólido: para la única acción de verdad irreversible
 * de cada pantalla (cerrar el día, borrar algo). Relleno del color de acento
 * de punta a punta, texto blanco — el patrón "filled" de iOS para la acción
 * que de verdad importa distinguir de las tintadas de alrededor.
 */
export function BotonSolido({
  children,
  onClick,
  alto = 58,
  deshabilitado,
  color = "acento",
}: {
  children: ReactNode;
  onClick?: () => void;
  alto?: number;
  deshabilitado?: boolean;
  /** "acento" (de siempre) o "rojo" (para una acción destructiva). */
  color?: "acento" | "rojo";
}) {
  return (
    <button
      onClick={onClick}
      disabled={deshabilitado}
      className="toque"
      style={{
        height: alto,
        flex: "none",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: alto / 2,
        border: "none",
        background: color === "rojo" ? "var(--rojo-solido)" : "var(--acento-solido)",
        boxShadow: "var(--sombra-md)",
        color: "var(--sobre-solido)",
        fontSize: 18,
        fontWeight: 700,
        opacity: deshabilitado ? 0.4 : 1,
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
      className="toque"
      style={{
        height: alto,
        // Igual que BotonPrincipal: sin esto se encoge en una columna flex.
        flex: "none",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: alto / 2,
        border: "none",
        background: "var(--hundido)",
        color: "var(--texto-2)",
        fontSize: 16,
        fontWeight: 600,
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
    borderRadius: "50%",
    border: "none",
    background: "var(--hundido)",
    boxShadow: "var(--sombra-sm)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: tamano > 56 ? 30 : 24,
    fontWeight: 600,
    color,
    flex: "none",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: tamano > 56 ? 0 : 16,
        flex: tamano > 56 ? 1 : undefined,
        justifyContent: "space-between",
      }}
    >
      <button className="toque" style={boton} onClick={() => onCambio(Math.max(0, valor - paso))} aria-label="Quitar">
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
      <button className="toque" style={boton} onClick={() => onCambio(valor + paso)} aria-label="Agregar">
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
      <span style={{ color: "var(--texto-2)", minWidth: 0 }}>{label}</span>
      {/* El valor no se parte nunca: si falta sitio, cede el rótulo. Sin esto un
          monto quedaba «S/» en una línea y «150.00» en la de abajo. */}
      <span
        style={{
          color: color ?? "var(--texto)",
          fontWeight: peso || 600,
          flex: "none",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {valor}
      </span>
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

/**
 * Una lista agrupada, como las secciones de Ajustes en iOS: un solo
 * contenedor redondeado con una línea fina entre cada fila, en vez de una
 * tarjeta suelta por elemento. Se usa para listas cortas y fijas (un panel
 * de ajustes, el resumen de un cierre); las listas largas y dinámicas de
 * clientes siguen siendo tarjetas sueltas con `gap` entre sí — ahí cada
 * tarjeta es su propia unidad que se resalta, se desliza o cambia de alto
 * sola (una cuenta abierta en Cobranza, por ejemplo), y meterlas todas en un
 * único contenedor pelearía con eso.
 */
export function Grupo({
  children,
  titulo,
  pie,
  separador = 16,
}: {
  children: ReactNode;
  /** El rótulo chico encima del grupo. */
  titulo?: string;
  /** Una nota chica debajo, para aclarar lo que hay arriba. */
  pie?: string;
  /** Desde dónde arranca la línea divisoria — alineada al contenido de la fila. */
  separador?: number;
}) {
  const filas = Children.toArray(children).filter(Boolean);
  return (
    <div>
      {titulo && (
        <div style={{ ...S.rotulo, marginBottom: 8, marginLeft: 6 }}>{titulo}</div>
      )}
      <div
        style={{
          ...S.tarjeta,
          borderRadius: "var(--radio-md)",
          overflow: "hidden",
        }}
      >
        {filas.map((fila, i) => (
          <div key={i}>
            {fila}
            {i < filas.length - 1 && (
              <div style={{ height: 1, background: "var(--linea)", marginLeft: separador }} />
            )}
          </div>
        ))}
      </div>
      {pie && (
        <div style={{ fontSize: 13, color: "var(--texto-4)", marginTop: 8, marginLeft: 6, lineHeight: 1.45 }}>
          {pie}
        </div>
      )}
    </div>
  );
}

/** Una fila tocable dentro de un `Grupo`, con su cheurón de "esto navega". */
export function FilaToque({
  onClick,
  children,
  chevron = true,
  alto = 54,
  color,
}: {
  onClick: () => void;
  children: ReactNode;
  /** Si se enseña la flecha de "esto abre algo" a la derecha. */
  chevron?: boolean;
  alto?: number;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="pulsable"
      style={{
        width: "100%",
        minHeight: alto,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 16px",
        color: color ?? "var(--texto)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>{children}</div>
      {chevron && <ChevronRight size={18} color="var(--texto-5)" style={{ flex: "none" }} />}
    </button>
  );
}

/** Una fila no tocable dentro de un `Grupo` — mismo molde, sin interacción. */
export function FilaGrupo({
  children,
  alto = 54,
}: {
  children: ReactNode;
  alto?: number;
}) {
  return (
    <div
      style={{
        width: "100%",
        minHeight: alto,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 16px",
      }}
    >
      {children}
    </div>
  );
}

/**
 * El control segmentado: Agenda/Ruta, Deudas/Ruta, Oscuro/Claro/Sistema.
 * Reemplaza los `ModoBtn` que cada pantalla armaba por su cuenta — mismo
 * patrón, una sola vez. La opción activa flota en una píldora con sombra
 * sobre un carril hundido, como el segmented control de iOS.
 */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  onCambio: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: 3,
        background: "var(--hundido)",
        borderRadius: "var(--radio)",
        height: 44,
      }}
    >
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            onClick={() => onCambio(o.valor)}
            className="toque"
            style={{
              flex: 1,
              // Cuando el control se dimensiona por su contenido (Cobranza,
              // que comparte fila con el buscador) el padding es lo único que
              // separa una etiqueta de la otra: sin él quedaba «DeudasRuta».
              minWidth: 72,
              padding: "0 16px",
              borderRadius: "calc(var(--radio) - 3px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: activo ? "var(--superficie)" : "transparent",
              boxShadow: activo ? "var(--sombra-sm)" : "none",
              color: activo ? "var(--texto)" : "var(--texto-3)",
              fontWeight: activo ? 600 : 500,
              fontSize: 14,
              whiteSpace: "nowrap",
              transition:
                "background-color 160ms var(--suave), box-shadow 160ms var(--suave), color 160ms var(--suave)",
            }}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

/** El switch de encendido/apagado — el de Ajustes y el "perdonar" de Cobranza. */
export function Interruptor({
  activo,
  onCambio,
  etiqueta,
}: {
  activo: boolean;
  onCambio: () => void;
  etiqueta?: ReactNode;
}) {
  return (
    <button
      onClick={onCambio}
      role="switch"
      aria-checked={activo}
      className="toque"
      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}
    >
      {etiqueta !== undefined && (
        <span style={{ flex: 1, textAlign: "left", fontSize: 16, color: "var(--texto)" }}>
          {etiqueta}
        </span>
      )}
      <span
        style={{
          width: 51,
          height: 31,
          borderRadius: "var(--radio-pill)",
          padding: 2,
          flex: "none",
          display: "flex",
          background: activo ? "var(--acento-solido)" : "var(--borde)",
          justifyContent: activo ? "flex-end" : "flex-start",
          transition: "background-color 180ms var(--suave)",
        }}
      >
        <span
          style={{
            width: 27,
            height: 27,
            borderRadius: "50%",
            background: "#fffefb",
            boxShadow: "0 1px 4px rgba(0,0,0,.35)",
          }}
        />
      </span>
    </button>
  );
}

/** Una píldora de estado — Pagado / Pendiente / Parcial, o lo que haga falta. */
export function Insignia({ texto, color }: { texto: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: "var(--radio-pill)",
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {texto}
    </span>
  );
}
