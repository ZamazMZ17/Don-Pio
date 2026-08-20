import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, X } from "lucide-react";
import { cuentasDelDia, cuentasPendientes, registrarCobro } from "../db/entregas";
import { descripcionEntrega, repartirPago, TOPE_REDONDEO } from "../dominio/calculo";
import { aCentimos, money } from "../lib/dinero";
import { diaCorto, horaTxt, type DiaISO } from "../lib/fecha";
import { avisoGuardado } from "../lib/aviso";
import { useAjuste, useMemoriaScroll } from "../lib/ganchos";
import { CLAVE_MODO_COBRANZA, CLAVE_ORDEN_COBRANZA, guardarAjuste } from "../voz/ajustes";
import { mediana } from "../tiendas/emparejar";
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
  /**
   * "deudas": solo lo que falta por cobrar, desaparece al pagar — la vista de
   * siempre. "ruta": todas las tiendas de hoy en orden real, cobradas o no,
   * sin desaparecer — para ir tocando de vuelta sin que el scroll salte.
   */
  const modo = useAjuste(CLAVE_MODO_COBRANZA, "deudas") as "deudas" | "ruta";
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
  // Solo se pide cuando hace falta: en modo "deudas" no se usa para nada.
  const cuentasRuta = useLiveQuery(
    () => (modo === "ruta" ? cuentasDelDia(fecha) : Promise.resolve([])),
    [fecha, modo],
  );
  const total = useLiveQuery(
    async () => (await db.entregas.where("fecha").equals(fecha).toArray()).length,
    [fecha],
  );
  const listaActual = modo === "ruta" ? cuentasRuta : cuentas;

  // Antes del `if` que puede cortar el render: los hooks no pueden ser
  // condicionales. `?? 0` es solo para tener algo estable mientras `cuentas`
  // todavía no llegó — la medición de verdad ocurre después, ya con datos.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // La medida se rehace cuando cambia la cantidad de cuentas **o** el texto del
  // buscador: al filtrar, la lista visible se acorta y el hueco del micrófono
  // vuelve a decidirse.
  // No perder el sitio al cobrar: la lista se rehace y volvía al principio.
  // Clave separada por modo: son dos recorridos de scroll distintos, como
  // Agenda/Ruta en Hoy.
  const guardarScroll = useMemoriaScroll(scrollRef, `cobranza-${modo}`, listaActual);

  /*
   * Acaba de repartir y viene a cobrar: si la última entrega es de hace pocos
   * minutos, el scroll salta directo a su tarjeta y la resalta un momento, en
   * vez de dejarlo buscar entre 50 tiendas la que acaba de dejar. Solo si esa
   * tienda todavía tiene saldo —si ya no está en `cuentas`, es que ya cobró y no
   * hay nada que resaltar.
   *
   * Va **después** de `useMemoriaScroll`: los dos ajustan el scroll al montar y
   * este tiene que ganar. La memoria queda como respaldo cuando no hay entrega
   * reciente (vuelve del cierre, de Tiendas…) y no se toca el scroll.
   *
   * El salto se reafirma durante una ventana corta tras montar y también cuando
   * cambia `orden`: `useAjuste` arranca con el orden por defecto y resuelve el
   * guardado un frame después, así que la lista se reordena una vez —si fijáramos
   * el salto de una sola vez, aterrizaría sobre ese primer orden transitorio y
   * quedaría descuadrado al reordenarse. Pasada la ventana, el dedo manda: un
   * cobro posterior ya no lo devuelve a la tarjeta reciente.
   */
  const tarjetasRef = useRef<Map<number, HTMLElement>>(new Map());
  const montaje = useRef(Date.now());
  const resaltadoPuesto = useRef(false);
  const [resaltada, setResaltada] = useState<number | null>(null);

  useLayoutEffect(() => {
    // Solo en la vista de deudas: en Ruta las tiendas no se mueven ni
    // desaparecen, así que no hace falta saltar a ninguna.
    if (modo !== "deudas") return;
    if (!cuentas || cuentas.length === 0) return;
    // Solo en los primeros instantes tras entrar, mientras el orden se asienta.
    if (Date.now() - montaje.current > 1500) return;

    let reciente: { tiendaId: number; creada: number } | null = null;
    for (const c of cuentas) {
      for (const e of c.entregas) {
        if (!reciente || e.creada > reciente.creada) {
          reciente = { tiendaId: c.tienda.id!, creada: e.creada };
        }
      }
    }
    // Hace más de 3 minutos ya no es «la que acaba de dejar»: no salta.
    if (!reciente || Date.now() - reciente.creada > 3 * 60 * 1000) return;

    const el = tarjetasRef.current.get(reciente.tiendaId);
    const cont = scrollRef.current;
    if (!el || !cont) return;
    const dif = el.getBoundingClientRect().top - cont.getBoundingClientRect().top;
    cont.scrollTop += dif - 12;
    if (!resaltadoPuesto.current) {
      resaltadoPuesto.current = true;
      setResaltada(reciente.tiendaId);
    }
  }, [cuentas, orden, modo]);

  // El resaltado se apaga solo; se pone al saltar y dura lo justo para ubicarla.
  useEffect(() => {
    if (resaltada === null) return;
    const t = setTimeout(() => setResaltada(null), 2600);
    return () => clearTimeout(t);
  }, [resaltada]);

  if (!cuentas || !listaActual) return null;

  /*
   * El buscador solo se muestra cuando la lista es lo bastante larga como para
   * que valga la pena: con pocas cuentas se ve todo de un vistazo y una barra
   * de búsqueda solo le robaría alto al encabezado, que aquí ya carga el título,
   * el progreso y lo que falta. El umbral se mide sobre la lista completa —no la
   * filtrada— para que el buscador no desaparezca en cuanto se escribe y quede
   * solo una coincidencia.
   */
  const hayBuscador = listaActual.length > 6;
  const q = hayBuscador ? normalizar(busca) : "";
  const visibles = q
    ? listaActual.filter((c) => parecido(q, c.tienda.nombreNorm) > 0.55)
    : listaActual;

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
        .filter((e) =>
          e.totalCalculado - e.totalCobrado - e.descuentoRedondeo > 0 ||
          (e.totalCalculado === 0 && e.estadoPago === "pendiente"),
        )
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
          {modo === "deudas" && (
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
          )}
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

      {/*
        Deudas (solo lo que falta, desaparece al pagar) o Ruta (todas las
        tiendas de hoy en orden real, cobradas o no — para ir tocando de
        vuelta sin que el scroll salte). Mismo patrón que Agenda/Ruta en Hoy.
      */}
      <div style={{ flex: "none", padding: "10px 18px 0", display: "flex", gap: 8 }}>
        <ModoBtn activo={modo === "deudas"} onClick={() => void guardarAjuste(CLAVE_MODO_COBRANZA, "deudas")}>
          Deudas
        </ModoBtn>
        <ModoBtn activo={modo === "ruta"} onClick={() => void guardarAjuste(CLAVE_MODO_COBRANZA, "ruta")}>
          Ruta
        </ModoBtn>
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
            {busca && (
              <button
                onClick={() => setBusca("")}
                aria-label="Limpiar búsqueda"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  // Mismo truco de zona táctil de 52px que el botón de orden
                  // (§4): el margen negativo agranda lo que responde al dedo
                  // sin agrandar la barra ni empujar al buscador.
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
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={guardarScroll}
        className="scroll"
        style={{
          flex: 1,
          // Solo el hueco de la barra de pestañas: aquí ya no flota el
          // micrófono, así que no hace falta reservarle sitio ni medir nada.
          padding: "14px 18px 130px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {listaActual.length === 0 && (
          <Vacio
            titulo={modo === "ruta" ? "Todavía no hay nada hoy" : "No queda nada por cobrar"}
            sub={
              modo === "ruta"
                ? "Cuando entregues o cobres algo, la tienda aparece aquí en orden de ruta."
                : "Cuando registres entregas sin pagar, aparecerán aquí en el orden de tu ruta."
            }
          />
        )}
        {listaActual.length > 0 && visibles.length === 0 && (
          <Vacio titulo="Ninguna coincide" sub="Prueba con otra forma del nombre." />
        )}

        {visibles.map((c) => {
          const estaAbierta = abierta === c.tienda.id;
          const porConfirmar = confirmando === c.tienda.id;
          const centimos = aCentimos(Number(monto.replace(",", ".")) || 0);
          const reparto = repartirPago(centimos, c.deuda, c.delDia);

          // Qué se le está cobrando de hoy: los datos de la entrega, con su
          // precio, para no cobrar a ciegas. Solo las que aún deben algo; si
          // dejó dos veces, se resume. Sin nada de hoy, la línea «Deuda del X»
          // de abajo ya dice que es de un día anterior.
          const pendientesHoy = c.entregas.filter(
            (e) =>
              e.totalCalculado - e.totalCobrado - e.descuentoRedondeo > 0 ||
              (e.totalCalculado === 0 && e.estadoPago === "pendiente"),
          );
          const descHoy =
            pendientesHoy.length === 1
              ? descripcionEntrega(pendientesHoy[0])
              : pendientesHoy.length > 1
                ? `${pendientesHoy.length} entregas de hoy`
                : null;

          const resalta = resaltada === c.tienda.id;

          // Vista Ruta: refleja Hoy Ruta. La tienda tiene tres estados.
          if (c.pagada) {
            // Sin ninguna actividad hoy: ni entrega, ni deuda vieja, ni
            // cobro. Se ve como en Hoy Ruta antes de tocarla — círculo
            // hueco y su parada/hora. Solo aparece en modo Ruta; en Deudas
            // ya se descartó de la lista.
            const sinActividad = c.entregas.length === 0 && c.cobradoHoy === 0;
            if (sinActividad) {
              const hora = mediana(c.tienda.minutos);
              const meta: string[] = [];
              if (c.tienda.ordenRuta) meta.push(`parada ${c.tienda.ordenRuta}`);
              if (hora !== null) meta.push(horaTxt(Math.round(hora)));
              return (
                <div
                  key={c.tienda.id}
                  style={{
                    ...S.tarjeta,
                    padding: "13px 14px",
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
                      background: "transparent",
                      border: "2px solid var(--texto-5)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.2 }}>
                      {c.tienda.nombre}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--texto-4)", marginTop: 2 }}>
                      {meta.length ? meta.join(" · ") : "sin ruta todavía"}
                    </div>
                  </div>
                </div>
              );
            }
            // Ya cobrada: entregó y/o cobró algo, y no queda nada por cobrar.
            // Se queda en su sitio marcada, en vez de desaparecer.
            return (
              <div
                key={c.tienda.id}
                style={{
                  ...S.tarjeta,
                  padding: "13px 14px",
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  opacity: 0.62,
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
                  <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.2 }}>
                    {c.tienda.nombre}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--texto-3)", marginTop: 2 }}>
                    {c.entregas.length > 0 ? descripcionEntrega(c.entregas[0]) : "solo cobro"}
                  </div>
                </div>
                <div style={{ textAlign: "right", flex: "none" }}>
                  <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.2 }}>
                    {money(c.cobradoHoy)}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 2, color: "var(--verde)" }}>cobrado</div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={c.tienda.id}
              ref={(el) => {
                if (el) tarjetasRef.current.set(c.tienda.id!, el);
                else tarjetasRef.current.delete(c.tienda.id!);
              }}
              style={{
                ...S.tarjeta,
                padding: "13px 14px",
                // Un momento tras el salto, para que la ubique de un vistazo.
                borderColor: resalta ? "var(--acento)" : "var(--linea)",
                background: resalta ? "var(--acento-900)" : "var(--superficie)",
                transition: "border-color .5s ease-out, background-color .5s ease-out",
              }}
            >
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

              {descHoy && (
                <div style={{ fontSize: 13, color: "var(--texto-3)", marginTop: -3, marginBottom: 8 }}>
                  {descHoy}
                </div>
              )}

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

              {estaAbierta ? (
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    paddingTop: 10,
                    marginTop: 8,
                    borderTop: "1px solid var(--borde)",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <span style={{ ...S.rotulo, fontSize: 13, display: "block" }}>
                      {c.tieneSinPesar && c.total === 0 ? "Por cobrar" : "A cobrar"}
                    </span>
                    {c.tieneSinPesar && c.total === 0 ? (
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ambar)", marginTop: 4 }}>
                        Sin precio aún
                      </div>
                    ) : (
                      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{money(c.total)}</div>
                    )}
                  </div>
                  <div style={{ flex: 1, textAlign: "right" }}>
                    <span style={{ ...S.rotulo, fontSize: 13, display: "block" }}>Cuánto te dio</span>
                    <div
                      style={{
                        fontSize: 26,
                        fontWeight: 700,
                        lineHeight: 1,
                        letterSpacing: -1,
                        marginTop: 2,
                        color: monto ? "var(--texto)" : "var(--texto-5)",
                      }}
                    >
                      S/ {monto || "0"}
                    </div>
                  </div>
                </div>
              ) : (
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
                  <span style={{ ...S.rotulo, fontSize: 13 }}>
                    {c.tieneSinPesar && c.total === 0 ? "Por cobrar" : "A cobrar"}
                  </span>
                  {c.tieneSinPesar && c.total === 0 ? (
                    <span style={{ fontSize: 16, fontWeight: 600, color: "var(--ambar)" }}>Sin precio aún</span>
                  ) : (
                    <span style={{ fontSize: 26, fontWeight: 700 }}>{money(c.total)}</span>
                  )}
                </div>
              )}

              {!estaAbierta && !porConfirmar && (
                <>
                  {!c.tieneSinPesar && (
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
                  )}
                  <button
                    className={c.tieneSinPesar ? "pulsable-acento" : "pulsable"}
                    onClick={() => {
                      setAbierta(c.tienda.id!);
                      setMonto("");
                    }}
                    style={{
                      marginTop: c.tieneSinPesar ? 12 : 8,
                      height: c.tieneSinPesar ? 52 : 46,
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "var(--radio)",
                      border: `1.5px solid var(${c.tieneSinPesar ? "--acento" : "--borde"})`,
                      color: `var(${c.tieneSinPesar ? "--acento-300" : "--texto-2"})`,
                      fontSize: c.tieneSinPesar ? 18 : 16,
                      fontWeight: c.tieneSinPesar ? 600 : undefined,
                    }}
                  >
                    {c.tieneSinPesar ? "Cobrar" : "Me dio otra cantidad"}
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
                    {(!c.tieneSinPesar || c.delDia > 0) && (
                      <Linea
                        label="Va a lo de hoy"
                        valor={money(reparto.aHoy)}
                        color="var(--verde)"
                      />
                    )}
                    {reparto.restante > 0 && (
                      <Linea
                        label={perdonar ? "Se le descuenta" : "Le queda debiendo"}
                        valor={money(reparto.restante)}
                        color={perdonar ? "var(--acento-claro)" : "var(--rojo)"}
                      />
                    )}
                    {reparto.vuelto > 0 && (
                      <Linea
                        label={c.tieneSinPesar ? "A la entrega sin pesar" : "Te dio de más"}
                        valor={money(reparto.vuelto)}
                        color={c.tieneSinPesar ? "var(--verde)" : "var(--acento-claro)"}
                      />
                    )}
                    {centimos > 0 && reparto.restante === 0 && reparto.vuelto === 0 && !c.tieneSinPesar && (
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

/** Un botón del interruptor Deudas / Ruta. Objetivo táctil de 52px. */
function ModoBtn({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="pulsable"
      style={{
        flex: 1,
        height: 44,
        borderRadius: "var(--radio)",
        border: activo ? "1.5px solid var(--acento)" : "1.5px solid var(--borde)",
        background: activo ? "var(--acento-900)" : "transparent",
        color: activo ? "var(--acento-200)" : "var(--texto-3)",
        fontSize: 15,
        fontWeight: activo ? 600 : 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}
