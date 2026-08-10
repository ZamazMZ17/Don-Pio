import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2 } from "lucide-react";
import { db } from "../db/db";
import { aCentimos, money } from "../lib/dinero";
import { diaCorto, type DiaISO } from "../lib/fecha";
import { avisoGuardado } from "../lib/aviso";
import { Cabecera, S, Vacio } from "../ui/base";

/**
 * Los gastos del día: almuerzo, gasolina, un antojo.
 *
 * No son plata de un cliente, pero **salen de la misma caja**. Sin apuntarlos,
 * al cuadrar por la noche siempre falta dinero y parece que alguien no pagó.
 */
export function Gastos({ fecha, volver }: { fecha: DiaISO; volver: () => void }) {
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");

  const gastos =
    useLiveQuery(
      async () =>
        (await db.gastos.where("fecha").equals(fecha).toArray()).sort((a, b) => b.creada - a.creada),
      [fecha],
    ) ?? [];

  const total = gastos.reduce((a, g) => a + g.monto, 0);
  const valor = Number(monto.replace(",", "."));
  const listo = Number.isFinite(valor) && valor > 0;

  const agregar = () => {
    if (!listo) return;
    void db.gastos
      .add({
        fecha,
        concepto: concepto.trim() || "Gasto",
        monto: aCentimos(valor),
        creada: Date.now(),
      })
      .then(() => {
        avisoGuardado();
        setConcepto("");
        setMonto("");
      });
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Cabecera titulo="Gastos del día" sub={diaCorto(fecha)} volver={volver} />

      <div
        className="scroll"
        style={{
          flex: 1,
          padding: "0 18px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ ...S.tarjeta, padding: 16 }}>
          <div style={{ ...S.rotulo, marginBottom: 12 }}>Apuntar un gasto</div>
          <input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="En qué (almuerzo, gasolina…)"
            style={{
              width: "100%",
              height: 54,
              borderRadius: "var(--radio)",
              border: "1.5px solid var(--borde)",
              background: "var(--hundido)",
              padding: "0 14px",
              fontSize: 17,
              marginBottom: 10,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregar()}
              inputMode="decimal"
              placeholder="Cuánto"
              style={{
                flex: 1,
                minWidth: 0,
                height: 54,
                borderRadius: "var(--radio)",
                border: "1.5px solid var(--borde)",
                background: "var(--hundido)",
                padding: "0 14px",
                fontSize: 18,
              }}
            />
            <button
              onClick={agregar}
              className="pulsable-acento"
              disabled={!listo}
              style={{
                flex: "none",
                width: 96,
                height: 54,
                borderRadius: "var(--radio)",
                border: "1.5px solid var(--acento)",
                color: "var(--acento-300)",
                fontSize: 16,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: listo ? 1 : 0.45,
              }}
            >
              Agregar
            </button>
          </div>
        </div>

        {gastos.length > 0 && (
          <div style={{ ...S.tarjeta, padding: "16px 16px 8px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span style={{ ...S.rotulo, fontSize: 13 }}>Gastado hoy</span>
              <span style={{ fontSize: 30, fontWeight: 700, color: "var(--ambar)" }}>
                {money(total)}
              </span>
            </div>
            {gastos.map((g) => (
              <div
                key={g.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 0",
                  borderTop: "1px solid var(--linea)",
                }}
              >
                <span style={{ flex: 1, fontSize: 16, minWidth: 0 }}>{g.concepto}</span>
                <span style={{ fontSize: 17, fontWeight: 600, flex: "none" }}>
                  {money(g.monto)}
                </span>
                <button
                  aria-label={`Borrar ${g.concepto}`}
                  onClick={() => void db.gastos.delete(g.id!)}
                  style={{ color: "var(--texto-4)", display: "flex", padding: 6, flex: "none" }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}

        {gastos.length === 0 && (
          <Vacio
            titulo="Sin gastos apuntados hoy"
            sub="Apunta aquí el almuerzo, la gasolina o cualquier cosa que salga de la caja, para que el cuadre de la noche te salga."
          />
        )}
      </div>
    </div>
  );
}
