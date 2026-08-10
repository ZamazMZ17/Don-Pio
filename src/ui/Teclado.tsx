import { Delete } from "lucide-react";

/**
 * Teclado numérico propio, no el del sistema.
 *
 * El de Android tapa media pantalla y esconde justo lo que él necesita mirar
 * mientras teclea — el desglose del cobro, o cuánto lleva cargado. Además sus
 * teclas son pequeñas: estas son de 56px, que es lo que se acierta a las 5 a.m.
 * con las manos frías.
 */
export function Teclado({
  valor,
  onCambio,
  decimales = true,
  maxDecimales = 2,
}: {
  valor: string;
  onCambio: (v: string) => void;
  /** Los pollos son enteros; el dinero no. */
  decimales?: boolean;
  maxDecimales?: number;
}) {
  const pulsar = (t: string) => {
    if (t === "←") return onCambio(valor.slice(0, -1));
    if (t === "C") return onCambio("");
    if (t === ".") {
      if (!decimales || valor.includes(".")) return;
      return onCambio(valor ? valor + "." : "0.");
    }
    // Sin límite de enteros, pero sí de decimales: nadie cobra milésimas.
    if (valor.includes(".") && valor.split(".")[1].length >= maxDecimales) return;
    // Un cero a la izquierda no significa nada y se ve a error.
    if (valor === "0") return onCambio(t);
    onCambio(valor + t);
  };

  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimales ? "." : "C", "0", "←"];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
      {teclas.map((t) => (
        <button
          key={t}
          className="pulsable"
          onClick={() => pulsar(t)}
          aria-label={t === "←" ? "Borrar" : t === "C" ? "Limpiar" : t}
          style={{
            height: 56,
            borderRadius: "var(--radio)",
            background: "var(--linea)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            fontWeight: 600,
            color: t === "←" || t === "C" ? "var(--acento-claro)" : "var(--texto)",
          }}
        >
          {t === "←" ? <Delete size={24} /> : t}
        </button>
      ))}
    </div>
  );
}
