import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Trash2 } from "lucide-react";
import { db } from "../db/db";
import {
  agregarTanda as agregarTandaDB,
  borrarEntrega,
  cobrarEntrega,
  editarEntrega,
  fijarPeso,
  fijarTotal,
  registrarCobro,
} from "../db/entregas";
import { actualizarTienda, deudaDetalle } from "../db/tiendas";
import { aCentimos, aCobrar, aGramos, kg, money } from "../lib/dinero";
import { diaCorto } from "../lib/fecha";
import { avisoGuardado } from "../lib/aviso";
import { BotonPrincipal, Cabecera, Contador, Fila, S } from "../ui/base";

/** Un número que se escribe y se guarda al salir del campo. */
function CampoNumero({
  valor,
  sufijo,
  onGuardar,
}: {
  valor: string;
  sufijo: string;
  onGuardar: (n: number) => void;
}) {
  return (
    <span style={{ display: "flex", alignItems: "baseline", gap: 6, flex: "none" }}>
      <input
        // `key` para que el campo se refresque cuando el valor cambia por otro
        // camino (al agregar una tanda, por ejemplo).
        key={valor}
        defaultValue={valor}
        inputMode="decimal"
        placeholder="0.00"
        onFocus={(ev) => ev.currentTarget.select()}
        onBlur={(ev) => {
          const n = Number(ev.target.value.replace(",", "."));
          if (Number.isFinite(n) && n >= 0) onGuardar(n);
        }}
        style={{
          width: 108,
          height: 46,
          textAlign: "right",
          borderRadius: "var(--radio-sm)",
          border: "1.5px solid var(--borde)",
          background: "var(--hundido)",
          padding: "0 10px",
          fontSize: 22,
          fontWeight: 700,
        }}
      />
      <span style={{ fontSize: 16, color: "var(--texto-3)" }}>{sufijo}</span>
    </span>
  );
}

/**
 * El detalle de una entrega. Todo editable, que es para lo que existe: cuando
 * piden más, cuando hay merma, o cuando el peso se dictó mal.
 */
export function Detalle({ entregaId, volver }: { entregaId: number; volver: () => void }) {
  const [nuevaTanda, setNuevaTanda] = useState("");
  const [renombrando, setRenombrando] = useState(false);
  const [nombreEdit, setNombreEdit] = useState("");
  /** Un solo toque no puede borrar una entrega — a veces ya tiene plata cobrada. */
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    if (!borrando) return;
    const id = setTimeout(() => setBorrando(false), 8000);
    return () => clearTimeout(id);
  }, [borrando]);

  const datos = useLiveQuery(async () => {
    const entrega = await db.entregas.get(entregaId);
    if (!entrega) return null;
    const [tienda, deuda] = await Promise.all([
      db.tiendas.get(entrega.tiendaId),
      deudaDetalle(entrega.tiendaId),
    ]);
    return { entrega, tienda, deuda };
  }, [entregaId]);

  if (datos === undefined) return null;
  if (datos === null) {
    volver();
    return null;
  }

  const { entrega: e, tienda, deuda } = datos;
  const cobrado = e.totalCobrado + e.descuentoRedondeo;
  const saldo = Math.max(0, e.totalCalculado - cobrado);

  const cambiarTandas = (tandas: number[]) => void editarEntrega(entregaId, { tandas });

  const guardarNombre = () => {
    const nombre = nombreEdit.trim();
    if (!tienda || !nombre || nombre === tienda.nombre) return;
    void actualizarTienda(tienda.id!, { nombre }).then(() => {
      avisoGuardado();
      setRenombrando(false);
    });
  };

  const agregarTanda = () => {
    const n = Number(nuevaTanda.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return;
    // La función de la base se encarga de que, si había un peso de una sola
    // pesada, ese peso quede como primera tanda en vez de perderse.
    void agregarTandaDB(entregaId, aGramos(n));
    setNuevaTanda("");
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Cabecera
        titulo={tienda?.nombre ?? "Entrega"}
        volver={volver}
        derecha={
          tienda && (
            <button
              aria-label="Editar nombre"
              onClick={() => {
                setNombreEdit(tienda.nombre);
                setRenombrando((v) => !v);
              }}
              style={{ color: "var(--texto-3)", display: "flex", padding: 8, flex: "none" }}
            >
              <Pencil size={20} />
            </button>
          )
        }
      />

      <div
        className="scroll"
        style={{
          flex: 1,
          // Sin barra de pestañas (que ya trae su propio --seguro-abajo), una
          // entrega corta que no llega a hacer scroll deja el botón de abajo
          // pegado al borde, donde la barra de gestos de Android puede
          // taparlo o robarle el toque.
          padding: "0 18px calc(40px + var(--seguro-abajo))",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {renombrando && tienda && (
          <div style={{ ...S.tarjeta, padding: 16, display: "flex", gap: 8 }}>
            <input
              autoFocus
              value={nombreEdit}
              onChange={(ev) => setNombreEdit(ev.target.value)}
              onKeyDown={(ev) => ev.key === "Enter" && guardarNombre()}
              placeholder="Nombre de la tienda"
              style={{
                flex: 1,
                minWidth: 0,
                height: 54,
                borderRadius: "var(--radio)",
                border: "1.5px solid var(--borde)",
                background: "var(--hundido)",
                padding: "0 14px",
                fontSize: 17,
              }}
            />
            <button
              onClick={guardarNombre}
              className="pulsable-acento"
              disabled={!nombreEdit.trim() || nombreEdit.trim() === tienda.nombre}
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
                opacity: nombreEdit.trim() && nombreEdit.trim() !== tienda.nombre ? 1 : 0.45,
              }}
            >
              Guardar
            </button>
          </div>
        )}

        {deuda.monto > 0 && (
          <button
            className="pulsable"
            onClick={() => {
              void registrarCobro(e.tiendaId, aCobrar(deuda.monto), {
                fecha: e.fecha,
                aceptarRedondeo: true,
              }).then(() => avisoGuardado());
            }}
            style={{
              background: "var(--acento-900)",
              borderRadius: "var(--radio)",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 16, color: "var(--ambar)" }}>
              Debe {money(deuda.monto)}
              {deuda.desde && ` del ${diaCorto(deuda.desde).toLowerCase()}`}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--acento-300)", flex: "none" }}>
              Cobrar aquí
            </div>
          </button>
        )}

        {/* Cantidad */}
        <div style={{ ...S.tarjeta, padding: 16 }}>
          <div style={{ ...S.rotulo, marginBottom: 12 }}>Cantidad</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 18 }}>Pollos</div>
            <Contador
              valor={e.pollos}
              onCambio={(pollos) => void editarEntrega(entregaId, { pollos })}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 18, color: "var(--texto-2)" }}>Piernas</div>
            <Contador
              valor={e.piernas}
              onCambio={(piernas) => void editarEntrega(entregaId, { piernas })}
              apagado={e.piernas === 0}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, color: "var(--texto-2)" }}>Pechos</div>
              <div style={{ fontSize: 13, color: "var(--texto-4)", marginTop: 2 }}>
                De pollos partidos
              </div>
            </div>
            <Contador
              valor={e.pechos ?? 0}
              onCambio={(pechos) => void editarEntrega(entregaId, { pechos })}
              apagado={!e.pechos}
            />
          </div>
        </div>

        {/* Tandas de peso */}
        {!e.sinPesar && (
          <div style={{ ...S.tarjeta, padding: 16 }}>
            <div style={{ ...S.rotulo, marginBottom: 12 }}>Tandas de peso</div>

            {e.tandas.map((t, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "11px 0",
                  borderBottom: "1px solid var(--linea)",
                }}
              >
                <span style={{ fontSize: 16, color: "var(--texto-2)" }}>
                  {["Primera", "Segunda", "Tercera", "Cuarta"][i] ?? `Tanda ${i + 1}`} tanda
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 20, fontWeight: 600 }}>{kg(t)}</span>
                  <button
                    aria-label="Quitar tanda"
                    onClick={() => cambiarTandas(e.tandas.filter((_, j) => j !== i))}
                    style={{ color: "var(--texto-4)", display: "flex", padding: 4 }}
                  >
                    <Trash2 size={18} />
                  </button>
                </span>
              </div>
            ))}

            <div style={{ display: "flex", gap: 10, padding: "12px 0 4px" }}>
              <input
                value={nuevaTanda}
                onChange={(ev) => setNuevaTanda(ev.target.value)}
                onKeyDown={(ev) => ev.key === "Enter" && agregarTanda()}
                inputMode="decimal"
                placeholder="Otra pesada"
                style={{
                  flex: 1,
                  // Sin esto el campo no encoge por debajo de su texto y
                  // empujaba el botón «Agregar» fuera de la pantalla.
                  minWidth: 0,
                  height: 52,
                  borderRadius: "var(--radio)",
                  border: "1.5px solid var(--borde)",
                  background: "var(--hundido)",
                  padding: "0 14px",
                  fontSize: 17,
                }}
              />
              <button
                onClick={agregarTanda}
                className="pulsable-acento"
                style={{
                  flex: "none",
                  width: 92,
                  height: 52,
                  borderRadius: "var(--radio)",
                  border: "1.5px solid var(--acento)",
                  color: "var(--acento-300)",
                  fontSize: 16,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Agregar
              </button>
            </div>

            {/*
              Con una sola pesada —que es lo más frecuente— el peso se escribe
              aquí directamente. Obligar a borrar la tanda y crear otra para
              corregir un peso es dar tres vueltas para nada.
            */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                paddingTop: 13,
              }}
            >
              <span style={{ fontSize: 16, color: "var(--texto-2)" }}>Peso total</span>
              {e.tandas.length > 1 ? (
                <span style={{ fontSize: 24, fontWeight: 700 }}>{kg(e.peso)}</span>
              ) : (
                <CampoNumero
                  valor={e.peso > 0 ? (e.peso / 1000).toFixed(2) : ""}
                  sufijo="kg"
                  onGuardar={(n) => void fijarPeso(entregaId, aGramos(n))}
                />
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 12,
                marginTop: 12,
                borderTop: "1px solid var(--borde)",
              }}
            >
              <span style={{ fontSize: 16, color: "var(--texto-2)" }}>Precio por kilo</span>
              <input
                defaultValue={(e.precioKg / 100).toFixed(2)}
                inputMode="decimal"
                onFocus={(ev) => ev.currentTarget.select()}
                onBlur={(ev) => {
                  const n = Number(ev.target.value.replace(",", "."));
                  if (Number.isFinite(n) && n > 0) {
                    void editarEntrega(entregaId, { precioKg: aCentimos(n) });
                  }
                }}
                style={{
                  width: 110,
                  height: 44,
                  textAlign: "right",
                  borderRadius: "var(--radio-sm)",
                  border: "1.5px solid var(--borde)",
                  background: "var(--hundido)",
                  padding: "0 12px",
                  fontSize: 20,
                  fontWeight: 600,
                }}
              />
            </div>
          </div>
        )}

        {/* Total y pago */}
        <div style={{ ...S.tarjeta, padding: "18px 16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <span style={{ ...S.rotulo, fontSize: 13 }}>Total</span>
            {/* Editable: a veces lo que él sabe es el total, no el precio. */}
            <input
              key={e.totalCalculado}
              defaultValue={(e.totalCalculado / 100).toFixed(2)}
              inputMode="decimal"
              aria-label="Total"
              onFocus={(ev) => ev.currentTarget.select()}
              onBlur={(ev) => {
                const n = Number(ev.target.value.replace(",", "."));
                if (Number.isFinite(n) && n >= 0) void fijarTotal(entregaId, aCentimos(n));
              }}
              style={{
                width: 190,
                textAlign: "right",
                fontSize: 38,
                fontWeight: 700,
                lineHeight: 1.1,
                background: "none",
                border: "none",
                borderBottom: "1.5px dashed var(--borde)",
                padding: "2px 0",
                outline: "none",
              }}
            />
          </div>
          <Fila label="Cobrado" valor={money(e.totalCobrado)} color="var(--verde)" />
          <Fila
            label="Saldo"
            valor={money(saldo)}
            color={saldo > 0 ? "var(--rojo)" : "var(--texto-4)"}
          />
          <Fila
            label="Redondeo a su favor"
            valor={money(e.descuentoRedondeo)}
            color={e.descuentoRedondeo > 0 ? "var(--acento-claro)" : "var(--texto-4)"}
          />

          {/*
            Cobrar esta entrega ahí mismo. Hace falta cuando pasa dos veces
            por la misma tienda el mismo día: la primera ya se cobró y esta
            todavía no, y sin este botón la única forma de cobrarla era
            Cobranza, que junta todo lo del día en una sola cuenta.
          */}
          {saldo > 0 && (
            <button
              className="pulsable-acento"
              onClick={() => {
                void cobrarEntrega(entregaId, saldo).then(() => {
                  avisoGuardado();
                });
              }}
              style={{
                marginTop: 14,
                height: 54,
                width: "100%",
                borderRadius: "var(--radio)",
                border: "1.5px solid var(--acento)",
                background: "var(--acento-900)",
                color: "var(--acento-200)",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Cobrar {money(saldo)}
            </button>
          )}
        </div>

        <BotonPrincipal onClick={volver} alto={62}>Listo</BotonPrincipal>

        {borrando ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px" }}>
            <div style={{ flex: 1, fontSize: 14, color: "var(--rojo)" }}>
              {e.totalCobrado > 0
                ? `¿Borrar? Se pierde también ${money(e.totalCobrado)} ya cobrado.`
                : "¿Borrar esta entrega? No se puede deshacer."}
            </div>
            <button
              onClick={() => {
                void borrarEntrega(entregaId);
                volver();
              }}
              style={{
                flex: "none",
                height: 44,
                padding: "0 16px",
                borderRadius: "var(--radio)",
                border: "1.5px solid var(--rojo)",
                color: "var(--rojo)",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              Sí, borrar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setBorrando(true)}
            style={{
              height: 52,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              color: "var(--texto-4)",
              fontSize: 15,
            }}
          >
            <Trash2 size={17} /> Borrar esta entrega
          </button>
        )}
      </div>
    </div>
  );
}
