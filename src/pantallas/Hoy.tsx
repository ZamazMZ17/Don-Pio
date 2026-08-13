import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { leerJornada, resumenDe } from "../db/jornada";
import { deudasPorTienda } from "../db/tiendas";
import { estadoDe, COLOR_ESTADO, TEXTO_ESTADO } from "../dominio/calculo";
import { diaCorto, diaLargo, type DiaISO } from "../lib/fecha";
import { kgCorto, money } from "../lib/dinero";
import { useAjuste } from "../lib/ganchos";
import { ChevronRight, Sparkles } from "lucide-react";
import { guardarAjuste, CLAVE_API, CLAVE_ORDEN } from "../voz/ajustes";
import { S, Vacio } from "../ui/base";
// Importado como módulo, no referenciado por ruta absoluta: es el único
// sitio de la app que pinta una imagen suelta, y `/icono-192.png` a pelo no
// se resolvía dentro del WebView del APK aunque en el navegador sí. Así lo
// procesa Vite igual que a las fuentes y queda con la misma garantía.
import logo from "../assets/logo.png";

/**
 * La pantalla principal. Todo el estado del día sin desplazar: con cuánto
 * salió, cuánto le queda, cuánto lleva cobrado y cuánto le falta.
 */
export function Hoy({
  fecha,
  abrir,
  abrirStock,
  abrirAjustes,
}: {
  fecha: DiaISO;
  abrir: (entregaId: number) => void;
  abrirStock: () => void;
  abrirAjustes: () => void;
}) {
  const conIA = useAjuste(CLAVE_API) !== "";
  const orden = useAjuste(CLAVE_ORDEN, "ruta");

  const datos = useLiveQuery(async () => {
    const [resumen, entregas, tiendas, deudas, jornada] = await Promise.all([
      resumenDe(fecha),
      db.entregas.where("fecha").equals(fecha).toArray(),
      db.tiendas.toArray(),
      deudasPorTienda(),
      leerJornada(fecha),
    ]);
    const porId = new Map(tiendas.map((t) => [t.id!, t]));

    /*
     * Los cobros sueltos: días en que pasa por una tienda, no le deja nada y
     * solo le cobra lo de antes. Sin esto desaparecían de la pantalla — dictaba
     * «cero pollos, pagó tanto» y no quedaba rastro de haber pasado por ahí.
     */
    const pagos = await db.pagos.where("fecha").equals(fecha).toArray();
    const conEntrega = new Set(entregas.map((e) => e.tiendaId));
    const soloCobro = new Map<number, number>();
    for (const p of pagos) {
      if (conEntrega.has(p.tiendaId)) continue;
      soloCobro.set(p.tiendaId, (soloCobro.get(p.tiendaId) ?? 0) + p.monto);
    }

    return { resumen, entregas, porId, deudas, jornada, soloCobro };
  }, [fecha]);

  if (!datos) return null;
  const { resumen, entregas, porId, deudas, jornada, soloCobro } = datos;

  const lista = [...entregas].sort((a, b) => {
    if (orden === "pendientes") {
      const falta = (x: (typeof entregas)[number]) =>
        x.totalCalculado - x.totalCobrado - x.descuentoRedondeo;
      return falta(b) - falta(a);
    }
    // `retorno`: del último al primero, como cuando vuelve cobrando.
    return orden === "retorno" ? b.orden - a.orden : a.orden - b.orden;
  });

  const SIGUIENTE = { ruta: "retorno", retorno: "pendientes", pendientes: "ruta" } as const;
  const ETIQUETA = {
    ruta: "Por ruta ⇅",
    retorno: "Del último ⇅",
    pendientes: "Por pendientes ⇅",
  } as const;

  const cobrosSueltos = [...soloCobro.entries()];

  const porCobrarTotal =
    resumen.porCobrarDelDia + [...deudas.values()].reduce((a, b) => a + b, 0);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Encabezado con las cuatro cifras */}
      <div
        style={{
          flex: "none",
          padding: "6px 20px 16px",
          borderBottom: "1px solid var(--linea)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <img
              src={logo}
              alt=""
              width={28}
              height={28}
              style={{ borderRadius: 7, flex: "none" }}
            />
            <div style={{ fontSize: 22, fontWeight: 600 }}>{diaCorto(fecha)}</div>
          </div>
          <div
            style={{
              fontSize: 14,
              color: jornada.estado === "cerrada" ? "var(--texto-4)" : "var(--texto-3)",
            }}
          >
            jornada {jornada.estado}
          </div>
        </div>

        {/*
          Sin stock cargado no se puede decir cuánto queda, así que se enseña
          lo repartido — que sí se sabe — y se ofrece ponerlo. Un «0 → 0» no
          informa de nada y encima parece que la app está rota.
        */}
        <button
          onClick={abrirStock}
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 14,
            marginBottom: 14,
            width: "100%",
          }}
        >
          {resumen.stockPollos > 0 ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ ...S.rotulo, fontSize: 12, letterSpacing: 0.9 }}>Salí con</div>
                <div
                  style={{ fontSize: 30, fontWeight: 600, color: "var(--verde)", lineHeight: 1 }}
                >
                  {resumen.stockPollos}
                </div>
              </div>
              <div style={{ fontSize: 26, color: "var(--texto-5)", paddingBottom: 2 }}>→</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ ...S.rotulo, fontSize: 12, letterSpacing: 0.9 }}>Me quedan</div>
                <div
                  style={{ fontSize: 44, fontWeight: 700, color: "var(--ambar)", lineHeight: 1 }}
                >
                  {resumen.restantePollos}
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "left" }}>
              <div style={{ ...S.rotulo, fontSize: 12, letterSpacing: 0.9 }}>Has repartido</div>
              <div style={{ fontSize: 44, fontWeight: 700, color: "var(--texto)", lineHeight: 1 }}>
                {resumen.repartidoPollos}
              </div>
              <div style={{ fontSize: 13, color: "var(--acento-claro)", marginTop: 2 }}>
                Poner con cuánto saliste
              </div>
            </div>
          )}
          <div
            style={{
              marginLeft: "auto",
              textAlign: "right",
              fontSize: 13,
              color: "var(--texto-3)",
              lineHeight: 1.55,
            }}
          >
            <div>
              {resumen.stockPollos > 0 ? resumen.restantePiernas : resumen.repartidoPiernas} piernas
            </div>
            {resumen.repartidoPechos > 0 && (
              <div>
                {resumen.repartidoPechos} {resumen.repartidoPechos === 1 ? "pecho" : "pechos"}
              </div>
            )}
            {resumen.pechosLibres > 0 && (
              <div style={{ color: "var(--ambar)" }}>{resumen.pechosLibres} pechos libres</div>
            )}
            <div>
              {resumen.tiendas} {resumen.tiendas === 1 ? "tienda" : "tiendas"}
            </div>
          </div>
        </button>

        <div style={{ display: "flex", gap: 10 }}>
          <Cifra rotulo="Cobrado" valor={money(resumen.cobrado)} color="var(--verde)" />
          <Cifra rotulo="Por cobrar" valor={money(porCobrarTotal)} color="var(--rojo)" />
        </div>
      </div>

      {/* Lista tipo agenda */}
      <div
        className="scroll"
        style={{
          flex: 1,
          padding: "14px 18px 20px",
          /*
           * La barra de pestañas y el micrófono flotan encima, fuera del
           * flujo — un padding no alcanza: solo despeja una vez que ya se
           * hizo scroll hasta el final, y con pocas entregas (que ni piden
           * scroll) el micrófono tapaba igual el monto de la última. Con
           * margin en vez de padding, el propio cuadro de scroll deja de
           * ocupar esa franja, así que nunca hay nada debajo del micrófono.
           */
          marginBottom: "calc(190px + var(--seguro-abajo))",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 4px 2px",
          }}
        >
          <div style={{ ...S.rotulo, fontSize: 13 }}>
            Hoy · {entregas.length + cobrosSueltos.length}
          </div>
          <button
            onClick={() =>
              void guardarAjuste(CLAVE_ORDEN, SIGUIENTE[orden as keyof typeof SIGUIENTE] ?? "ruta")
            }
            style={{ fontSize: 13, color: "var(--acento-claro)", fontWeight: 500, padding: 6 }}
          >
            {ETIQUETA[orden as keyof typeof ETIQUETA] ?? "Por ruta ⇅"}
          </button>
        </div>

        {/*
          Sin API key el dictado se entiende con reglas, y eso se nota: nombres
          a medias y pesos que se pierden. Como él siempre tiene internet, vale
          la pena decírselo hasta que la ponga.
        */}
        {!conIA && (
          <button
            onClick={abrirAjustes}
            className="pulsable"
            style={{
              background: "var(--acento-900)",
              borderRadius: "var(--radio)",
              padding: "13px 15px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              marginBottom: 2,
            }}
          >
            <Sparkles size={19} color="var(--acento-claro)" style={{ flex: "none" }} />
            <span
              style={{
                flex: 1,
                fontSize: 14,
                color: "var(--acento-300)",
                lineHeight: 1.45,
                textAlign: "left",
              }}
            >
              Pon tu API key de Gemini para que entienda bien lo que dictas
            </span>
            <ChevronRight size={20} color="var(--acento-claro)" style={{ flex: "none" }} />
          </button>
        )}

        {cobrosSueltos.map(([tiendaId, monto]) => (
          <div
            key={`cobro-${tiendaId}`}
            style={{
              ...S.tarjeta,
              borderRadius: 14,
              padding: "16px 16px 15px",
              display: "flex",
              gap: 14,
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                flex: "none",
                background: "var(--verde)",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2, marginBottom: 4 }}>
                {porId.get(tiendaId)?.nombre ?? "Sin nombre"}
              </div>
              <div style={{ fontSize: 14, color: "var(--texto-3)" }}>
                Sin entrega · solo cobro
              </div>
            </div>
            <div style={{ textAlign: "right", flex: "none" }}>
              <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}>{money(monto)}</div>
              <div style={{ fontSize: 13, marginTop: 3, color: "var(--verde)" }}>Cobrado</div>
            </div>
          </div>
        ))}

        {lista.length === 0 && cobrosSueltos.length === 0 && (
          <Vacio
            titulo="Todavía no has entregado nada hoy"
            sub="Pulsa el micrófono y dile a quién le dejaste, cuántos pollos y cuánto pesaron."
          />
        )}

        {lista.map((e) => {
          const tienda = porId.get(e.tiendaId);
          const cobrado = e.totalCobrado + e.descuentoRedondeo;
          const estado = estadoDe(e.totalCalculado, cobrado);
          const deuda = deudas.get(e.tiendaId) ?? 0;

          const partes: string[] = [];
          // Singular de verdad: «1 pollos» se lee a error de la app.
          const cuantos = (n: number, uno: string, varios: string) =>
            `${n} ${n === 1 ? uno : varios}`;
          if (e.pollos) partes.push(cuantos(e.pollos, "pollo", "pollos"));
          if (e.pechos) partes.push(cuantos(e.pechos, "pecho", "pechos"));
          if (e.piernas) partes.push(cuantos(e.piernas, "pierna", "piernas"));
          if (partes.length === 0) partes.push("sin cantidad");
          // Sin peso no se enseña «0.0 kg · 0.00/kg»: eso parece un error de
          // la app, no una entrega de trato cerrado.
          partes.push(
            e.peso > 0
              ? `${kgCorto(e.peso)} · ${(e.precioKg / 100).toFixed(2)}/kg`
              : "sin pesar",
          );

          return (
            <button
              key={e.id}
              onClick={() => abrir(e.id!)}
              className="pulsable"
              style={{
                ...S.tarjeta,
                borderRadius: 14,
                padding: "16px 16px 15px",
                display: "flex",
                gap: 14,
                alignItems: "center",
                width: "100%",
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  flex: "none",
                  background: COLOR_ESTADO[estado],
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2, marginBottom: 4 }}>
                  {tienda?.nombre ?? "Sin nombre"}
                </div>
                <div style={{ fontSize: 14, color: "var(--texto-3)" }}>{partes.join(" · ")}</div>
                {deuda > 0 && (
                  <div style={{ fontSize: 13, color: "var(--ambar)", marginTop: 5 }}>
                    + {money(deuda)} que debía de antes
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", flex: "none" }}>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    lineHeight: 1.2,
                    // Con deuda, lo de hoy es solo una parte: se apaga para que
                    // el número grande sea el que de verdad tiene que cobrar.
                    color: deuda > 0 ? "var(--texto-3)" : "var(--texto)",
                  }}
                >
                  {money(e.totalCalculado)}
                </div>
                {deuda > 0 && (
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      marginTop: 2,
                      color: "var(--ambar)",
                    }}
                  >
                    {money(e.totalCalculado - e.totalCobrado - e.descuentoRedondeo + deuda)}
                  </div>
                )}
                <div style={{ fontSize: 13, marginTop: 3, color: COLOR_ESTADO[estado] }}>
                  {deuda > 0 ? "a cobrar" : TEXTO_ESTADO[estado]}
                </div>
              </div>
            </button>
          );
        })}

        {lista.length > 0 && (
          <div
            style={{
              textAlign: "center",
              fontSize: 12,
              color: "var(--texto-5)",
              paddingTop: 6,
            }}
          >
            {diaLargo(fecha)}
          </div>
        )}
      </div>
    </div>
  );
}

function Cifra({ rotulo, valor, color }: { rotulo: string; valor: string; color: string }) {
  return (
    <div
      style={{
        flex: 1,
        background: "var(--superficie)",
        borderRadius: "var(--radio-sm)",
        padding: "10px 12px",
      }}
    >
      <div style={{ ...S.rotulo, fontSize: 11, letterSpacing: 0.9, marginBottom: 3 }}>
        {rotulo}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color }}>{valor}</div>
    </div>
  );
}
