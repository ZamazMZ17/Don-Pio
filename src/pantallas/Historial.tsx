import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight } from "lucide-react";
import { db } from "../db/db";
import { resumenDe } from "../db/jornada";
import { money } from "../lib/dinero";
import { diaCorto, hoyISO, inicialDia, ultimosDias, type DiaISO } from "../lib/fecha";
import { useAjuste } from "../lib/ganchos";
import { CLAVE_API } from "../voz/ajustes";
import { informeDeLaSemana, type Informe } from "../voz/informes";
import { Cabecera, Fila, S, Vacio } from "../ui/base";

/** Los días cerrados y cómo va la semana. */
export function Historial({ volver, abrirDia }: { volver: () => void; abrirDia: (d: DiaISO) => void }) {
  const apiKey = useAjuste(CLAVE_API);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [generandoInforme, setGenerandoInforme] = useState(false);
  const [errorInforme, setErrorInforme] = useState<string | null>(null);

  // Igual que en Cierre: si ya se generó hoy, se enseña sin gastar otra
  // llamada. La clave lleva la fecha de hoy porque la ventana de 7 días se
  // corre a diario — ver `informes.ts`.
  useEffect(() => {
    void db.informes.get(`semana-${hoyISO()}`).then((g) => {
      if (g) setInforme(g);
    });
  }, []);

  const generarInforme = () => {
    setGenerandoInforme(true);
    setErrorInforme(null);
    void informeDeLaSemana(true)
      .then(setInforme)
      .catch((e) =>
        setErrorInforme(e instanceof Error ? e.message : "No se pudo generar el informe."),
      )
      .finally(() => setGenerandoInforme(false));
  };

  const datos = useLiveQuery(async () => {
    const jornadas = (await db.jornadas.toArray()).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const cerradas = jornadas.filter((j) => j.estado === "cerrada");

    const semana = ultimosDias(hoyISO(), 7);
    const resumenes = await Promise.all(semana.map((d) => resumenDe(d)));
    const [deudas, tiendas] = await Promise.all([db.deudas.toArray(), db.tiendas.toArray()]);

    const dias = await Promise.all(
      cerradas.slice(0, 30).map(async (j) => ({ jornada: j, resumen: await resumenDe(j.fecha) })),
    );

    // No solo entregas: un día puede tener solo un cobro suelto de deuda
    // vieja, o solo un gasto, sin ninguna entrega nueva.
    const hoy = hoyISO();
    const [pagosHoy, gastosHoy] = await Promise.all([
      db.pagos.where("fecha").equals(hoy).count(),
      db.gastos.where("fecha").equals(hoy).count(),
    ]);

    const abiertas = deudas.filter((d) => !d.cerrada);
    const porId = new Map(tiendas.map((t) => [t.id!, t]));
    const montoPorTienda = new Map<number, number>();
    for (const d of abiertas) {
      montoPorTienda.set(d.tiendaId, (montoPorTienda.get(d.tiendaId) ?? 0) + (d.monto - d.saldado));
    }
    const deudasPendientes = [...montoPorTienda.entries()]
      .filter(([, monto]) => monto > 0)
      .map(([tiendaId, monto]) => ({
        tiendaId,
        nombre: porId.get(tiendaId)?.nombre ?? "Sin nombre",
        monto,
      }))
      .sort((a, b) => b.monto - a.monto);

    return {
      semana,
      resumenes,
      dias,
      hayActividadHoy: resumenes[resumenes.length - 1].entregas > 0 || pagosHoy > 0 || gastosHoy > 0,
      deudaAbierta: abiertas.reduce((a, d) => a + (d.monto - d.saldado), 0),
      deudasPendientes,
      // `porCobrarDelDia` es siempre 0 en un día ya cerrado — eso pasó a
      // vivir como deuda. Para saber si ese día en concreto sigue debiendo
      // hay que mirar si queda alguna deuda abierta que haya nacido ese día.
      diasConDeudaAbierta: new Set(abiertas.map((d) => d.fechaOrigen)),
    };
  }, []);

  if (!datos) return null;
  const { semana, resumenes, dias, deudaAbierta, deudasPendientes, diasConDeudaAbierta, hayActividadHoy } =
    datos;

  const maximo = Math.max(1, ...resumenes.map((r) => r.repartidoPollos));
  const repartidoSemana = resumenes.reduce((a, r) => a + r.repartidoPollos, 0);
  const cobradoSemana = resumenes.reduce((a, r) => a + r.cobrado, 0);
  const hoy = hoyISO();
  // El último de `semana` es siempre hoy (`ultimosDias` termina en la fecha
  // que se le pasa). Se muestra aparte, arriba de los días cerrados: no hace
  // falta cerrar la jornada para poder repasar lo que llevas hoy.
  const resumenHoy = resumenes[resumenes.length - 1];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Cabecera titulo="Historial" volver={volver} />

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
        {/* Igual que el informe del día en Cierre: números ya sacados, contados
            en un par de frases. Guardado del día, para no gastar cuota si
            solo se quiere volver a ver. */}
        <div style={{ ...S.tarjeta, padding: 16 }}>
          <div style={{ ...S.rotulo, marginBottom: 12 }}>Informe de la semana</div>
          {!apiKey ? (
            <div style={{ fontSize: 14, color: "var(--texto-3)", lineHeight: 1.5 }}>
              Pon tu API key de Gemini en Ajustes para que te resuma la semana.
            </div>
          ) : (
            <>
              {informe && (
                <div style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      fontSize: 15,
                      color: "var(--texto-2)",
                      lineHeight: 1.55,
                      marginBottom: informe.destacados.length ? 12 : 0,
                    }}
                  >
                    {informe.resumen}
                  </div>
                  {informe.destacados.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {informe.destacados.map((d, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span style={{ color: "var(--acento-claro)", fontSize: 14, lineHeight: 1.5 }}>
                            •
                          </span>
                          <span style={{ fontSize: 14, color: "var(--texto-2)", lineHeight: 1.5, flex: 1 }}>
                            {d}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {errorInforme && (
                <div style={{ fontSize: 13, color: "var(--rojo)", marginBottom: 10, lineHeight: 1.5 }}>
                  {errorInforme}
                </div>
              )}
              <button
                onClick={generarInforme}
                disabled={generandoInforme}
                className="pulsable"
                style={{
                  height: 48,
                  width: "100%",
                  borderRadius: "var(--radio)",
                  border: "1.5px solid var(--borde)",
                  color: "var(--acento-300)",
                  fontSize: 15,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: generandoInforme ? 0.6 : 1,
                }}
              >
                {generandoInforme
                  ? "Escribiendo…"
                  : informe
                    ? "Volver a generar"
                    : "Generar informe con Gemini"}
              </button>
            </>
          )}
        </div>

        <div style={{ ...S.tarjeta, padding: 16 }}>
          <div style={{ ...S.rotulo, marginBottom: 14 }}>Esta semana</div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              height: 96,
              marginBottom: 10,
            }}
          >
            {semana.map((d, i) => (
              <div
                key={d}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  justifyContent: "flex-end",
                  height: "100%",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    borderRadius: "5px 5px 0 0",
                    background: d === hoy ? "var(--acento)" : "var(--borde)",
                    // Un mínimo visible: una barra de 0px parece un error de la app.
                    height: `${Math.max(3, (resumenes[i].repartidoPollos / maximo) * 100)}%`,
                  }}
                />
                <div style={{ fontSize: 12, color: "var(--texto-4)" }}>{inicialDia(d)}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--linea)", paddingTop: 4 }}>
            <Fila label="Repartido" valor={`${repartidoSemana} pollos`} />
            <Fila label="Cobrado" valor={money(cobradoSemana)} color="var(--verde)" />
            <Fila
              label="Deuda abierta"
              valor={money(deudaAbierta)}
              color={deudaAbierta > 0 ? "var(--rojo)" : "var(--texto-4)"}
            />
          </div>
        </div>

        {deudasPendientes.length > 0 && (
          <>
            <div style={{ ...S.rotulo, fontSize: 13, padding: "6px 4px 0" }}>
              Deudas de días anteriores
            </div>
            <div style={{ ...S.tarjeta, padding: 16 }}>
              {deudasPendientes.map((d) => (
                <Fila key={d.tiendaId} label={d.nombre} valor={money(d.monto)} color="var(--ambar)" />
              ))}
            </div>
          </>
        )}

        {hayActividadHoy && (
          <button
            onClick={() => abrirDia(hoy)}
            className="pulsable"
            style={{
              ...S.tarjeta,
              borderRadius: 12,
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              border: "1.5px solid var(--acento)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 600 }}>Hoy</div>
              <div style={{ fontSize: 14, color: "var(--texto-3)", marginTop: 3 }}>
                {resumenHoy.repartidoPollos} pollos · {resumenHoy.tiendas} tiendas · en curso
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--verde)", flex: "none" }}>
              {money(resumenHoy.cobrado)}
            </div>
            <ChevronRight size={22} color="var(--texto-5)" style={{ flex: "none" }} />
          </button>
        )}

        <div style={{ ...S.rotulo, fontSize: 13, padding: "4px 4px 0" }}>Días cerrados</div>

        {dias.length === 0 && (
          <Vacio
            titulo="Todavía no has cerrado ningún día"
            sub="Cuando cierres la jornada desde el cuadre de caja, aparecerá aquí."
          />
        )}

        {dias.map(({ jornada, resumen }) => (
          <button
            key={jornada.fecha}
            onClick={() => abrirDia(jornada.fecha)}
            className="pulsable"
            style={{
              ...S.tarjeta,
              borderRadius: 12,
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 600 }}>{diaCorto(jornada.fecha)}</div>
              <div style={{ fontSize: 14, color: "var(--texto-3)", marginTop: 3 }}>
                {resumen.repartidoPollos} pollos · {resumen.tiendas} tiendas
                {diasConDeudaAbierta.has(jornada.fecha) && " · quedó debiendo"}
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--verde)", flex: "none" }}>
              {money(resumen.cobrado)}
            </div>
            <ChevronRight size={22} color="var(--texto-5)" style={{ flex: "none" }} />
          </button>
        ))}
      </div>
    </div>
  );
}
