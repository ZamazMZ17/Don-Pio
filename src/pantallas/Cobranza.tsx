import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search } from "lucide-react";
import { cuentasPendientes, registrarCobro } from "../db/entregas";
import { repartirPago, TOPE_REDONDEO } from "../dominio/calculo";
import { aCentimos, money } from "../lib/dinero";
import { diaCorto, type DiaISO } from "../lib/fecha";
import { avisoGuardado } from "../lib/aviso";
import { useAjuste, useHolguraMic, useMemoriaScroll } from "../lib/ganchos";
import { CLAVE_ORDEN_COBRANZA, guardarAjuste } from "../voz/ajustes";
import { normalizar, parecido } from "../tiendas/normalizar";
import { S, Vacio } from "../ui/base";
import { Teclado } from "../ui/Teclado";
import { db } from "../db/db";

/**
 * El modo del retorno. Solo las tiendas con saldo, en orden de ruta, con la
 * cuenta ya sacada: lo de hoy más lo que arrastra.
 */
export function Cobranza({
  fecha,
  onEditando,
  registrarCierre,
}: {
  fecha: DiaISO;
  /** Avisa arriba de que hay un teclado abierto, para esconder los flotantes. */
  onEditando: (abierto: boolean) => void;
  /** Deja aquí cómo cerrar el cobro, para que el botón atrás pueda hacerlo. */
  registrarCierre: MutableRefObject<(() => void) | null>;
}) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const [monto, setMonto] = useState("");
  /** El texto del buscador. En el retorno con muchas cuentas, encontrar una
   *  tienda concreta a mano es lento; escribir dos letras la trae de una. */
  const [busca, setBusca] = useState("");
  const orden = useAjuste(CLAVE_ORDEN_COBRANZA, "retorno") as "retorno" | "ruta";
  /** Qué tienda tiene el «me pagó todo» armado, esperando confirmación. */
  const [confirmando, setConfirmando] = useState<number | null>(null);
  /** Si el resto que falta se perdona como descuento en vez de quedar a deber. */
  const [perdonar, setPerdonar] = useState(false);

  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onEditando(abierta !== null || confirmando !== null);
    // Al salir de la pantalla, los flotantes vuelven.
    return () => onEditando(false);
  }, [abierta, confirmando, onEditando]);

  // Si lo dejó a medias —se distrajo, guardó el teléfono—, la confirmación no
  // se queda armada esperando un toque suelto.
  useEffect(() => {
    if (confirmando === null) return;
    const id = setTimeout(() => setConfirmando(null), 8000);
    return () => clearTimeout(id);
  }, [confirmando]);

  useEffect(() => {
    registrarCierre.current = () => {
      setAbierta(null);
      setConfirmando(null);
      setMonto("");
    };
    return () => {
      registrarCierre.current = null;
    };
  }, [registrarCierre]);

  /**
   * Sube la tarjeta para que el teclado quepa entero encima de la barra de
   * pestañas. Sin esto, las teclas de abajo (7, 8, 9, 0) quedaban debajo de la
   * barra y no había forma de pulsarlas sin desplazar a mano.
   */
  useEffect(() => {
    if (abierta === null) return;
    // Dos intentos: el primero en cuanto pinta, el segundo por si la tarjeta
    // todavía estaba creciendo. Sin `smooth`, que aquí no aporta nada y hace
    // que el segundo intento mida mientras el primero sigue en marcha.
    const subir = () => {
      const p = panel.current;
      const cont = p?.closest<HTMLElement>(".scroll");
      if (!p || !cont) return;
      const falta = p.getBoundingClientRect().bottom - cont.getBoundingClientRect().bottom;
      if (falta > 0) cont.scrollBy({ top: falta + 16 });
    };
    const a = requestAnimationFrame(subir);
    const b = setTimeout(subir, 180);
    return () => {
      cancelAnimationFrame(a);
      clearTimeout(b);
    };
  }, [abierta]);

  const cuentas = useLiveQuery(() => cuentasPendientes(fecha, orden), [fecha, orden]);
  const total = useLiveQuery(
    async () => (await db.entregas.where("fecha").equals(fecha).toArray()).length,
    [fecha],
  );

  // Antes del `if` que puede cortar el render: los hooks no pueden ser
  // condicionales. `?? 0` es solo para tener algo estable mientras `cuentas`
  // todavía no llegó — la medición de verdad ocurre después, ya con datos.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // La medida se rehace cuando cambia la cantidad de cuentas **o** el texto del
  // buscador: al filtrar, la lista visible se acorta y el hueco del micrófono
  // vuelve a decidirse.
  const holguraMic = useHolguraMic(scrollRef, 190, 230, `${cuentas?.length ?? 0}:${busca}`);
  // No perder el sitio al cobrar: la lista se rehace y volvía al principio.
  const guardarScroll = useMemoriaScroll(scrollRef, "cobranza", cuentas);

  if (!cuentas) return null;

  /*
   * El buscador solo se muestra cuando la lista es lo bastante larga como para
   * que valga la pena: con pocas cuentas se ve todo de un vistazo y una barra
   * de búsqueda solo le robaría alto al encabezado, que aquí ya carga el título,
   * el progreso y lo que falta. El umbral se mide sobre la lista completa —no la
   * filtrada— para que el buscador no desaparezca en cuanto se escribe y quede
   * solo una coincidencia.
   */
  const hayBuscador = cuentas.length > 6;
  const q = hayBuscador ? normalizar(busca) : "";
  const visibles = q
    ? cuentas.filter((c) => parecido(q, c.tienda.nombreNorm) > 0.55)
    : cuentas;

  const faltan = cuentas.reduce((a, c) => a + c.total, 0);
  /*
   * «Cobradas X de Y» cuenta entregas de hoy, no tiendas: `cuentas` mezcla
   * tiendas de solo-deuda-vieja (sin nada de hoy) con las de hoy, y una
   * tienda con dos entregas hoy es una sola fila ahí. Contar por
   * `cuentas.length` directamente infla o desinfla el progreso. Se cuenta
   * en cambio cuántas entregas de hoy siguen con saldo.
   */
  const idsPendientesHoy = new Set(
    cuentas.flatMap((c) =>
      c.entregas
        .filter((e) => e.totalCalculado - e.totalCobrado - e.descuentoRedondeo > 0)
        .map((e) => e.id!),
    ),
  );
  const cobradas = Math.max(0, (total ?? 0) - idsPendientesHoy.size);
  const deTotal = total ?? 0;
  const progreso = deTotal > 0 ? (cobradas / deTotal) * 100 : 0;

  const cerrar = () => {
    setAbierta(null);
    setConfirmando(null);
    setMonto("");
    setPerdonar(false);
  };

  const cobrar = (tiendaId: number, centimos: number, aceptarRedondeo: boolean) => {
    void registrarCobro(tiendaId, centimos, { fecha, aceptarRedondeo }).then(() => {
      avisoGuardado();
      cerrar();
    });
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{ flex: "none", padding: "6px 18px 12px", borderBottom: "1px solid var(--linea)" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 6,
          }}
        >
          <div style={{ fontSize: 19, fontWeight: 600 }}>Cobranza de retorno</div>
          <button
            onClick={() =>
              void guardarAjuste(CLAVE_ORDEN_COBRANZA, orden === "retorno" ? "ruta" : "retorno")
            }
            style={{
              fontSize: 13,
              color: "var(--acento-claro)",
              fontWeight: 500,
              // Mismo objetivo táctil de 52px que el orden de Hoy (§4). Antes
              // medía ~28px y el dedo no lo acertaba en el teléfono. El margen
              // negativo deja la fila igual de compacta.
              minHeight: 52,
              display: "inline-flex",
              alignItems: "center",
              whiteSpace: "nowrap",
              padding: "0 10px",
              margin: "-14px -6px",
              flex: "none",
            }}
          >
            {orden === "retorno" ? "Del último ⇅" : "Del primero ⇅"}
          </button>
        </div>
        <div style={{ fontSize: 14, color: "var(--texto-3)", marginBottom: 10 }}>
          Lo que deben de antes ya está sumado
        </div>
        <div
          style={{
            height: 8,
            background: "var(--linea)",
            borderRadius: 99,
            overflow: "hidden",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progreso}%`,
              background: "var(--acento)",
              borderRadius: 99,
              transition: "width 220ms ease-out",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span style={{ color: "var(--texto-3)" }}>
            Cobradas {cobradas} de {deTotal}
          </span>
          <span style={{ fontWeight: 600, color: "var(--rojo)" }}>Faltan {money(faltan)}</span>
        </div>
      </div>

      {hayBuscador && (
        <div style={{ flex: "none", padding: "12px 18px 4px" }}>
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
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={guardarScroll}
        className="scroll"
        style={{
          flex: 1,
          // Hueco para la barra de pestañas y el micrófono, que flotan encima.
          padding: "14px 18px 230px",
          // Con pocas cuentas —que ni piden scroll— ese padding nunca llega a
          // verse, y el micrófono tapa igual la última tarjeta desde el
          // primer vistazo. Con muchas, el diseño de siempre ya funciona
          // bien y esto no le toca nada (ver useHolguraMic).
          marginBottom: holguraMic,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {cuentas.length === 0 && (
          <Vacio
            titulo="No queda nada por cobrar"
            sub="Cuando registres entregas sin pagar, aparecerán aquí en el orden de tu ruta."
          />
        )}
        {cuentas.length > 0 && visibles.length === 0 && (
          <Vacio titulo="Ninguna coincide" sub="Prueba con otra forma del nombre." />
        )}

        {visibles.map((c) => {
          const estaAbierta = abierta === c.tienda.id;
          const porConfirmar = confirmando === c.tienda.id;
          const centimos = aCentimos(Number(monto.replace(",", ".")) || 0);
          const reparto = repartirPago(centimos, c.deuda, c.delDia);

          return (
            <div key={c.tienda.id} style={{ ...S.tarjeta, padding: "13px 14px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{c.tienda.nombre}</div>
                  {/* Ya pagó una parte: por eso está aquí abajo, esperando el resto. */}
                  {c.tocada && (
                    <div style={{ fontSize: 12, color: "var(--verde)", flex: "none" }}>ya abonó</div>
                  )}
                </div>
                {c.tienda.ordenRuta > 0 && (
                  <div style={{ fontSize: 12, color: "var(--texto-4)", flex: "none" }}>
                    parada {c.tienda.ordenRuta}
                  </div>
                )}
              </div>

              {c.delDia > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 14,
                    color: "var(--texto-3)",
                    marginBottom: 3,
                  }}
                >
                  <span>De hoy</span>
                  <span>{money(c.delDia)}</span>
                </div>
              )}
              {c.deuda > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 14,
                    color: "var(--ambar)",
                    marginBottom: 3,
                  }}
                >
                  <span>
                    Deuda{c.deudaDesde ? ` del ${diaCorto(c.deudaDesde).toLowerCase()}` : ""}
                  </span>
                  <span>{money(c.deuda)}</span>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  paddingTop: 10,
                  marginTop: 8,
                  borderTop: "1px solid var(--borde)",
                }}
              >
                <span style={{ ...S.rotulo, fontSize: 13 }}>A cobrar</span>
                <span style={{ fontSize: 26, fontWeight: 700 }}>{money(c.total)}</span>
              </div>

              {!estaAbierta && !porConfirmar && (
                <>
                  <button
                    className="pulsable-acento"
                    onClick={() => setConfirmando(c.tienda.id!)}
                    style={{
                      marginTop: 12,
                      height: 52,
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "var(--radio)",
                      border: "1.5px solid var(--acento)",
                      color: "var(--acento-300)",
                      fontSize: 18,
                      fontWeight: 600,
                    }}
                  >
                    Me pagó todo
                  </button>
                  <button
                    className="pulsable"
                    onClick={() => {
                      setAbierta(c.tienda.id!);
                      setMonto("");
                    }}
                    style={{
                      marginTop: 8,
                      height: 46,
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "var(--radio)",
                      border: "1.5px solid var(--borde)",
                      color: "var(--texto-2)",
                      fontSize: 16,
                    }}
                  >
                    Me dio otra cantidad
                  </button>
                </>
              )}

              {/*
                Cobrar de un toque es demasiado fácil de hacer sin querer con
                el teléfono en una mano, y un cobro falso descuadra la caja al
                final del día. Se pregunta, con el monto delante, y se desarma
                solo a los 8 segundos por si lo dejó a medias.
              */}
              {porConfirmar && (
                <div style={{ marginTop: 14, animation: "dpup .18s ease-out" }}>
                  <div
                    style={{
                      fontSize: 16,
                      color: "var(--texto-2)",
                      textAlign: "center",
                      marginBottom: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    ¿{c.tienda.nombre} te pagó los <b>{money(c.total)}</b> completos?
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="pulsable"
                      onClick={() => setConfirmando(null)}
                      style={{
                        flex: 1,
                        height: 58,
                        borderRadius: "var(--radio)",
                        border: "1.5px solid var(--borde)",
                        color: "var(--texto-2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 17,
                      }}
                    >
                      No
                    </button>
                    <button
                      className="pulsable-acento"
                      // `c.total` ya viene redondeado a monedas de 10 céntimos
                      // (`aCobrar`): cuando él dice «me pagó todo», paga eso, y
                      // el resto por debajo de la moneda —los pocos céntimos que
                      // ninguna moneda puede cubrir— es el redondeo a favor del
                      // cliente que el modelo ya da por perdonado. Con
                      // `aceptarRedondeo` se registra como descuento en vez de
                      // quedar como una deuda de S/ 0.05 imposible de cobrar,
                      // que reaparecía cada día en esta misma lista con «A
                      // cobrar S/ 0.00».
                      onClick={() => cobrar(c.tienda.id!, c.total, true)}
                      style={{
                        flex: 1.5,
                        height: 58,
                        borderRadius: "var(--radio)",
                        border: "1.5px solid var(--acento)",
                        background: "var(--acento-900)",
                        color: "var(--acento-200)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        fontWeight: 600,
                      }}
                    >
                      Sí, cobrado
                    </button>
                  </div>
                </div>
              )}

              {estaAbierta && (
                <div
                  ref={panel}
                  style={{
                    marginTop: 14,
                    paddingTop: 16,
                    borderTop: "1px solid var(--borde)",
                    animation: "dpup .2s ease-out",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 10,
                      marginBottom: 14,
                    }}
                  >
                    <span style={{ ...S.rotulo, fontSize: 13 }}>Cuánto te dio</span>
                    <span
                      style={{
                        fontSize: 36,
                        fontWeight: 700,
                        lineHeight: 1,
                        letterSpacing: -1,
                        color: monto ? "var(--texto)" : "var(--texto-5)",
                      }}
                    >
                      S/ {monto || "0"}
                    </span>
                  </div>

                  {/* El desglose en vivo: qué pasa con esa plata antes de tocar nada. */}
                  <div
                    style={{
                      background: "var(--hundido)",
                      borderRadius: "var(--radio)",
                      padding: "12px 14px",
                      marginBottom: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {c.deuda > 0 && (
                      <Linea
                        label="Se paga primero la deuda"
                        valor={money(reparto.aDeuda)}
                        color="var(--ambar)"
                      />
                    )}
                    <Linea
                      label="Va a lo de hoy"
                      valor={money(reparto.aHoy)}
                      color="var(--verde)"
                    />
                    {reparto.restante > 0 && (
                      <Linea
                        label={perdonar ? "Se le descuenta" : "Le queda debiendo"}
                        valor={money(reparto.restante)}
                        color={perdonar ? "var(--acento-claro)" : "var(--rojo)"}
                      />
                    )}
                    {reparto.vuelto > 0 && (
                      <Linea
                        label="Te dio de más"
                        valor={money(reparto.vuelto)}
                        color="var(--acento-claro)"
                      />
                    )}
                    {centimos > 0 && reparto.restante === 0 && reparto.vuelto === 0 && (
                      <Linea label="Queda al día" valor="Sin saldo" color="var(--verde)" />
                    )}
                  </div>

                  {/*
                    A veces el que falta no es una deuda: un ala vino mal y le
                    baja un sol. Sin esto, ese sol se le quedaba colgado al
                    cliente para siempre y él tenía que perseguirlo.
                  */}
                  {reparto.restante > 0 && reparto.restante <= TOPE_REDONDEO && (
                    <button
                      onClick={() => setPerdonar(!perdonar)}
                      role="switch"
                      aria-checked={perdonar}
                      className="pulsable"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        width: "100%",
                        marginBottom: 14,
                        padding: "10px 12px",
                        borderRadius: "var(--radio)",
                        border: "1.5px solid var(--borde)",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          fontSize: 15,
                          color: "var(--texto-2)",
                          textAlign: "left",
                          lineHeight: 1.4,
                        }}
                      >
                        Los {money(reparto.restante)} que faltan son descuento, no deuda
                      </span>
                      <span
                        style={{
                          width: 50,
                          height: 30,
                          borderRadius: 99,
                          padding: 3,
                          flex: "none",
                          display: "flex",
                          background: perdonar ? "var(--acento-700)" : "var(--borde)",
                          justifyContent: perdonar ? "flex-end" : "flex-start",
                          transition: "background-color 140ms",
                        }}
                      >
                        <span
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            background: "var(--texto)",
                          }}
                        />
                      </span>
                    </button>
                  )}

                  <Teclado valor={monto} onCambio={setMonto} />

                  <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                    <button
                      className="pulsable"
                      onClick={cerrar}
                      style={{
                        flex: 1,
                        height: 58,
                        borderRadius: "var(--radio)",
                        border: "1.5px solid var(--borde)",
                        color: "var(--texto-2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 17,
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      className="pulsable-acento"
                      disabled={centimos <= 0}
                      onClick={() => cobrar(c.tienda.id!, centimos, perdonar)}
                      style={{
                        flex: 1.5,
                        height: 58,
                        borderRadius: "var(--radio)",
                        border: "1.5px solid var(--acento)",
                        background: "var(--acento-900)",
                        color: "var(--acento-200)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        fontWeight: 600,
                        opacity: centimos <= 0 ? 0.45 : 1,
                      }}
                    >
                      {perdonar ? "Cobrar y descontar" : "Registrar cobro"}
                    </button>
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

function Linea({ label, valor, color }: { label: string; valor: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 15 }}>
      <span style={{ color: "var(--texto-3)" }}>{label}</span>
      <span style={{ fontWeight: 600, color }}>{valor}</span>
    </div>
  );
}
