import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { History, Plus, Search, Trash2 } from "lucide-react";
import { db } from "../db/db";
import { useAjuste, useMemoriaScroll } from "../lib/ganchos";
import { CLAVE_ORDEN_TIENDAS, guardarAjuste } from "../voz/ajustes";
import {
  actualizarTienda,
  agregarDeuda,
  borrarTienda,
  cerrarDeudas,
  crearTienda,
  deudasPorTienda,
  saldoTotalPorTienda,
} from "../db/tiendas";
import { aCentimos, money, type Centimos } from "../lib/dinero";
import { horaTxt, hoyISO, sumarDias } from "../lib/fecha";
import { avisoAtencion, avisoGuardado } from "../lib/aviso";
import { mediana } from "../tiendas/emparejar";
import { normalizar, parecido } from "../tiendas/normalizar";
import { Cabecera, S, Vacio } from "../ui/base";

/**
 * El directorio. La mayoría de tiendas nace de un dictado y su precio, su
 * parada y su hora se aprenden solas; el botón de agregar es para las que
 * conviene tener ya cargadas antes de repartirles (sin precio ni hora todavía).
 */
export function Tiendas({ abrirFicha }: { abrirFicha: (tiendaId: number) => void }) {
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<number | null>(null);
  const [monto, setMonto] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [nombreEdit, setNombreEdit] = useState("");
  /** Qué tienda tiene armado el «¿seguro que la borro?», esperando confirmación. */
  const [borrando, setBorrando] = useState<number | null>(null);
  /** Si justo ahora tenía saldo pendiente y no se pudo borrar, para avisarlo. */
  const [noSePudo, setNoSePudo] = useState<{ id: number; deuda: Centimos } | null>(null);
  /** Las deudas viejas se fechan ayer: son de «antes», no de hoy. */
  const ayer = sumarDias(hoyISO(), -1);
  /** "ruta" (por parada, como se reparte) o "abc" (alfabético, para buscar). */
  const ordenTiendas = useAjuste(CLAVE_ORDEN_TIENDAS, "ruta");

  // Si lo dejó a medias, la confirmación de borrado no se queda armada
  // esperando un toque suelto que después borre algo sin querer.
  useEffect(() => {
    if (borrando === null) return;
    const id = setTimeout(() => setBorrando(null), 8000);
    return () => clearTimeout(id);
  }, [borrando]);

  useEffect(() => {
    if (noSePudo === null) return;
    const id = setTimeout(() => setNoSePudo(null), 8000);
    return () => clearTimeout(id);
  }, [noSePudo]);

  const datos = useLiveQuery(async () => {
    const [tiendas, deudas, saldos] = await Promise.all([
      db.tiendas.toArray(),
      deudasPorTienda(),
      saldoTotalPorTienda(),
    ]);
    return { tiendas, deudas, saldos };
  }, []);

  // No perder el sitio al crear, editar o borrar: la lista se rehace y volvía
  // al principio. El hook va antes del `return` que corta el render.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const guardarScroll = useMemoriaScroll(scrollRef, "tiendas", datos);

  if (!datos) return null;
  const { tiendas, deudas, saldos } = datos;

  const q = normalizar(busca);
  const filtradas = q ? tiendas.filter((t) => parecido(q, t.nombreNorm) > 0.55) : tiendas;
  const lista = [...filtradas].sort((a, b) =>
    ordenTiendas === "abc"
      ? // Alfabético de verdad: `localeCompare` en español pone «Ángela» junto
        // a «Angela» y no al final, que es lo que hace comparar cadenas a secas.
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
      : (a.ordenRuta || 999) - (b.ordenRuta || 999),
  );

  const crear = () => {
    const nombre = nombreNuevo.trim();
    if (!nombre) return;
    void crearTienda(nombre).then(() => {
      avisoGuardado();
      setNombreNuevo("");
      setAgregando(false);
    });
  };

  const guardarNombre = (id: number, actual: string) => {
    const nombre = nombreEdit.trim();
    if (!nombre || nombre === actual) return;
    void actualizarTienda(id, { nombre }).then(() => avisoGuardado());
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Cabecera
        titulo={`Tiendas · ${tiendas.length}`}
        derecha={
          <button
            onClick={() =>
              void guardarAjuste(CLAVE_ORDEN_TIENDAS, ordenTiendas === "abc" ? "ruta" : "abc")
            }
            style={{
              fontSize: 13,
              color: "var(--acento-claro)",
              fontWeight: 500,
              // El mínimo táctil de 52px, con margen negativo para no engordar
              // la cabecera (§4 y el fallo del botón de orden de Hoy).
              minHeight: 52,
              display: "inline-flex",
              alignItems: "center",
              whiteSpace: "nowrap",
              padding: "0 10px",
              margin: "-14px -6px",
              flex: "none",
            }}
          >
            {ordenTiendas === "abc" ? "A–Z ⇅" : "Por ruta ⇅"}
          </button>
        }
      />

      <div style={{ flex: "none", padding: "0 20px 12px", display: "flex", gap: 8 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flex: 1,
            minWidth: 0,
            background: "var(--superficie)",
            borderRadius: "var(--radio)",
            padding: "0 14px",
            height: 52,
          }}
        >
          <Search size={19} color="var(--texto-4)" style={{ flex: "none" }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
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
        </div>
        <button
          aria-label="Nueva tienda"
          onClick={() => setAgregando((v) => !v)}
          className="pulsable"
          style={{
            // El directorio se construye solo desde los dictados — agregar
            // a mano es el camino secundario, así que no compite en peso
            // visual con la barra de búsqueda ni con los botones de acento.
            flex: "none",
            width: 52,
            height: 52,
            borderRadius: "var(--radio)",
            border: "1.5px solid var(--borde)",
            color: "var(--texto-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Plus size={24} />
        </button>
      </div>

      {agregando && (
        <div style={{ flex: "none", padding: "0 20px 12px" }}>
          <div style={{ ...S.tarjeta, padding: 16, display: "flex", gap: 8 }}>
            <input
              autoFocus
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && crear()}
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
              onClick={crear}
              className="pulsable-acento"
              disabled={!nombreNuevo.trim()}
              style={{
                flex: "none",
                width: 90,
                height: 54,
                borderRadius: "var(--radio)",
                border: "1.5px solid var(--acento)",
                color: "var(--acento-300)",
                fontSize: 16,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: nombreNuevo.trim() ? 1 : 0.45,
              }}
            >
              Crear
            </button>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={guardarScroll}
        className="scroll"
        style={{
          flex: 1,
          // El hueco de abajo deja sitio a la barra de pestañas, que flota
          // encima: sin él la última tienda queda tapada.
          padding: "8px 18px 130px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {tiendas.length === 0 && (
          <Vacio
            titulo="Todavía no hay tiendas"
            sub="Se van creando solas la primera vez que nombres a alguien al dictar, o agrégala a mano con el botón +."
          />
        )}
        {tiendas.length > 0 && lista.length === 0 && (
          <Vacio titulo="Ninguna coincide" sub="Prueba con otra forma del nombre." />
        )}

        {lista.map((t) => {
          // Deuda vieja: la que de verdad se puede «dar por saldada» desde
          // acá (eso solo perdona la tabla `deudas`, nunca lo de hoy). El
          // total de arriba y el candado de borrado, en cambio, tienen que
          // contar también lo de hoy — si no, «Al día» podía mentir con una
          // entrega de hoy todavía sin cobrar.
          const saldoVieja = deudas.get(t.id!) ?? 0;
          const saldoTotal = saldos.get(t.id!) ?? 0;
          const hora = mediana(t.minutos);

          const meta: string[] = [];
          meta.push(t.pesa ? "Pesa" : "Sin pesar");
          if (t.pesa && t.precioKgDefecto) meta.push(`S/ ${(t.precioKgDefecto / 100).toFixed(2)} el kilo`);
          if (!t.pesa && t.precioPolloDefecto)
            meta.push(`S/ ${(t.precioPolloDefecto / 100).toFixed(2)} el pollo`);
          if (t.ordenRuta) meta.push(`parada ${t.ordenRuta}`);
          if (hora !== null) meta.push(horaTxt(Math.round(hora)));
          if (t.vistas === 0) meta.push("nueva");

          const abierta = editando === t.id;

          return (
            <div key={t.id} style={{ ...S.tarjeta, borderRadius: 12, padding: "14px 16px" }}>
              <button
                onClick={() => {
                  setEditando(abierta ? null : t.id!);
                  setMonto("");
                  setNombreEdit(t.nombre);
                  setBorrando(null);
                  setNoSePudo(null);
                }}
                style={{ width: "100%" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: 5,
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 600, textAlign: "left" }}>
                    {t.nombre}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      flex: "none",
                      color: saldoTotal ? "var(--rojo)" : "var(--verde)",
                    }}
                  >
                    {saldoTotal ? money(saldoTotal) : "Al día"}
                  </div>
                </div>
                <div style={{ fontSize: 14, color: "var(--texto-3)", textAlign: "left" }}>
                  {meta.join(" · ")}
                </div>
              </button>

              {/*
                Apuntar a mano lo que ya debía de antes. El día uno cada cliente
                arrastra saldos de la libreta, y sin esto la app arranca
                mintiendo sobre lo que le deben.
              */}
              {abierta && (
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 14,
                    borderTop: "1px solid var(--borde)",
                    animation: "dpup .2s ease-out",
                  }}
                >
                  {/*
                    Lo primero del panel, porque es lo que más se busca: qué te
                    ha comprado, a cómo le vienes cobrando y cuántas veces te
                    quedó debiendo. Renombrar o borrar se hace de uvas a peras.
                  */}
                  <button
                    onClick={() => abrirFicha(t.id!)}
                    className="pulsable"
                    style={{
                      width: "100%",
                      minHeight: 54,
                      marginBottom: 18,
                      borderRadius: "var(--radio)",
                      border: "1.5px solid var(--acento)",
                      background: "var(--acento-900)",
                      color: "var(--acento-200)",
                      fontSize: 16,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <History size={18} strokeWidth={2} />
                    Ver su historial
                  </button>

                  <div style={{ fontSize: 14, color: "var(--texto-3)", marginBottom: 10 }}>
                    Nombre
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                    <input
                      value={nombreEdit}
                      onChange={(ev) => setNombreEdit(ev.target.value)}
                      onKeyDown={(ev) => ev.key === "Enter" && guardarNombre(t.id!, t.nombre)}
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
                      className="pulsable-acento"
                      disabled={!nombreEdit.trim() || nombreEdit.trim() === t.nombre}
                      onClick={() => guardarNombre(t.id!, t.nombre)}
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
                        opacity: nombreEdit.trim() && nombreEdit.trim() !== t.nombre ? 1 : 0.45,
                      }}
                    >
                      Guardar
                    </button>
                  </div>

                  <div style={{ fontSize: 14, color: "var(--texto-3)", marginBottom: 10 }}>
                    Deuda de días anteriores
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={monto}
                      onChange={(ev) => setMonto(ev.target.value)}
                      inputMode="decimal"
                      placeholder="Cuánto debe"
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
                      className="pulsable-acento"
                      disabled={!Number(monto.replace(",", "."))}
                      onClick={() => {
                        const n = Number(monto.replace(",", "."));
                        if (!Number.isFinite(n) || n <= 0) return;
                        void agregarDeuda(t.id!, aCentimos(n), ayer).then(() => {
                          avisoGuardado();
                          setEditando(null);
                          setMonto("");
                        });
                      }}
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
                        opacity: Number(monto.replace(",", ".")) ? 1 : 0.45,
                      }}
                    >
                      Agregar
                    </button>
                  </div>

                  {saldoVieja > 0 && (
                    <button
                      onClick={() => {
                        void cerrarDeudas(t.id!).then(() => {
                          avisoGuardado();
                          setEditando(null);
                        });
                      }}
                      style={{
                        marginTop: 10,
                        height: 48,
                        width: "100%",
                        color: "var(--texto-3)",
                        fontSize: 15,
                        textAlign: "center",
                      }}
                    >
                      Dar por saldada su deuda de {money(saldoVieja)}
                    </button>
                  )}

                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 14,
                      borderTop: "1px solid var(--borde)",
                    }}
                  >
                    {saldoTotal > 0 ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--texto-4)",
                          textAlign: "center",
                          padding: "6px 0",
                        }}
                      >
                        Salda su deuda para poder borrarla
                      </div>
                    ) : noSePudo?.id === t.id ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--rojo)",
                          textAlign: "center",
                          padding: "6px 0",
                        }}
                      >
                        Justo ahora debe {money(noSePudo!.deuda)} de hoy — salda su cuenta en
                        Cobranza para poder borrarla.
                      </div>
                    ) : borrando === t.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, fontSize: 14, color: "var(--rojo)" }}>
                          ¿Borrar {t.nombre}? No se puede deshacer.
                        </div>
                        <button
                          onClick={() => {
                            void borrarTienda(t.id!).then((r) => {
                              setBorrando(null);
                              if (!r.ok) {
                                avisoAtencion();
                                setNoSePudo({ id: t.id!, deuda: r.deuda });
                                return;
                              }
                              avisoGuardado();
                              setEditando(null);
                            });
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
                        onClick={() => setBorrando(t.id!)}
                        style={{
                          height: 48,
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          color: "var(--texto-4)",
                          fontSize: 15,
                        }}
                      >
                        <Trash2 size={17} /> Borrar tienda
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
