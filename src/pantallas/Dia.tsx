import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { leerJornada, resumenDe } from "../db/jornada";
import { COLOR_ESTADO, estadoDe, TEXTO_ESTADO } from "../dominio/calculo";
import { kg, money } from "../lib/dinero";
import { diaCorto, diaLargo, type DiaISO } from "../lib/fecha";
import { Cabecera, Fila, S } from "../ui/base";

/** Un día cerrado, entrega por entrega. Para cuando alguien discute una cuenta. */
export function Dia({ fecha, volver }: { fecha: DiaISO; volver: () => void }) {
  const datos = useLiveQuery(async () => {
    const [jornada, resumen, entregas, tiendas, deudas] = await Promise.all([
      leerJornada(fecha),
      resumenDe(fecha),
      db.entregas.where("fecha").equals(fecha).toArray(),
      db.tiendas.toArray(),
      db.deudas.where("fechaOrigen").equals(fecha).toArray(),
    ]);
    return {
      jornada,
      resumen,
      entregas: entregas.sort((a, b) => a.orden - b.orden),
      porId: new Map(tiendas.map((t) => [t.id!, t])),
      traspasada: deudas.reduce((a, d) => a + d.monto, 0),
      // De las entregas, no del resumen: con el día cerrado el resumen ya no
      // cuenta ese saldo (vive como deuda), y aquí queremos la verdad de ese
      // día — decir «todo cobrado» cuando alguien quedó debiendo es mentir.
      quedoDebiendo: entregas.reduce(
        (a, e) => a + Math.max(0, e.totalCalculado - e.totalCobrado - e.descuentoRedondeo),
        0,
      ),
    };
  }, [fecha]);

  if (!datos) return null;
  const { jornada, resumen, entregas, porId, traspasada, quedoDebiendo } = datos;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Cabecera
        titulo={diaCorto(fecha)}
        sub={`${diaLargo(fecha)} · jornada ${jornada.estado}`}
        volver={volver}
      />

      <div
        className="scroll"
        style={{
          flex: 1,
          padding: "0 18px calc(40px + var(--seguro-abajo))",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          <Ficha
            rotulo="Repartido"
            valor={`${resumen.repartidoPollos} pollos`}
            pie={`de ${resumen.stockPollos} · sobraron ${Math.max(0, resumen.restantePollos)}`}
          />
          <Ficha
            rotulo="Cobrado"
            valor={money(resumen.cobrado)}
            valorColor="var(--verde)"
            pie={quedoDebiendo > 0 ? `quedó ${money(quedoDebiendo)}` : "todo cobrado"}
            pieColor={quedoDebiendo > 0 ? "var(--rojo)" : "var(--texto-4)"}
          />
        </div>

        <div style={{ ...S.rotulo, fontSize: 13, padding: "6px 4px 0" }}>Entregas de ese día</div>

        {entregas.map((e) => {
          const cobrado = e.totalCobrado + e.descuentoRedondeo;
          const estado = estadoDe(e.totalCalculado, cobrado);
          const saldo = e.totalCalculado - cobrado;

          return (
            <div key={e.id} style={{ ...S.tarjeta, padding: "15px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    flex: "none",
                    background: COLOR_ESTADO[estado],
                  }}
                />
                <div style={{ flex: 1, fontSize: 18, fontWeight: 600, minWidth: 0 }}>
                  {porId.get(e.tiendaId)?.nombre ?? "Sin nombre"}
                </div>
                <div style={{ fontSize: 13, color: COLOR_ESTADO[estado], flex: "none" }}>
                  {TEXTO_ESTADO[estado]}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px 0",
                  borderTop: "1px solid var(--linea)",
                  paddingTop: 11,
                }}
              >
                <Dato
                  rotulo="Cantidad"
                  valor={
                    [
                      e.pollos && `${e.pollos} pollos`,
                      e.pechos && `${e.pechos} pechos`,
                      e.piernas && `${e.piernas} piernas`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"
                  }
                />
                <Dato rotulo="Peso" valor={e.peso > 0 ? kg(e.peso) : "sin pesar"} />
                <Dato
                  rotulo="Por kilo"
                  valor={e.precioKg ? `S/ ${(e.precioKg / 100).toFixed(2)}` : "—"}
                />
                <Dato rotulo="Total" valor={money(e.totalCalculado)} />
                <Dato rotulo="Cobrado" valor={money(e.totalCobrado)} color="var(--verde)" />
                <Dato
                  rotulo="Quedó debiendo"
                  valor={saldo > 0 ? money(saldo) : "—"}
                  color={saldo > 0 ? "var(--rojo)" : "var(--texto-4)"}
                />
              </div>

              {e.tandas.length > 1 && (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--texto-4)",
                    marginTop: 11,
                    paddingTop: 10,
                    borderTop: "1px solid var(--linea)",
                  }}
                >
                  Tandas: {e.tandas.map((t) => kg(t)).join(" + ")}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ ...S.tarjeta, padding: 16 }}>
          <div style={{ ...S.rotulo, marginBottom: 12 }}>Cierre de ese día</div>
          <Fila
            label="Caja contada"
            valor={jornada.cajaContada === null ? "—" : money(jornada.cajaContada)}
          />
          <Fila
            label="¿Cuadró?"
            valor={jornada.cuadro === null ? "—" : jornada.cuadro ? "Sí" : "No"}
            color={jornada.cuadro === 0 ? "var(--rojo)" : "var(--texto)"}
          />
          <Fila label="Regalado en redondeos" valor={money(resumen.descuentos)} />
          <Fila label="Deuda que pasó a hoy" valor={money(traspasada)} color="var(--ambar)" />
        </div>
      </div>
    </div>
  );
}

function Ficha({
  rotulo,
  valor,
  pie,
  valorColor,
  pieColor,
}: {
  rotulo: string;
  valor: string;
  pie: string;
  valorColor?: string;
  pieColor?: string;
}) {
  return (
    <div style={{ ...S.tarjeta, flex: 1, borderRadius: 12, padding: "13px 14px", minWidth: 0 }}>
      <div style={{ ...S.rotulo, fontSize: 11, letterSpacing: 0.9, marginBottom: 4 }}>
        {rotulo}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: valorColor }}>{valor}</div>
      <div style={{ fontSize: 13, color: pieColor ?? "var(--texto-4)", marginTop: 2 }}>{pie}</div>
    </div>
  );
}

function Dato({ rotulo, valor, color }: { rotulo: string; valor: string; color?: string }) {
  return (
    <div style={{ flex: "1 0 33%", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "var(--texto-4)", marginBottom: 2 }}>{rotulo}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color }}>{valor}</div>
    </div>
  );
}
