import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, X } from "lucide-react";
import { db } from "../db/db";
import { leerJornada, resumenDe } from "../db/jornada";
import { COLOR_ESTADO, estadoDe, TEXTO_ESTADO } from "../dominio/calculo";
import { aCobrar, kg, money } from "../lib/dinero";
import { diaCorto, diaLargo, type DiaISO } from "../lib/fecha";
import { normalizar, parecido } from "../tiendas/normalizar";
import { Cabecera, Fila, S, Vacio } from "../ui/base";

/** Un día cerrado, entrega por entrega. Para cuando alguien discute una cuenta. */
export function Dia({ fecha, volver }: { fecha: DiaISO; volver: () => void }) {
  /** El texto del buscador. Con muchas tiendas en un día, encontrar una en
   *  concreto a mano es lento; escribir dos letras la trae de una. */
  const [busca, setBusca] = useState("");

  const datos = useLiveQuery(async () => {
    const [jornada, resumen, entregas, tiendas, deudas, pagos, gastosDb] = await Promise.all([
      leerJornada(fecha),
      resumenDe(fecha),
      db.entregas.where("fecha").equals(fecha).toArray(),
      db.tiendas.toArray(),
      db.deudas.where("fechaOrigen").equals(fecha).toArray(),
      db.pagos.where("fecha").equals(fecha).toArray(),
      db.gastos.where("fecha").equals(fecha).toArray(),
    ]);

    const cobrosDeuda = pagos.filter((p) => p.tipo === "deudaAnterior");
    const totalCobradoDeuda = cobrosDeuda.reduce((a, p) => a + p.monto, 0);

    const deudaPorTienda = new Map<number, number>();
    for (const p of cobrosDeuda) {
      deudaPorTienda.set(p.tiendaId, (deudaPorTienda.get(p.tiendaId) ?? 0) + p.monto);
    }

    /*
     * Con qué deuda llegó cada tienda a este día — para cuando discute una
     * cuenta, lo que importa no es lo que debe *hoy* (eso ya cambió) sino lo
     * que debía *antes de esta entrega*. Se reconstruye con lo que ya queda
     * fechado: lo que se le sumó como deuda antes de este día (`fechaOrigen`
     * < fecha) menos lo que ya había abonado a esa deuda antes de este día
     * (`pagos` de tipo "deudaAnterior" con `fecha` < esta). No usa el
     * `saldado`/`cerrada` de ahora mismo porque esos reflejan el estado
     * actual, no el de aquel día.
     */
    const idsTiendasDelDia = new Set<number>([
      ...entregas.map((e) => e.tiendaId),
      ...pagos.map((p) => p.tiendaId),
    ]);
    const [todasSusDeudas, todosSusPagos] =
      idsTiendasDelDia.size > 0
        ? await Promise.all([
            db.deudas.where("tiendaId").anyOf([...idsTiendasDelDia]).toArray(),
            db.pagos.where("tiendaId").anyOf([...idsTiendasDelDia]).toArray(),
          ])
        : [[], []];
    const deudaAntesPorTienda = new Map<number, number>();
    for (const id of idsTiendasDelDia) {
      const acumulada = todasSusDeudas
        .filter((d) => d.tiendaId === id && d.fechaOrigen < fecha)
        .reduce((a, d) => a + d.monto, 0);
      const abonadaAntes = todosSusPagos
        .filter((p) => p.tiendaId === id && p.tipo === "deudaAnterior" && p.fecha < fecha)
        .reduce((a, p) => a + p.monto, 0);
      // Redondeado hacia abajo a la moneda, igual que en Cobranza: un
      // residuo de un par de céntimos no es deuda de verdad, es lo que
      // ninguna moneda puede cubrir y ya se dio por perdonado en su momento.
      deudaAntesPorTienda.set(id, aCobrar(Math.max(0, acumulada - abonadaAntes)));
    }

    return {
      jornada,
      resumen,
      entregas: entregas.sort((a, b) => a.orden - b.orden),
      porId: new Map(tiendas.map((t) => [t.id!, t])),
      traspasada: deudas.reduce((a, d) => a + d.monto, 0),
      quedoDebiendo: entregas.reduce(
        (a, e) => a + Math.max(0, e.totalCalculado - e.totalCobrado - e.descuentoRedondeo),
        0,
      ),
      deudaPorTienda,
      deudaAntesPorTienda,
      totalCobradoDeuda,
      gastos: gastosDb.sort((a, b) => a.creada - b.creada),
      totalGastos: gastosDb.reduce((a, g) => a + g.monto, 0),
    };
  }, [fecha]);

  if (!datos) return null;
  const {
    jornada,
    resumen,
    entregas,
    porId,
    traspasada,
    quedoDebiendo,
    deudaPorTienda,
    deudaAntesPorTienda,
    totalCobradoDeuda,
    gastos,
    totalGastos,
  } = datos;

  /*
   * Igual que en Cobranza: el buscador solo aparece cuando la lista es lo
   * bastante larga como para que valga la pena. El umbral se mide sobre las
   * entregas completas, no las filtradas, para que no desaparezca en cuanto
   * se escribe.
   */
  const hayBuscador = entregas.length > 6;
  const q = hayBuscador ? normalizar(busca) : "";
  const coincide = (tiendaId: number) =>
    !q || parecido(q, porId.get(tiendaId)?.nombreNorm ?? "") > 0.55;
  const entregasVisibles = entregas.filter((e) => coincide(e.tiendaId));
  const deudaVisible = [...deudaPorTienda.entries()].filter(([tiendaId]) => coincide(tiendaId));
  const sinCoincidencias = q !== "" && entregasVisibles.length === 0 && deudaVisible.length === 0;

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
            valor={money(resumen.cobrado + totalCobradoDeuda)}
            valorColor="var(--verde)"
            pie={
              [
                quedoDebiendo > 0 ? `quedó ${money(quedoDebiendo)}` : "todo cobrado",
                totalCobradoDeuda > 0 ? `+${money(totalCobradoDeuda)} deuda` : "",
              ]
                .filter(Boolean)
                .join(" · ")
            }
            pieColor={quedoDebiendo > 0 ? "var(--rojo)" : "var(--texto-4)"}
          />
        </div>

        {hayBuscador && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--superficie)",
              borderRadius: "var(--radio)",
              padding: "0 14px",
              height: 50,
            }}
          >
            <Search size={19} color="var(--texto-4)" style={{ flex: "none" }} />
            <input
              value={busca}
              onChange={(ev) => setBusca(ev.target.value)}
              placeholder="Buscar una tienda"
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                fontSize: 17,
                minWidth: 0,
              }}
            />
            {busca && (
              <button
                onClick={() => setBusca("")}
                aria-label="Limpiar búsqueda"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 52,
                  minWidth: 52,
                  margin: "-14px -6px",
                  flex: "none",
                }}
              >
                <X size={18} color="var(--texto-4)" />
              </button>
            )}
          </div>
        )}

        {sinCoincidencias && <Vacio titulo="Ninguna coincide" sub="Prueba con otra forma del nombre." />}

        {entregasVisibles.length > 0 && (
          <div style={{ ...S.rotulo, fontSize: 13, padding: "6px 4px 0" }}>Entregas de ese día</div>
        )}

        {entregasVisibles.map((e) => {
          const cobrado = e.totalCobrado + e.descuentoRedondeo;
          const estado = estadoDe(e.totalCalculado, cobrado);
          const saldo = e.totalCalculado - cobrado;
          const debiaAntes = deudaAntesPorTienda.get(e.tiendaId) ?? 0;
          // Lo que además se abonó a la deuda vieja en el mismo cobro (puede
          // ser la suma de varios abonos ese día): "Cobrado" solo enseña lo
          // que se aplicó a esta entrega, y como la deuda se paga primero
          // (CLAUDE.md §7), un pago que alcanza para las dos cosas se veía
          // acá como si hubiera cobrado de menos.
          const deudaHoy = deudaPorTienda.get(e.tiendaId) ?? 0;

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

              {debiaAntes > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 14,
                    color: "var(--ambar)",
                    marginBottom: 10,
                  }}
                >
                  <span>Debía antes de esta entrega</span>
                  <span>{money(debiaAntes)}</span>
                </div>
              )}

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
                {deudaHoy > 0 && (
                  <Dato rotulo="De deuda anterior" valor={money(deudaHoy)} color="var(--verde)" />
                )}
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

              {(e.descuentoRedondeo > 0 || e.notas) && (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--texto-4)",
                    marginTop: e.tandas.length > 1 ? 6 : 11,
                    paddingTop: e.tandas.length > 1 ? 0 : 10,
                    borderTop: e.tandas.length > 1 ? "none" : "1px solid var(--linea)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {e.descuentoRedondeo > 0 && (
                    <div>Redondeo a favor: {money(e.descuentoRedondeo)}</div>
                  )}
                  {e.notas && <div style={{ fontStyle: "italic" }}>{e.notas}</div>}
                </div>
              )}
            </div>
          );
        })}

        {deudaVisible.length > 0 && (
          <>
            <div style={{ ...S.rotulo, fontSize: 13, padding: "6px 4px 0" }}>
              Cobros de deuda anterior
            </div>
            <div style={{ ...S.tarjeta, padding: 16, display: "flex", flexDirection: "column" }}>
              {deudaVisible.map(([tiendaId, pagado], i) => {
                const antes = deudaAntesPorTienda.get(tiendaId) ?? 0;
                const queda = aCobrar(Math.max(0, antes - pagado));
                return (
                  <div
                    key={tiendaId}
                    style={{
                      paddingTop: i > 0 ? 12 : 0,
                      marginTop: i > 0 ? 12 : 0,
                      borderTop: i > 0 ? "1px solid var(--linea)" : "none",
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                      {porId.get(tiendaId)?.nombre ?? "Sin nombre"}
                    </div>
                    <Fila label="Debía antes" valor={money(antes)} color="var(--ambar)" tam={14} />
                    <Fila label="Pagó" valor={money(pagado)} color="var(--verde)" tam={14} />
                    {queda > 0 && (
                      <Fila label="Le queda debiendo" valor={money(queda)} color="var(--rojo)" tam={14} />
                    )}
                  </div>
                );
              })}
              {/* El total de todas: mientras se busca, mezclaría tiendas que
                  no se están viendo, así que se esconde. */}
              {!q && (
                <div
                  style={{
                    paddingTop: 12,
                    marginTop: 12,
                    borderTop: "1px solid var(--linea)",
                  }}
                >
                  <Fila
                    label="Total cobrado de deuda"
                    valor={money(totalCobradoDeuda)}
                    color="var(--verde)"
                    peso={700}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {gastos.length > 0 && (
          <>
            <div style={{ ...S.rotulo, fontSize: 13, padding: "6px 4px 0" }}>Gastos del día</div>
            <div style={{ ...S.tarjeta, padding: 16 }}>
              {gastos.map((g) => (
                <Fila key={g.id} label={g.concepto} valor={money(g.monto)} color="var(--rojo)" />
              ))}
              <Fila label="Total gastos" valor={money(totalGastos)} color="var(--rojo)" peso={700} />
            </div>
          </>
        )}

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
          {totalGastos > 0 && (
            <Fila label="Gastos del día" valor={money(totalGastos)} color="var(--rojo)" />
          )}
          {totalCobradoDeuda > 0 && (
            <Fila label="Cobrado de deuda anterior" valor={money(totalCobradoDeuda)} color="var(--verde)" />
          )}
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
