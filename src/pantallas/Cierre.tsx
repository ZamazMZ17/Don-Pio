import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { cerrarDia, leerJornada, resumenDe } from "../db/jornada";
import { cuentasPendientes } from "../db/entregas";
import { money } from "../lib/dinero";
import type { DiaISO } from "../lib/fecha";
import { avisoGuardado } from "../lib/aviso";
import { useAjuste } from "../lib/ganchos";
import { CLAVE_API } from "../voz/ajustes";
import { informeDelDia, type Informe } from "../voz/informes";
import { BotonPrincipal, Cabecera, Fila, S } from "../ui/base";

/**
 * El cuadre de caja. Lo único que él compara de verdad: lo que dice la app
 * contra la plata que tiene en el bolsillo.
 */
export function Cierre({ fecha, volver }: { fecha: DiaISO; volver: () => void }) {
  const [cuadro, setCuadro] = useState<boolean | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const apiKey = useAjuste(CLAVE_API);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [generandoInforme, setGenerandoInforme] = useState(false);
  const [errorInforme, setErrorInforme] = useState<string | null>(null);

  const datos = useLiveQuery(async () => {
    const [resumen, jornada, cuentas] = await Promise.all([
      resumenDe(fecha),
      leerJornada(fecha),
      cuentasPendientes(fecha),
    ]);
    return { resumen, jornada, pendiente: cuentas.reduce((a, c) => a + c.total, 0) };
  }, [fecha]);

  const cerrada = datos?.jornada.estado === "cerrada";

  // Si ya se generó antes, se enseña de una sin gastar otra llamada. Solo
  // mira el caché — `db.informes.get` fuera de un `useLiveQuery` porque esto
  // no necesita reaccionar a cambios, solo cargar una vez al cerrar.
  useEffect(() => {
    if (!cerrada) return;
    void db.informes.get(`dia-${fecha}`).then((g) => {
      if (g) setInforme(g);
    });
  }, [cerrada, fecha]);

  if (!datos) return null;
  const { resumen, pendiente } = datos;

  const cerrar = () => {
    void cerrarDia(fecha, resumen.cobrado - resumen.gastos, cuadro).then(() => {
      avisoGuardado();
      volver();
    });
  };

  const generarInforme = () => {
    setGenerandoInforme(true);
    setErrorInforme(null);
    void informeDelDia(fecha, true)
      .then(setInforme)
      .catch((e) =>
        setErrorInforme(e instanceof Error ? e.message : "No se pudo generar el informe."),
      )
      .finally(() => setGenerandoInforme(false));
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Cabecera titulo="Cierre del día" volver={volver} />

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
        {/* La caja, en grande. Es lo que va a contar con la mano. */}
        <div
          style={{
            background: "var(--seccion)",
            borderRadius: "var(--radio-lg)",
            padding: "22px 18px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 14,
              color: "var(--acento-claro)",
              letterSpacing: 0.6,
              marginBottom: 8,
            }}
          >
            Deberías tener en la caja
          </div>
          {/* Lo cobrado menos lo que gastó: es la plata que de verdad
              debería tener encima al contar. */}
          <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, letterSpacing: -1 }}>
            {money(resumen.cobrado - resumen.gastos)}
          </div>
          <div style={{ fontSize: 14, color: "var(--texto-2)", marginTop: 10 }}>
            {cuadro === null
              ? "Cuéntalo y confirma si cuadra"
              : cuadro
                ? "Perfecto, queda anotado que cuadró"
                : "Queda anotado que no cuadró"}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Opcion label="Cuadra" activa={cuadro === true} onClick={() => setCuadro(true)} />
            <Opcion label="No cuadra" activa={cuadro === false} onClick={() => setCuadro(false)} />
          </div>
        </div>

        <div style={{ ...S.tarjeta, padding: 16 }}>
          <div style={{ ...S.rotulo, marginBottom: 12 }}>Repartido</div>
          <Fila
            label="Pollos"
            valor={
              <>
                <b style={{ fontWeight: 700 }}>{resumen.repartidoPollos}</b>{" "}
                <span style={{ color: "var(--texto-4)", fontWeight: 400 }}>
                  de {resumen.stockPollos}
                </span>
              </>
            }
            tam={17}
          />
          <Fila
            label="Piernas"
            valor={
              <>
                <b style={{ fontWeight: 700 }}>{resumen.repartidoPiernas}</b>{" "}
                <span style={{ color: "var(--texto-4)", fontWeight: 400 }}>
                  de {resumen.piernasDisponibles}
                </span>
              </>
            }
            tam={17}
          />
          {(resumen.stockPechos > 0 || resumen.repartidoPechos > 0) && (
            <Fila
              label="Pechos"
              valor={
                <>
                  <b style={{ fontWeight: 700 }}>{resumen.repartidoPechos}</b>{" "}
                  <span style={{ color: "var(--texto-4)", fontWeight: 400 }}>
                    {/* Sin pechos comprados, todo lo entregado salió de
                        partir pollos propios — "de 0" leería raro. */}
                    {resumen.stockPechos > 0 ? `de ${resumen.stockPechos}` : "pollos partidos"}
                  </span>
                </>
              }
              tam={17}
            />
          )}
          <div style={{ borderTop: "1px solid var(--linea)", marginTop: 6, paddingTop: 2 }}>
            <Fila
              label={resumen.restantePollos < 0 ? "Te faltaron" : "Te sobraron"}
              valor={`${Math.abs(resumen.restantePollos)} pollos · ${Math.abs(
                resumen.restantePiernas,
              )} piernas${resumen.pechosLibres > 0 ? ` · ${resumen.pechosLibres} pechos` : ""}`}
              color="var(--ambar)"
              tam={17}
            />
          </div>
        </div>

        <div style={{ ...S.tarjeta, padding: 16 }}>
          <div style={{ ...S.rotulo, marginBottom: 12 }}>Dinero</div>
          <Fila label="Cobrado hoy" valor={money(resumen.cobrado)} color="var(--verde)" tam={17} />
          <Fila
            label="Queda por cobrar"
            valor={money(pendiente)}
            color={pendiente > 0 ? "var(--rojo)" : "var(--texto-4)"}
            tam={17}
          />
          <Fila
            label="Regalado en redondeos"
            valor={money(resumen.descuentos)}
            color="var(--texto)"
            tam={17}
          />
          <Fila
            label="Gastos del día"
            valor={money(resumen.gastos)}
            color={resumen.gastos > 0 ? "var(--ambar)" : "var(--texto-4)"}
            tam={17}
          />
        </div>

        {/*
          El único momento en que Gemini entra en juego: el día ya está
          congelado, así que le cuenta con números que ya no van a cambiar.
          Se guarda en `informes` para no volver a gastar cuota si solo
          quiere verlo de nuevo.
        */}
        {cerrada && (
          <div style={{ ...S.tarjeta, padding: 16 }}>
            <div style={{ ...S.rotulo, marginBottom: 12 }}>Informe del día</div>
            {!apiKey ? (
              <div style={{ fontSize: 14, color: "var(--texto-3)", lineHeight: 1.5 }}>
                Pon tu API key de Gemini en Ajustes para que te resuma el día.
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
                  <div
                    style={{ fontSize: 13, color: "var(--rojo)", marginBottom: 10, lineHeight: 1.5 }}
                  >
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
        )}

        {cerrada ? (
          <div
            style={{
              ...S.tarjeta,
              padding: 18,
              textAlign: "center",
              color: "var(--texto-3)",
              fontSize: 15,
            }}
          >
            Este día ya está cerrado.
          </div>
        ) : confirmando ? (
          <>
            <div
              style={{
                background: "var(--acento-900)",
                borderRadius: "var(--radio)",
                padding: 16,
                fontSize: 15,
                color: "var(--acento-300)",
                lineHeight: 1.55,
              }}
            >
              Al cerrar, los {money(pendiente)} que faltan pasan como deuda de cada tienda y el
              día queda congelado. Esto no se puede deshacer.
            </div>
            <BotonPrincipal onClick={cerrar} alto={62}>
              Sí, cerrar el día
            </BotonPrincipal>
            <button
              onClick={() => setConfirmando(false)}
              style={{ height: 52, color: "var(--texto-3)", fontSize: 16, width: "100%" }}
            >
              Todavía no
            </button>
          </>
        ) : (
          <BotonPrincipal onClick={() => setConfirmando(true)} alto={62}>
            Cerrar el día
          </BotonPrincipal>
        )}

        <div
          style={{
            fontSize: 13,
            color: "var(--texto-4)",
            textAlign: "center",
            lineHeight: 1.6,
            padding: "0 20px",
          }}
        >
          Lo que quede por cobrar pasa como deuda de cada tienda.
        </div>
      </div>
    </div>
  );
}

function Opcion({
  label,
  activa,
  onClick,
}: {
  label: string;
  activa: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        height: 56,
        borderRadius: "var(--radio)",
        border: `1.5px solid ${activa ? "var(--acento-claro)" : "var(--seccion-ghost)"}`,
        background: activa ? "var(--seccion-glow)" : "transparent",
        color: activa ? "var(--acento-200)" : "var(--texto-2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 17,
        fontWeight: activa ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}
