import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { guardarStock, leerJornada, sugerirPrecioBase, sugerirStock } from "../db/jornada";
import { diaCorto, horaAmPm, type DiaISO } from "../lib/fecha";
import { aCentimos } from "../lib/dinero";
import { avisoGuardado } from "../lib/aviso";
import { BotonPrincipal, S } from "../ui/base";
import { Teclado } from "../ui/Teclado";

type Campo = "pollos" | "piernas" | "precio";

/**
 * «¿Con cuánto sales hoy?». Es lo primero que se abre si la jornada empieza en
 * cero, porque sin stock inicial el «me quedan» del encabezado no dice nada.
 *
 * Se teclea la cantidad: son números de tres cifras que él ya sabe de memoria,
 * y llegar a 120 a golpes de +5 son veinticuatro toques.
 */
export function Stock({
  fecha,
  listo,
  ahoraNo,
}: {
  fecha: DiaISO;
  listo: () => void;
  /** Salir sin poner nada. Saber el stock ayuda, pero no es obligatorio. */
  ahoraNo: () => void;
}) {
  const jornada = useLiveQuery(() => leerJornada(fecha), [fecha]);
  const sugerencia = useLiveQuery(() => sugerirStock(fecha), [fecha]);
  const baseSugerido = useLiveQuery(() => sugerirPrecioBase(fecha), [fecha]);

  const [pollos, setPollos] = useState<string | null>(null);
  const [piernas, setPiernas] = useState("");
  /** Precio base por kilo del día, en soles con decimales, tal como se teclea. */
  const [precio, setPrecio] = useState("");
  const [activo, setActivo] = useState<Campo>("pollos");
  /** El primer número tras elegir un campo reemplaza; los siguientes suman. */
  const [recienElegido, setRecienElegido] = useState(true);

  // Arranca con lo que ya haya guardado y, si no hay nada, con lo que sugiere
  // el historial. En un efecto para no pisar lo que él esté tecleando cada vez
  // que Dexie reemite.
  useEffect(() => {
    if (!jornada || pollos !== null || baseSugerido === undefined) return;
    const p = jornada.stockPollos || sugerencia?.pollos || 0;
    const q = jornada.stockPiernas || sugerencia?.piernas || 0;
    const base = jornada.precioBaseKg || baseSugerido || 0;
    setPollos(p ? String(p) : "");
    setPiernas(q ? String(q) : "");
    setPrecio(base ? (base / 100).toFixed(2) : "");
  }, [jornada, sugerencia, baseSugerido, pollos]);

  if (!jornada || pollos === null) return null;

  const valor = activo === "pollos" ? pollos : activo === "piernas" ? piernas : precio;
  const poner = (v: string) =>
    activo === "pollos" ? setPollos(v) : activo === "piernas" ? setPiernas(v) : setPrecio(v);

  const teclear = (nuevo: string) => {
    // Al elegir un campo, el primer dígito borra lo que había: si no, teclear
    // sobre la sugerencia de 120 da 1209 y hay que borrar a mano.
    if (recienElegido && nuevo.length > valor.length) {
      poner(nuevo.slice(valor.length));
      setRecienElegido(false);
      return;
    }
    setRecienElegido(false);
    poner(nuevo);
  };

  const elegir = (campo: Campo) => {
    setActivo(campo);
    setRecienElegido(true);
    // El precio lleva decimales: el truco de «reemplazar al primer dígito» no
    // sirve —el teclado bloquea al llegar a dos decimales, así que un 9.50 ya
    // no admite otra tecla—; se limpia para reescribirlo de cero.
    if (campo === "precio") setPrecio("");
  };

  const empezar = () => {
    const base = aCentimos(Number(precio.replace(",", ".")) || 0);
    void guardarStock(fecha, Number(pollos) || 0, Number(piernas) || 0, base).then(() => {
      avisoGuardado();
      listo();
    });
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        // Sin barra de pestañas que ya traiga su propio --seguro-abajo, el
        // botón de "ahora no" quedaba pegado al borde: en un teléfono con
        // gestos, la barra del sistema lo tapaba o directamente robaba el toque.
        padding: "0 20px calc(24px + var(--seguro-abajo))",
      }}
    >
      <div style={{ flex: "none", padding: "18px 0 0" }}>
        <div style={{ fontSize: 14, color: "var(--texto-3)", marginBottom: 4 }}>
          {diaCorto(fecha)} · {horaAmPm()}
        </div>
        <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.15, letterSpacing: -0.5 }}>
          ¿Con cuánto sales hoy?
        </div>
        <div style={{ fontSize: 15, color: "var(--texto-4)", marginTop: 6, lineHeight: 1.45 }}>
          Sirve para saber cuánto te queda. Si no lo sabes todavía, puedes seguir sin ponerlo.
        </div>
      </div>

      <div
        className="scroll"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 14,
          padding: "16px 0",
        }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          <Campo
            rotulo="Pollos"
            valor={pollos}
            activo={activo === "pollos"}
            onClick={() => elegir("pollos")}
          />
          <Campo
            rotulo="Piernas"
            valor={piernas}
            activo={activo === "piernas"}
            onClick={() => elegir("piernas")}
          />
        </div>

        {/*
          El precio por kilo base del día: se aplica a todas las entregas, y
          cada tienda le suma o resta su diferencia. Hay días que sube o baja
          para todos, y aquí es donde se pone.
        */}
        <Campo
          rotulo="Precio base · por kilo"
          valor={precio}
          prefijo="S/ "
          activo={activo === "precio"}
          onClick={() => elegir("precio")}
        />

        {/* Enteros para las cantidades; el precio sí lleva decimales. */}
        <Teclado valor={valor} onCambio={teclear} decimales={activo === "precio"} />

        {sugerencia?.texto && (
          <div
            style={{
              background: "var(--acento-900)",
              borderRadius: "var(--radio)",
              padding: "12px 14px",
              fontSize: 14,
              color: "var(--acento-300)",
              lineHeight: 1.5,
            }}
          >
            {sugerencia.texto}
          </div>
        )}
      </div>

      <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        <BotonPrincipal onClick={empezar} alto={62} deshabilitado={!Number(pollos)}>
          Empezar el día
        </BotonPrincipal>
        <button
          onClick={ahoraNo}
          style={{
            height: 52,
            width: "100%",
            color: "var(--texto-3)",
            fontSize: 16,
            textAlign: "center",
          }}
        >
          Ahora no, ya lo pongo después
        </button>
      </div>
    </div>
  );
}

/**
 * Uno de los dos números. El activo se marca con el borde de acento: sin eso
 * no hay forma de saber a cuál van a ir las teclas.
 */
function Campo({
  rotulo,
  valor,
  activo,
  onClick,
  prefijo,
}: {
  rotulo: string;
  valor: string;
  activo: boolean;
  onClick: () => void;
  /** «S/ » delante del número, para el precio. */
  prefijo?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`${rotulo}: ${valor || "sin cantidad"}`}
      style={{
        ...S.tarjeta,
        flex: 1,
        minWidth: 0,
        borderRadius: "var(--radio-lg)",
        padding: "14px 16px 16px",
        // Ancho fijo en los dos estados — si cambiara de 1px a 2px al
        // activarse, el contenido saltaría un pixel al pasar de un campo a
        // otro con box-sizing: border-box.
        border: activo ? "2px solid var(--acento)" : "2px solid var(--linea)",
        background: activo ? "var(--acento-900)" : "var(--superficie)",
      }}
    >
      <div style={{ ...S.rotulo, fontSize: 12, marginBottom: 6 }}>{rotulo}</div>
      <div
        style={{
          fontSize: 52,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: -1,
          color: valor ? "var(--texto)" : "var(--texto-5)",
        }}
      >
        {prefijo && <span style={{ fontSize: 28, color: "var(--texto-4)" }}>{prefijo}</span>}
        {valor || "0"}
        {activo && (
          <span
            style={{
              display: "inline-block",
              width: 3,
              height: 42,
              marginLeft: 4,
              verticalAlign: "-6px",
              background: "var(--acento-claro)",
              animation: "dpcursor 1s steps(1) infinite",
            }}
          />
        )}
      </div>
    </button>
  );
}
