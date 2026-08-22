import { useLiveQuery } from "dexie-react-hooks";
import { fichaDe } from "../db/tiendas";
import { leerJornada } from "../db/jornada";
import { precioEfectivoKg } from "../db/tiendas";
import { kg, money } from "../lib/dinero";
import { diaCorto, hoyISO, type DiaISO } from "../lib/fecha";
import { Cabecera, Fila, S, Vacio } from "../ui/base";

/**
 * La ficha de un cliente: todo lo que se sabe de él, junto.
 *
 * El directorio solo dejaba renombrarlo, agregarle deuda o borrarlo — nunca
 * enseñó lo que de verdad hace falta para tratar con él y para discutir una
 * cuenta: cuánto te ha comprado, a cómo le vienes cobrando, cuántas veces te
 * ha quedado a deber, y sus últimas entregas una por una.
 */
export function FichaTienda({ tiendaId, volver }: { tiendaId: number; volver: () => void }) {
  const datos = useLiveQuery(async () => {
    const ficha = await fichaDe(tiendaId);
    if (!ficha) return null;
    // El precio que se le propondría hoy, con el base del día ya aplicado. Sin
    // base fijado hoy, `precioEfectivoKg` cae a su precio absoluto de siempre.
    const jornada = await leerJornada(hoyISO());
    return { ficha, sugerido: precioEfectivoKg(ficha.tienda, jornada.precioBaseKg ?? 0) };
  }, [tiendaId]);

  if (datos === undefined) return null;
  if (datos === null) {
    volver();
    return null;
  }

  const { ficha: f, sugerido } = datos;
  const t = f.tienda;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Cabecera
        titulo={t.nombre}
        sub={
          f.visitas === 0
            ? "Todavía sin entregas"
            : `${f.visitas} ${f.visitas === 1 ? "entrega" : "entregas"} · desde el ${diaCorto(
                f.primera as DiaISO,
              ).toLowerCase()}`
        }
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
        {f.visitas === 0 ? (
          <Vacio
            titulo="Todavía no le has dejado nada"
            sub="En cuanto le registres una entrega, aquí verás su historial y a cómo le vienes cobrando."
          />
        ) : (
          <>
            {/* Lo primero, lo que se pregunta al llegar a su puerta. */}
            <div style={{ display: "flex", gap: 10 }}>
              <Cifra
                rotulo="Te debe"
                valor={money(f.debe)}
                color={f.debe > 0 ? "var(--rojo)" : "var(--verde)"}
                pie={f.debe > 0 ? "por cobrar" : "está al día"}
              />
              <Cifra
                rotulo="Su precio"
                valor={sugerido > 0 ? `S/ ${(sugerido / 100).toFixed(2)}` : "—"}
                pie={sugerido > 0 ? "por kilo, hoy" : "todavía sin precio"}
              />
            </div>

            <div style={{ ...S.tarjeta, padding: "12px 16px" }}>
              <div style={{ ...S.rotulo, fontSize: 12, marginBottom: 4 }}>Lo que te ha comprado</div>
              <Fila label="Total" valor={money(f.comprado)} />
              <Fila label="Ya cobrado" valor={money(f.cobrado)} color="var(--verde)" />
              <Fila label="Pollos" valor={`${f.pollos}`} />
              {f.peso > 0 && <Fila label="Peso" valor={kg(f.peso)} />}
              {f.regalado > 0 && (
                <Fila
                  label="Le has regalado en redondeos"
                  valor={money(f.regalado)}
                  color="var(--acento-claro)"
                />
              )}
            </div>

            <div style={{ ...S.tarjeta, padding: "12px 16px" }}>
              <div style={{ ...S.rotulo, fontSize: 12, marginBottom: 4 }}>Cómo paga</div>
              <Fila
                label="Veces que te quedó debiendo"
                valor={`${f.vecesQueDebio} de ${f.visitas}`}
                color={f.vecesQueDebio > 0 ? "var(--ambar)" : "var(--verde)"}
              />
              <Fila label="Última vez" valor={diaCorto(f.ultima as DiaISO)} />
              {f.precioMin > 0 && (
                <Fila
                  label="Le has cobrado por kilo"
                  valor={
                    f.precioMin === f.precioMax
                      ? `S/ ${(f.precioMin / 100).toFixed(2)}`
                      : `S/ ${(f.precioMin / 100).toFixed(2)} – ${(f.precioMax / 100).toFixed(2)}`
                  }
                />
              )}
              {f.precioUltimo > 0 && (
                <Fila
                  label="La última vez que le pesaste"
                  valor={`S/ ${(f.precioUltimo / 100).toFixed(2)}`}
                />
              )}
            </div>

            <div style={{ ...S.rotulo, fontSize: 13, padding: "6px 4px 0" }}>Sus últimas entregas</div>
            {f.recientes.map((e) => (
              <div key={e.id} style={{ ...S.tarjeta, padding: "12px 16px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 10,
                    marginBottom: 4,
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{diaCorto(e.fecha)}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{money(e.total)}</div>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    fontSize: 13,
                    color: "var(--texto-3)",
                  }}
                >
                  <span>
                    {[
                      e.pollos && `${e.pollos} ${e.pollos === 1 ? "pollo" : "pollos"}`,
                      e.pechos && `${e.pechos} ${e.pechos === 1 ? "pecho" : "pechos"}`,
                      e.piernas && `${e.piernas} ${e.piernas === 1 ? "pierna" : "piernas"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "sin cantidad"}
                    {e.peso > 0 && ` · ${kg(e.peso)} · ${(e.precioKg / 100).toFixed(2)}/kg`}
                  </span>
                  {e.saldo > 0 && (
                    <span style={{ color: "var(--rojo)", flex: "none" }}>
                      quedó {money(e.saldo)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Una cifra grande de las de arriba. */
function Cifra({
  rotulo,
  valor,
  pie,
  color,
}: {
  rotulo: string;
  valor: string;
  pie: string;
  color?: string;
}) {
  return (
    <div style={{ ...S.tarjeta, flex: 1, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ ...S.rotulo, fontSize: 12 }}>{rotulo}</div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.15,
          marginTop: 3,
          color: color ?? "var(--texto-1)",
        }}
      >
        {valor}
      </div>
      <div style={{ fontSize: 12, color: "var(--texto-4)", marginTop: 3 }}>{pie}</div>
    </div>
  );
}
