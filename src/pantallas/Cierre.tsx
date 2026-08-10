import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { cerrarDia, leerJornada, resumenDe } from "../db/jornada";
import { cuentasPendientes } from "../db/entregas";
import { money } from "../lib/dinero";
import type { DiaISO } from "../lib/fecha";
import { avisoGuardado } from "../lib/aviso";
import { BotonPrincipal, Cabecera, Fila, S } from "../ui/base";

/**
 * El cuadre de caja. Lo único que él compara de verdad: lo que dice la app
 * contra la plata que tiene en el bolsillo.
 */
export function Cierre({ fecha, volver }: { fecha: DiaISO; volver: () => void }) {
  const [cuadro, setCuadro] = useState<boolean | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const datos = useLiveQuery(async () => {
    const [resumen, jornada, cuentas] = await Promise.all([
      resumenDe(fecha),
      leerJornada(fecha),
      cuentasPendientes(fecha),
    ]);
    return { resumen, jornada, pendiente: cuentas.reduce((a, c) => a + c.total, 0) };
  }, [fecha]);

  if (!datos) return null;
  const { resumen, jornada, pendiente } = datos;
  const cerrada = jornada.estado === "cerrada";

  const cerrar = () => {
    void cerrarDia(fecha, resumen.cobrado - resumen.gastos, cuadro).then(() => {
      avisoGuardado();
      volver();
    });
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Cabecera titulo="Cierre del día" volver={volver} />

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
                  de {resumen.stockPiernas + resumen.repartidoPechos}
                </span>
              </>
            }
            tam={17}
          />
          {resumen.repartidoPechos > 0 && (
            <Fila
              label="Pechos"
              valor={
                <>
                  <b style={{ fontWeight: 700 }}>{resumen.repartidoPechos}</b>{" "}
                  <span style={{ color: "var(--texto-4)", fontWeight: 400 }}>
                    pollos partidos
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
              )} piernas`}
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
