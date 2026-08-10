import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import {
  CLAVE_API,
  CLAVE_HORA_CIERRE,
  CLAVE_MODELO,
  CLAVE_MODO_TECLADO,
  CLAVE_REDONDEO,
  CLAVE_SONIDO,
  CLAVE_STOCK_DEFECTO,
  MODELO_POR_DEFECTO,
  guardarAjuste,
} from "../voz/ajustes";
import { pendientes, procesarCola } from "../voz/cola";
import { useAjuste, useAjusteBool } from "../lib/ganchos";
import { Cabecera, S } from "../ui/base";

/**
 * Ajustes. Lo importante aquí es la API key: vive en el dispositivo y no se
 * publica nunca dentro del APK.
 */
export function Ajustes({ volver }: { volver: () => void }) {
  const apiKey = useAjuste(CLAVE_API);
  const modelo = useAjuste(CLAVE_MODELO, MODELO_POR_DEFECTO);
  const horaCierre = useAjuste(CLAVE_HORA_CIERRE, "19:30");
  const stockDefecto = useAjuste(CLAVE_STOCK_DEFECTO, "120");
  const modoTeclado = useAjusteBool(CLAVE_MODO_TECLADO, true);
  const redondeo = useAjusteBool(CLAVE_REDONDEO);
  const sonido = useAjusteBool(CLAVE_SONIDO, true);

  const enCola = useLiveQuery(() => pendientes(), []) ?? 0;
  const tiendas = useLiveQuery(() => db.tiendas.count(), []) ?? 0;
  const [verKey, setVerKey] = useState(false);
  const [repasando, setRepasando] = useState(false);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Cabecera titulo="Ajustes" volver={volver} />

      <div
        className="scroll"
        style={{
          flex: 1,
          padding: "0 18px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* La IA */}
        <div style={{ ...S.tarjeta, borderRadius: 12, padding: 16 }}>
          <div style={{ ...S.rotulo, marginBottom: 4 }}>Gemini</div>
          <div
            style={{ fontSize: 14, color: "var(--texto-3)", marginBottom: 12, lineHeight: 1.5 }}
          >
            Tu API key se guarda solo en este teléfono. Sin ella la app funciona igual, pero
            entiende el dictado con reglas en vez de con IA.
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              type={verKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => void guardarAjuste(CLAVE_API, e.target.value)}
              placeholder="Pega aquí tu API key"
              autoComplete="off"
              spellCheck={false}
              style={campo}
            />
            <button
              onClick={() => setVerKey(!verKey)}
              className="pulsable"
              style={{
                flex: "none",
                width: 72,
                height: 52,
                borderRadius: "var(--radio)",
                border: "1.5px solid var(--borde)",
                color: "var(--texto-2)",
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {verKey ? "Ocultar" : "Ver"}
            </button>
          </div>

          <input
            value={modelo}
            onChange={(e) => void guardarAjuste(CLAVE_MODELO, e.target.value)}
            placeholder={MODELO_POR_DEFECTO}
            spellCheck={false}
            style={campo}
          />
          <div style={{ fontSize: 13, color: "var(--texto-4)", marginTop: 8, lineHeight: 1.5 }}>
            Los nombres de modelo cambian cada pocos meses; por eso se edita aquí.
          </div>

          {enCola > 0 && (
            <button
              className="pulsable"
              onClick={() => {
                setRepasando(true);
                void procesarCola(50).finally(() => setRepasando(false));
              }}
              style={{
                marginTop: 14,
                height: 52,
                width: "100%",
                borderRadius: "var(--radio)",
                border: "1.5px solid var(--borde)",
                color: "var(--acento-300)",
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {repasando
                ? "Repasando…"
                : `Repasar ${enCola} ${enCola === 1 ? "dictado" : "dictados"} pendientes`}
            </button>
          )}
        </div>

        <Valor
          label="Hora de cierre"
          sub="La app te recuerda cuadrar caja"
          valor={horaCierre}
          onCambio={(v) => void guardarAjuste(CLAVE_HORA_CIERRE, v)}
          tipo="time"
        />
        <Valor
          label="Stock de siempre"
          sub="Lo que sueles cargar, si no hay historial todavía"
          valor={stockDefecto}
          onCambio={(v) => void guardarAjuste(CLAVE_STOCK_DEFECTO, v)}
          tipo="number"
        />

        <Interruptor
          label="Dictar con el teclado"
          sub="Abre el cuadro de escribir y usas el micrófono de tu teclado. Es gratis y no gasta la cuota de Gemini."
          activo={modoTeclado}
          onCambio={(v) => void guardarAjuste(CLAVE_MODO_TECLADO, v ? "1" : "0")}
        />
        <Interruptor
          label="Redondear hacia abajo"
          sub="Sugiere cobrar a los .50 más cercanos. El cálculo exacto siempre queda guardado."
          activo={redondeo}
          onCambio={(v) => void guardarAjuste(CLAVE_REDONDEO, v ? "1" : "0")}
        />
        <Interruptor
          label="Aviso con sonido y vibración"
          sub="Para no mirar la pantalla al manejar"
          activo={sonido}
          onCambio={(v) => void guardarAjuste(CLAVE_SONIDO, v ? "1" : "0")}
        />

        <div
          style={{
            ...S.tarjeta,
            borderRadius: 12,
            padding: 16,
            fontSize: 14,
            color: "var(--texto-3)",
            lineHeight: 1.6,
          }}
        >
          <div style={{ ...S.rotulo, marginBottom: 8 }}>Tu directorio</div>
          {tiendas === 0
            ? "Todavía no hay tiendas. Se crean solas la primera vez que nombras a alguien al dictar."
            : `${tiendas} ${tiendas === 1 ? "tienda aprendida" : "tiendas aprendidas"} desde tus dictados. Cada entrega que confirmas afina su hora y su parada en la ruta.`}
        </div>
      </div>
    </div>
  );
}

const campo: React.CSSProperties = {
  flex: 1,
  width: "100%",
  height: 52,
  borderRadius: "var(--radio)",
  border: "1.5px solid var(--borde)",
  background: "var(--hundido)",
  padding: "0 14px",
  fontSize: 16,
  minWidth: 0,
};

function Interruptor({
  label,
  sub,
  activo,
  onCambio,
}: {
  label: string;
  sub: string;
  activo: boolean;
  onCambio: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onCambio(!activo)}
      role="switch"
      aria-checked={activo}
      className="pulsable"
      style={{
        ...S.tarjeta,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 14, color: "var(--texto-3)", marginTop: 3, lineHeight: 1.45 }}>
          {sub}
        </div>
      </div>
      <div
        style={{
          width: 56,
          height: 32,
          borderRadius: 99,
          padding: 3,
          flex: "none",
          display: "flex",
          background: activo ? "var(--acento-700)" : "var(--borde)",
          justifyContent: activo ? "flex-end" : "flex-start",
          transition: "background-color 140ms",
        }}
      >
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--texto)" }} />
      </div>
    </button>
  );
}

function Valor({
  label,
  sub,
  valor,
  onCambio,
  tipo,
}: {
  label: string;
  sub: string;
  valor: string;
  onCambio: (v: string) => void;
  tipo: string;
}) {
  return (
    <div
      style={{
        ...S.tarjeta,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 14, color: "var(--texto-3)", marginTop: 3 }}>{sub}</div>
      </div>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        style={{
          flex: "none",
          width: 108,
          height: 48,
          textAlign: "center",
          borderRadius: "var(--radio-sm)",
          border: "1.5px solid var(--borde)",
          background: "var(--hundido)",
          fontSize: 17,
          fontWeight: 600,
          color: "var(--acento-claro)",
        }}
      />
    </div>
  );
}
