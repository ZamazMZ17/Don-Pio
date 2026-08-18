import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { db } from "../db/db";
import { generarRespaldo, restaurarRespaldo } from "../db/respaldo";
import {
  CLAVE_API,
  CLAVE_HORA_CIERRE,
  CLAVE_MODELO,
  CLAVE_MODO_TECLADO,
  CLAVE_REDONDEO,
  CLAVE_SONIDO,
  CLAVE_STOCK_DEFECTO,
  CLAVE_TEMA,
  MODELO_POR_DEFECTO,
  guardarAjuste,
} from "../voz/ajustes";
import { useAjuste, useAjusteBool, type Tema } from "../lib/ganchos";
import { hoyISO } from "../lib/fecha";
import { avisoAtencion, avisoGuardado } from "../lib/aviso";
import { esNativo } from "../lib/plataforma";
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
  const tema = useAjuste(CLAVE_TEMA, "oscuro") as Tema;

  const tiendas = useLiveQuery(() => db.tiendas.count(), []) ?? 0;
  const [verKey, setVerKey] = useState(false);

  const [compartiendo, setCompartiendo] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [mensajeRespaldo, setMensajeRespaldo] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement | null>(null);

  /**
   * Nunca lleva la API key (CLAUDE.md §3): un respaldo viaja por WhatsApp o
   * correo, que no es "hacia el proveedor". Se comparte como archivo, no como
   * texto pegado, para que llegue entero por cualquier app y no se corte.
   */
  const compartirRespaldo = async () => {
    setCompartiendo(true);
    setMensajeRespaldo(null);
    try {
      const json = JSON.stringify(await generarRespaldo(), null, 2);
      const nombre = `don-pio-respaldo-${hoyISO()}.json`;

      if (esNativo) {
        const { uri } = await Filesystem.writeFile({
          path: nombre,
          data: json,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        await Share.share({
          title: "Respaldo de Don Pio",
          dialogTitle: "Compartir respaldo",
          url: uri,
        });
      } else {
        // En el navegador de desarrollo no hay hoja de compartir: se descarga.
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      avisoAtencion();
      setMensajeRespaldo("No se pudo armar el respaldo.");
    } finally {
      setCompartiendo(false);
    }
  };

  const onArchivoElegido = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    // Para poder elegir el mismo archivo dos veces seguidas si algo falla.
    ev.target.value = "";
    if (!archivo) return;

    setRestaurando(true);
    setMensajeRespaldo(null);
    try {
      const datos = JSON.parse(await archivo.text());
      await restaurarRespaldo(datos);
      avisoGuardado();
      setMensajeRespaldo("Listo, se restauró el respaldo.");
    } catch (e) {
      avisoAtencion();
      setMensajeRespaldo(
        e instanceof Error ? e.message : "Ese archivo no se pudo leer como respaldo.",
      );
    } finally {
      setRestaurando(false);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Cabecera titulo="Ajustes" volver={volver} />

      <div
        className="scroll"
        style={{
          flex: 1,
          padding: "0 18px calc(40px + var(--seguro-abajo))",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* Apariencia */}
        <div style={{ ...S.tarjeta, borderRadius: 12, padding: 16 }}>
          <div style={{ ...S.rotulo, marginBottom: 12 }}>Apariencia</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(
              [
                ["oscuro", "Oscuro"],
                ["claro", "Claro"],
                ["sistema", "Sistema"],
              ] as const
            ).map(([valor, label]) => (
              <button
                key={valor}
                onClick={() => void guardarAjuste(CLAVE_TEMA, valor)}
                className="pulsable"
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: "var(--radio)",
                  border: `1.5px solid ${tema === valor ? "var(--acento)" : "var(--borde)"}`,
                  background: tema === valor ? "var(--acento-900)" : "transparent",
                  color: tema === valor ? "var(--acento-300)" : "var(--texto-2)",
                  fontSize: 15,
                  fontWeight: tema === valor ? 600 : 400,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: "var(--texto-4)", marginTop: 10, lineHeight: 1.5 }}>
            {tema === "sistema"
              ? "Sigue el tema que tenga puesto el teléfono."
              : "La app arranca así siempre, sin importar el tema del teléfono."}
          </div>
        </div>

        {/* La IA */}
        <div style={{ ...S.tarjeta, borderRadius: 12, padding: 16 }}>
          <div style={{ ...S.rotulo, marginBottom: 4 }}>Gemini</div>
          <div
            style={{ fontSize: 14, color: "var(--texto-3)", marginBottom: 12, lineHeight: 1.5 }}
          >
            Tu API key se guarda solo en este teléfono. Se usa para los informes —el resumen al
            cerrar el día y el de la semana—, no para dictar: el dictado se entiende aquí mismo,
            sin internet.
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

        <div style={{ ...S.tarjeta, borderRadius: 12, padding: 16 }}>
          <div style={{ ...S.rotulo, marginBottom: 4 }}>Respaldo</div>
          <div
            style={{ fontSize: 14, color: "var(--texto-3)", marginBottom: 12, lineHeight: 1.5 }}
          >
            Para pasar tus tiendas, entregas y deudas a otro teléfono, o para tener una copia por
            las dudas. Nunca incluye tu API key.
          </div>

          <button
            onClick={() => void compartirRespaldo()}
            disabled={compartiendo}
            className="pulsable"
            style={{ ...botonRespaldo, marginBottom: 10, opacity: compartiendo ? 0.6 : 1 }}
          >
            {compartiendo ? "Armando…" : "Compartir respaldo"}
          </button>

          <button
            onClick={() => archivoRef.current?.click()}
            disabled={restaurando}
            className="pulsable"
            style={{ ...botonRespaldo, opacity: restaurando ? 0.6 : 1 }}
          >
            {restaurando ? "Restaurando…" : "Restaurar desde un archivo"}
          </button>
          <input
            ref={archivoRef}
            type="file"
            accept="application/json,.json"
            onChange={(ev) => void onArchivoElegido(ev)}
            style={{ display: "none" }}
          />

          {mensajeRespaldo && (
            <div style={{ fontSize: 13, color: "var(--texto-3)", marginTop: 10, lineHeight: 1.5 }}>
              {mensajeRespaldo}
            </div>
          )}
        </div>

        {/*
          Actualizar la app. El APK se publica siempre en el mismo sitio, así
          que aquí basta con enseñar qué versión tiene puesta y llevarlo a la
          página de descarga: la app no puede instalarse sola sin permisos que
          no vale la pena pedir.
        */}
        <div style={{ ...S.tarjeta, borderRadius: 12, padding: 16 }}>
          <div style={{ ...S.rotulo, marginBottom: 4 }}>Actualización</div>
          <div
            style={{ fontSize: 14, color: "var(--texto-3)", marginBottom: 4, lineHeight: 1.5 }}
          >
            Tienes puesta la versión
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>{__VERSION_APP__}</div>
          <div
            style={{ fontSize: 14, color: "var(--texto-3)", marginBottom: 12, lineHeight: 1.5 }}
          >
            Abre la página de descarga: si la de ahí es más nueva que esta, bájala e instálala
            encima. No se pierde nada de lo que tienes registrado.
          </div>
          <button
            onClick={() => window.open(URL_DESCARGA, "_blank", "noopener")}
            className="pulsable"
            style={botonRespaldo}
          >
            Buscar actualización
          </button>
        </div>
      </div>
    </div>
  );
}

/** Donde se publica siempre el último APK. */
const URL_DESCARGA = "https://github.com/ZamazMZ17/Don-Pio/releases/tag/apk-latest";

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

const botonRespaldo: React.CSSProperties = {
  height: 52,
  width: "100%",
  borderRadius: "var(--radio)",
  border: "1.5px solid var(--borde)",
  color: "var(--texto-2)",
  fontSize: 15,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
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
          // 108 se quedaba corto para "07:30 PM" — el reloj nativo del
          // navegador le comía la "M" al ícono del reloj.
          width: 124,
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
