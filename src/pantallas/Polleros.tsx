import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDownToLine, ArrowUpFromLine, Trash2, Truck } from "lucide-react";
import type { MovimientoPollero } from "../db/db";
import {
  abonarMovimientoPollero,
  borrarMovimientoPollero,
  borrarPollero,
  crearPollero,
  movimientosDePollero,
  registrarMovimientoPollero,
  saldosPorPollero,
  todosLosPolleros,
} from "../db/polleros";
import { aCentimos, money } from "../lib/dinero";
import { diaCorto, hoyISO } from "../lib/fecha";
import { avisoAtencion, avisoGuardado } from "../lib/aviso";
import { Cabecera, Insignia, S, Segmentado, Vacio } from "../ui/base";

/**
 * Compras y ventas con otros repartidores — no con clientes.
 *
 * A veces falta mercadería y se le compra a un colega; a veces sobra y se le
 * vende. Vive aparte de Tiendas/Cobranza a propósito: el dinero y el stock se
 * mueven distinto (ver `db/polleros.ts` y `resumenDe` en `db/jornada.ts`), y
 * son pocos — se dan de alta a mano, sin el emparejador de nombre+hora+ruta
 * de §6, que no tiene sentido para dos o tres colegas conocidos de memoria.
 *
 * Mismo patrón de interacción que Tiendas.tsx: una tarjeta por pollero que se
 * expande al tocarla, en vez de una pantalla de detalle aparte — no hace
 * falta otra entrada en `navegacion.ts` ni cablear el botón atrás para esto.
 */
export function Polleros({ volver }: { volver: () => void }) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [borrando, setBorrando] = useState<number | null>(null);
  const [avisoNoBorra, setAvisoNoBorra] = useState<number | null>(null);

  useEffect(() => {
    if (borrando === null) return;
    const id = setTimeout(() => setBorrando(null), 8000);
    return () => clearTimeout(id);
  }, [borrando]);

  useEffect(() => {
    if (avisoNoBorra === null) return;
    const id = setTimeout(() => setAvisoNoBorra(null), 6000);
    return () => clearTimeout(id);
  }, [avisoNoBorra]);

  const datos = useLiveQuery(async () => {
    const [polleros, saldos] = await Promise.all([todosLosPolleros(), saldosPorPollero()]);
    return { polleros, saldos };
  }, []);

  if (!datos) return null;
  const { polleros, saldos } = datos;
  const lista = [...polleros].sort((a, b) => b.ultimaVez - a.ultimaVez);

  const crear = () => {
    const nombre = nombreNuevo.trim();
    if (!nombre) return;
    void crearPollero(nombre).then((p) => {
      avisoGuardado();
      setNombreNuevo("");
      setAgregando(false);
      setAbierto(p.id!);
    });
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Cabecera
        titulo="Polleros"
        sub="Compras y ventas con otros repartidores"
        volver={volver}
        derecha={
          <button
            aria-label="Nuevo pollero"
            onClick={() => setAgregando((v) => !v)}
            className="toque"
            style={{
              flex: "none",
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "var(--hundido)",
              color: "var(--texto-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            +
          </button>
        }
      />

      {agregando && (
        <div style={{ flex: "none", padding: "0 20px 14px" }}>
          <div style={{ ...S.tarjeta, padding: 14, display: "flex", gap: 8 }}>
            <input
              autoFocus
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && crear()}
              placeholder="Nombre del pollero"
              style={{
                flex: 1,
                minWidth: 0,
                height: 52,
                borderRadius: "var(--radio)",
                border: "none",
                background: "var(--hundido)",
                padding: "0 14px",
                fontSize: 17,
              }}
            />
            <button
              onClick={crear}
              className="toque"
              disabled={!nombreNuevo.trim()}
              style={{
                flex: "none",
                width: 88,
                height: 52,
                borderRadius: "var(--radio)",
                background: "var(--acento-900)",
                color: "var(--acento-300)",
                fontSize: 16,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: nombreNuevo.trim() ? 1 : 0.45,
              }}
            >
              Crear
            </button>
          </div>
        </div>
      )}

      <div
        className="scroll"
        style={{
          flex: 1,
          padding: "4px 18px calc(40px + var(--seguro-abajo))",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {lista.length === 0 && (
          <Vacio
            titulo="Todavía no tienes polleros"
            sub="Agrega aquí a los colegas repartidores a los que a veces les compras lo que te falta, o les vendes lo que te sobra."
          />
        )}

        {lista.map((p) => {
          const saldo = saldos.get(p.id!) ?? { leDebo: 0, meDebe: 0 };
          const alDia = saldo.leDebo <= 0 && saldo.meDebe <= 0;
          const expandido = abierto === p.id;

          return (
            <div key={p.id} style={{ ...S.tarjeta, padding: "14px 16px" }}>
              <button
                onClick={() => {
                  setAbierto(expandido ? null : p.id!);
                  setBorrando(null);
                  setAvisoNoBorra(null);
                }}
                style={{ width: "100%" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 600, textAlign: "left" }}>{p.nombre}</div>
                  {alDia ? (
                    <Insignia texto="Al día" color="var(--verde)" />
                  ) : saldo.leDebo > saldo.meDebe ? (
                    <Insignia texto={`Le debes ${money(saldo.leDebo)}`} color="var(--rojo)" />
                  ) : (
                    <Insignia texto={`Te debe ${money(saldo.meDebe)}`} color="var(--verde)" />
                  )}
                </div>
              </button>

              {expandido && (
                <PanelPollero
                  polleroId={p.id!}
                  nombre={p.nombre}
                  borrando={borrando === p.id}
                  avisoNoBorra={avisoNoBorra === p.id}
                  onPedirBorrar={() => setBorrando(p.id!)}
                  onCancelarBorrar={() => setBorrando(null)}
                  onBorrar={() => {
                    void borrarPollero(p.id!).then((r) => {
                      setBorrando(null);
                      if (!r.ok) {
                        avisoAtencion();
                        setAvisoNoBorra(p.id!);
                        return;
                      }
                      avisoGuardado();
                      setAbierto(null);
                    });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** El panel que se abre al tocar un pollero: saldo, movimientos y el formulario. */
function PanelPollero({
  polleroId,
  nombre,
  borrando,
  avisoNoBorra,
  onPedirBorrar,
  onCancelarBorrar,
  onBorrar,
}: {
  polleroId: number;
  nombre: string;
  borrando: boolean;
  avisoNoBorra: boolean;
  onPedirBorrar: () => void;
  onCancelarBorrar: () => void;
  onBorrar: () => void;
}) {
  const [registrando, setRegistrando] = useState(false);

  const movimientos = useLiveQuery(() => movimientosDePollero(polleroId), [polleroId]) ?? [];

  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 14,
        borderTop: "1px solid var(--linea)",
        animation: "dphoja .22s var(--resorte)",
      }}
    >
      {!registrando && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button
            onClick={() => setRegistrando(true)}
            className="toque"
            data-tipo="compra"
            style={{
              flex: 1,
              height: 52,
              borderRadius: "var(--radio)",
              background: "var(--acento-900)",
              color: "var(--acento-300)",
              fontSize: 15,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <ArrowDownToLine size={17} strokeWidth={2.4} />
            Comprarle
          </button>
          <button
            onClick={() => setRegistrando(true)}
            className="toque"
            style={{
              flex: 1,
              height: 52,
              borderRadius: "var(--radio)",
              background: "var(--hundido)",
              color: "var(--texto-2)",
              fontSize: 15,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <ArrowUpFromLine size={17} strokeWidth={2.4} />
            Venderle
          </button>
        </div>
      )}

      {registrando && (
        <FormularioMovimiento
          polleroId={polleroId}
          onListo={() => setRegistrando(false)}
          onCancelar={() => setRegistrando(false)}
        />
      )}

      {movimientos.length === 0 ? (
        <div style={{ fontSize: 14, color: "var(--texto-4)", textAlign: "center", padding: "10px 0" }}>
          Todavía no hay movimientos con {nombre}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {movimientos.map((m) => (
            <FilaMovimiento key={m.id} movimiento={m} />
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--linea)" }}>
        {avisoNoBorra ? (
          <div style={{ fontSize: 13, color: "var(--rojo)", textAlign: "center", padding: "6px 0" }}>
            Todavía tiene saldo pendiente — liquídalo antes de borrarlo.
          </div>
        ) : borrando ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, fontSize: 14, color: "var(--rojo)" }}>
              ¿Borrar a {nombre}? No se puede deshacer.
            </div>
            <button
              onClick={onBorrar}
              className="toque"
              style={{
                flex: "none",
                height: 42,
                padding: "0 16px",
                borderRadius: "var(--radio)",
                background: "var(--rojo)",
                color: "#fff7ec",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Sí, borrar
            </button>
            <button
              onClick={onCancelarBorrar}
              style={{ flex: "none", height: 42, padding: "0 10px", color: "var(--texto-3)", fontSize: 14 }}
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={onPedirBorrar}
            style={{
              height: 44,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              color: "var(--texto-4)",
              fontSize: 14,
            }}
          >
            <Trash2 size={16} /> Borrar pollero
          </button>
        )}
      </div>
    </div>
  );
}

/** Una compra o venta ya registrada, con su botón de abonar si quedó fiada. */
function FilaMovimiento({ movimiento: m }: { movimiento: MovimientoPollero }) {
  const [abonando, setAbonando] = useState(false);
  const [monto, setMonto] = useState("");
  const falta = m.total - m.pagado;
  const descripcion = [
    m.pollos ? `${m.pollos} pollos` : "",
    m.piernas ? `${m.piernas} piernas` : "",
    m.pechos ? `${m.pechos} pechos` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ background: "var(--hundido)", borderRadius: "var(--radio)", padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Insignia
            texto={m.tipo === "compra" ? "Compra" : "Venta"}
            color={m.tipo === "compra" ? "var(--ambar)" : "var(--verde)"}
          />
          <span style={{ fontSize: 13, color: "var(--texto-4)" }}>{diaCorto(m.fecha)}</span>
        </div>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{money(m.total)}</span>
      </div>
      {descripcion && (
        <div style={{ fontSize: 14, color: "var(--texto-3)", marginTop: 4 }}>{descripcion}</div>
      )}
      {m.notas && <div style={{ fontSize: 13, color: "var(--texto-4)", marginTop: 2 }}>{m.notas}</div>}

      {falta > 0 && (
        <div style={{ marginTop: 8 }}>
          {abonando ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                autoFocus
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                inputMode="decimal"
                placeholder={`Hasta ${(falta / 100).toFixed(2)}`}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 44,
                  borderRadius: "var(--radio-sm)",
                  border: "1.5px solid var(--borde)",
                  background: "var(--superficie)",
                  padding: "0 12px",
                  fontSize: 16,
                }}
              />
              <button
                className="toque"
                disabled={!Number(monto.replace(",", "."))}
                onClick={() => {
                  const n = Number(monto.replace(",", "."));
                  if (!Number.isFinite(n) || n <= 0) return;
                  void abonarMovimientoPollero(m.id!, aCentimos(n), hoyISO()).then(() => {
                    avisoGuardado();
                    setAbonando(false);
                    setMonto("");
                  });
                }}
                style={{
                  flex: "none",
                  width: 80,
                  height: 44,
                  borderRadius: "var(--radio-sm)",
                  background: "var(--acento-900)",
                  color: "var(--acento-300)",
                  fontSize: 14,
                  fontWeight: 700,
                  opacity: Number(monto.replace(",", ".")) ? 1 : 0.45,
                }}
              >
                Abonar
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--ambar)" }}>Falta {money(falta)}</span>
              <button
                onClick={() => setAbonando(true)}
                className="toque"
                style={{
                  height: 36,
                  padding: "0 14px",
                  borderRadius: "var(--radio-pill)",
                  background: "var(--acento-900)",
                  color: "var(--acento-300)",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Abonar
              </button>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => void borrarMovimientoPollero(m.id!).then(() => avisoGuardado())}
        aria-label="Borrar movimiento"
        style={{
          marginTop: 8,
          color: "var(--texto-5)",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <Trash2 size={13} /> Borrar
      </button>
    </div>
  );
}

/** El formulario para registrar una compra o venta nueva. */
function FormularioMovimiento({
  polleroId,
  onListo,
  onCancelar,
}: {
  polleroId: number;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [tipo, setTipo] = useState<"compra" | "venta">("compra");
  const [pollos, setPollos] = useState("");
  const [piernas, setPiernas] = useState("");
  const [pechos, setPechos] = useState("");
  const [total, setTotal] = useState("");
  const [pagado, setPagado] = useState("");
  const [notas, setNotas] = useState("");

  const totalNum = Number(total.replace(",", "."));
  const listo = Number.isFinite(totalNum) && totalNum > 0;

  const campo: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    height: 50,
    borderRadius: "var(--radio-sm)",
    border: "none",
    background: "var(--superficie)",
    padding: "0 10px",
    fontSize: 16,
    textAlign: "center",
  };

  const registrar = () => {
    if (!listo) return;
    const pagadoNum = Number(pagado.replace(",", "."));
    void registrarMovimientoPollero(
      {
        polleroId,
        tipo,
        pollos: Number(pollos) || 0,
        piernas: Number(piernas) || 0,
        pechos: Number(pechos) || 0,
        total: aCentimos(totalNum),
        pagado: Number.isFinite(pagadoNum) && pagadoNum > 0 ? aCentimos(pagadoNum) : 0,
        notas: notas.trim(),
      },
      hoyISO(),
    ).then(() => {
      avisoGuardado();
      onListo();
    });
  };

  return (
    <div
      style={{
        background: "var(--hundido)",
        borderRadius: "var(--radio)",
        padding: 14,
        marginBottom: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        animation: "dphoja .2s var(--resorte)",
      }}
    >
      <Segmentado
        opciones={[
          { valor: "compra", etiqueta: "Le compro" },
          { valor: "venta", etiqueta: "Le vendo" },
        ]}
        valor={tipo}
        onCambio={setTipo}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <input value={pollos} onChange={(e) => setPollos(e.target.value)} inputMode="numeric" placeholder="Pollos" style={campo} />
        <input value={piernas} onChange={(e) => setPiernas(e.target.value)} inputMode="numeric" placeholder="Piernas" style={campo} />
        <input value={pechos} onChange={(e) => setPechos(e.target.value)} inputMode="numeric" placeholder="Pechos" style={campo} />
      </div>

      <div style={{ display: "flex", gap: 8, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...S.rotulo, fontSize: 11, marginBottom: 5 }}>Total acordado</div>
          <input
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            inputMode="decimal"
            placeholder="S/ 0.00"
            style={{ ...campo, textAlign: "left", padding: "0 12px", fontWeight: 700, fontSize: 18 }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              ...S.rotulo,
              fontSize: 11,
              marginBottom: 5,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {tipo === "compra" ? "Le diste ahora" : "Te dio ahora"}
          </div>
          <div style={{ display: "flex", gap: 6, minWidth: 0 }}>
            <input
              value={pagado}
              onChange={(e) => setPagado(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              style={{ ...campo, minWidth: 0, textAlign: "left", padding: "0 10px", fontSize: 16 }}
            />
            <button
              onClick={() => setPagado(total)}
              disabled={!listo}
              className="toque"
              style={{
                flex: "none",
                width: 44,
                height: 50,
                borderRadius: "var(--radio-sm)",
                background: "var(--acento-900)",
                color: "var(--acento-300)",
                fontSize: 11,
                fontWeight: 700,
                opacity: listo ? 1 : 0.4,
              }}
            >
              Todo
            </button>
          </div>
        </div>
      </div>

      <input
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Una nota (opcional)"
        style={{ ...campo, textAlign: "left", padding: "0 12px" }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        <button
          onClick={onCancelar}
          className="toque"
          style={{
            flex: 1,
            height: 50,
            borderRadius: "var(--radio)",
            background: "var(--superficie)",
            color: "var(--texto-2)",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          Cancelar
        </button>
        <button
          onClick={registrar}
          disabled={!listo}
          className="toque"
          style={{
            flex: 1.4,
            height: 50,
            borderRadius: "var(--radio)",
            background: "var(--acento-claro)",
            color: "#fff7ec",
            fontSize: 16,
            fontWeight: 700,
            opacity: listo ? 1 : 0.45,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Truck size={17} strokeWidth={2.4} />
          Registrar
        </button>
      </div>
    </div>
  );
}
