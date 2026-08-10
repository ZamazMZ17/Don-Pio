import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight } from "lucide-react";
import { db } from "../db/db";
import { resumenDe } from "../db/jornada";
import { money } from "../lib/dinero";
import { diaCorto, hoyISO, inicialDia, ultimosDias, type DiaISO } from "../lib/fecha";
import { Cabecera, Fila, S, Vacio } from "../ui/base";

/** Los días cerrados y cómo va la semana. */
export function Historial({ volver, abrirDia }: { volver: () => void; abrirDia: (d: DiaISO) => void }) {
  const datos = useLiveQuery(async () => {
    const jornadas = (await db.jornadas.toArray()).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const cerradas = jornadas.filter((j) => j.estado === "cerrada");

    const semana = ultimosDias(hoyISO(), 7);
    const resumenes = await Promise.all(semana.map((d) => resumenDe(d)));
    const deudas = await db.deudas.toArray();

    const dias = await Promise.all(
      cerradas.slice(0, 30).map(async (j) => ({ jornada: j, resumen: await resumenDe(j.fecha) })),
    );

    return {
      semana,
      resumenes,
      dias,
      deudaAbierta: deudas
        .filter((d) => !d.cerrada)
        .reduce((a, d) => a + (d.monto - d.saldado), 0),
    };
  }, []);

  if (!datos) return null;
  const { semana, resumenes, dias, deudaAbierta } = datos;

  const maximo = Math.max(1, ...resumenes.map((r) => r.repartidoPollos));
  const repartidoSemana = resumenes.reduce((a, r) => a + r.repartidoPollos, 0);
  const cobradoSemana = resumenes.reduce((a, r) => a + r.cobrado, 0);
  const hoy = hoyISO();

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Cabecera titulo="Historial" volver={volver} />

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
                {resumen.porCobrarDelDia > 0 && " · quedó debiendo"}
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
