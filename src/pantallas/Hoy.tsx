import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Entrega, type Tienda } from "../db/db";
import { leerJornada, resumenDe } from "../db/jornada";
import { deudasPorTienda } from "../db/tiendas";
import { descripcionEntrega, estadoDe, COLOR_ESTADO, TEXTO_ESTADO } from "../dominio/calculo";
import { mediana } from "../tiendas/emparejar";
import { diaCorto, diaLargo, horaTxt, type DiaISO } from "../lib/fecha";
import { money } from "../lib/dinero";
import { useAjuste, useHolguraMic } from "../lib/ganchos";
import { Plus } from "lucide-react";
import { guardarAjuste, CLAVE_ORDEN, CLAVE_MODO_HOY } from "../voz/ajustes";
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
/**
 * Dónde estaba el scroll de cada modo, por si sale a otra pantalla y vuelve.
 * Vive fuera del componente a propósito: así sobrevive a que Hoy se
 * desmonte al abrir el Detalle y se vuelva a montar al regresar, que era lo
 * que devolvía la lista al principio de todo. Uno por modo: la agenda y la
 * ruta tienen su propio recorrido.
 */
const memoriaScroll: Record<string, number> = { agenda: 0, ruta: 0 };

export function Hoy({
  fecha,
  abrir,
  abrirStock,
  registrarEnTienda,
}: {
  fecha: DiaISO;
  abrir: (entregaId: number) => void;
  abrirStock: () => void;
  /** Abre la tarjeta de entrega tocando una tienda en la vista de ruta. */
  registrarEnTienda: (tienda: Tienda) => void;
}) {
  const orden = useAjuste(CLAVE_ORDEN, "ruta");
  const modo = useAjuste(CLAVE_MODO_HOY, "agenda");

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
    const soloCobro = new Map<number, { monto: number; creada: number }>();
    for (const p of pagos) {
      if (conEntrega.has(p.tiendaId)) continue;
      const prev = soloCobro.get(p.tiendaId);
      soloCobro.set(p.tiendaId, {
        monto: (prev?.monto ?? 0) + p.monto,
        // El más reciente de sus cobros de hoy: sirve para colocarlo en el
        // mismo orden que las entregas, como una actividad más del día.
        creada: Math.max(prev?.creada ?? 0, p.creada),
      });
    }

    return { resumen, entregas, tiendas, porId, deudas, jornada, soloCobro };
  }, [fecha]);

  // Antes del `if` que puede cortar el render: los hooks no pueden ser
  // condicionales. `?? 0` es solo para tener algo estable mientras `datos`
  // todavía no llegó — la medición de verdad ocurre después, ya con datos.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const holguraMic = useHolguraMic(
    scrollRef,
    190,
    250,
    `${modo}:${(datos?.entregas.length ?? 0) + (datos?.soloCobro.size ?? 0)}:${datos?.tiendas.length ?? 0}`,
  );

  // Devolver el scroll a donde estaba: al montar (volviendo de otra pantalla)
  // y al cambiar de modo. Solo cuando ya hay datos, o mediría sobre el vacío.
  // No se re-ejecuta en cada actualización de `datos` a propósito: mientras
  // sigue montado, el propio nodo conserva su scroll y no hay que tocarlo —
  // pisarlo pelearía con el dedo cuando llega un cobro nuevo.
  const hayDatos = !!datos;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = memoriaScroll[modo] ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, hayDatos]);

  if (!datos) return null;
  const { resumen, entregas, tiendas, porId, deudas, jornada, soloCobro } = datos;

  /*
   * Entregas y cobros sueltos van en **una sola lista ordenada**. Antes los
   * cobros —pasar solo a cobrar lo de días anteriores, sin dejar nada hoy— se
   * pintaban siempre fijos arriba, y el botón de orden solo movía las entregas
   * de abajo: se veía primero lo ya cobrado y recién después lo entregado hoy,
   * dijera «del primero» o «del último». Ahora todo comparte el mismo orden,
   * por `creada` —cuándo pasó—, que para una entrega es su secuencia de ruta y
   * para un cobro es cuándo lo cobró.
   */
  type Fila =
    | { tipo: "entrega"; e: (typeof entregas)[number]; creada: number; falta: number }
    | { tipo: "cobro"; tiendaId: number; monto: number; creada: number };
  const filas: Fila[] = [
    ...entregas.map(
      (e): Fila => ({
        tipo: "entrega",
        e,
        creada: e.creada,
        falta: e.totalCalculado - e.totalCobrado - e.descuentoRedondeo,
      }),
    ),
    ...[...soloCobro.entries()].map(
      ([tiendaId, { monto, creada }]): Fila => ({ tipo: "cobro", tiendaId, monto, creada }),
    ),
  ];
  const faltaDe = (f: Fila) => (f.tipo === "entrega" ? f.falta : 0);
  filas.sort((a, b) => {
    // «Por pendientes»: primero lo que más falta cobrar. Un cobro suelto ya no
    // tiene nada pendiente, así que cae al fondo, con las entregas ya pagadas.
    if (orden === "pendientes") return faltaDe(b) - faltaDe(a) || b.creada - a.creada;
    // `retorno`: del último al primero, como cuando vuelve cobrando.
    return orden === "retorno" ? b.creada - a.creada : a.creada - b.creada;
  });

  const SIGUIENTE = { ruta: "retorno", retorno: "pendientes", pendientes: "ruta" } as const;
  const ETIQUETA = {
    ruta: "Por ruta ⇅",
    retorno: "Del último ⇅",
    pendientes: "Por pendientes ⇅",
  } as const;

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
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img
              src={logo}
              alt=""
              className="logo-marca"
              width={72}
              height={72}
              style={{ flex: "none", objectFit: "contain", marginTop: -6, marginBottom: -6 }}
            />
            <div
              style={{
                fontFamily: "var(--fuente-titulo)",
                fontSize: 27,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              {diaCorto(fecha)}
            </div>
          </div>
          {/*
            «jornada» con un punto: verde mientras está abierta, rojo cuando ya
            se cerró. Se lee de un vistazo y sin leer, que es de lo que se trata
            con el teléfono en una mano.
          */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, flex: "none" }}>
            <span style={{ fontSize: 14, color: "var(--texto-3)" }}>jornada</span>
            <span
              aria-label={`jornada ${jornada.estado}`}
              style={{
                width: 11,
                height: 11,
                borderRadius: "50%",
                flex: "none",
                background:
                  jornada.estado === "cerrada" ? "var(--rojo)" : "var(--verde)",
              }}
            />
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
            // `stretch` (el valor por defecto, puesto explícito): el bloque
            // de la izquierda toma el alto de la columna de la derecha —que
            // es la más alta, con piernas/pechos/tiendas apilados— y adentro
            // se centra de verdad, no solo se pega arriba con espacio vacío
            // debajo.
            alignItems: "stretch",
            gap: 14,
            marginBottom: 14,
            width: "100%",
          }}
        >
          {resumen.stockPollos > 0 ? (
            // `flex: 1` + `justifyContent: center`: reparte el espacio que le
            // deja el bloque de la derecha (marginLeft: auto) y centra el par
            // ahí adentro, en vez de quedarse pegado al borde izquierdo.
            // `marginTop` en vez de centrarlo en todo el alto de la fila: con
            // la columna de la derecha casi de la misma altura, centrarlo del
            // todo casi no se notaba — así queda a la altura de «pechos»,
            // la línea de en medio.
            <div
              style={{
                display: "flex",
                flex: 1,
                justifyContent: "center",
                alignItems: "flex-start",
                gap: 10,
                marginTop: 14,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ ...S.rotulo, fontSize: 12, letterSpacing: 0.9 }}>Salí con</div>
                <div
                  style={{ fontSize: 36, fontWeight: 600, color: "var(--verde)", lineHeight: 1.1 }}
                >
                  {resumen.stockPollos}
                </div>
              </div>
              {/* A la altura de los números, no de los rótulos. */}
              <div style={{ fontSize: 26, color: "var(--texto-5)", marginTop: 16 }}>→</div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ ...S.rotulo, fontSize: 12, letterSpacing: 0.9 }}>Me quedan</div>
                <div
                  style={{ fontSize: 36, fontWeight: 700, color: "var(--ambar)", lineHeight: 1.1 }}
                >
                  {resumen.restantePollos}
                </div>
              </div>
            </div>
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
              {(() => {
                const piernas =
                  resumen.stockPollos > 0 ? resumen.restantePiernas : resumen.repartidoPiernas;
                return `${piernas} ${piernas === 1 ? "pierna" : "piernas"}`;
              })()}
            </div>
            {/* Siempre visible, igual que piernas — no solo cuando hay
                pollos partidos, para que se vea de un vistazo que la
                cuenta sigue en cero y no que falta por cargar. */}
            <div>
              {resumen.repartidoPechos} {resumen.repartidoPechos === 1 ? "pecho" : "pechos"}
            </div>
            <div>
              {resumen.tiendas} {resumen.tiendas === 1 ? "tienda" : "tiendas"}
            </div>
          </div>
        </button>

      </div>

      {/*
        Agenda (lo ya hecho) o Ruta (todos los clientes, para ir tocando). Fija
        arriba, siempre visible: no se va con el scroll de la lista.
      */}
      <div style={{ flex: "none", padding: "10px 18px 2px", display: "flex", gap: 8 }}>
        <ModoBtn activo={modo === "agenda"} onClick={() => void guardarAjuste(CLAVE_MODO_HOY, "agenda")}>
          Agenda
        </ModoBtn>
        <ModoBtn activo={modo === "ruta"} onClick={() => void guardarAjuste(CLAVE_MODO_HOY, "ruta")}>
          Ruta
        </ModoBtn>
      </div>

      {/* Lista tipo agenda */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          memoriaScroll[modo] = e.currentTarget.scrollTop;
        }}
        className="scroll"
        style={{
          flex: 1,
          // Hueco para la barra de pestañas y el micrófono, que flotan encima:
          // sin él, el micrófono tapa el monto de la última entrega.
          padding: "14px 18px 250px",
          // Con pocas entregas —que ni piden scroll— ese padding de abajo
          // nunca llega a verse, y el micrófono tapa igual la última tarjeta
          // desde el primer vistazo. Con muchas, el diseño de siempre ya
          // funciona bien y esto no le toca nada (ver useHolguraMic).
          marginBottom: holguraMic,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {modo === "ruta" && (
          <RutaLista
            tiendas={tiendas}
            entregas={entregas}
            deudas={deudas}
            onTocar={registrarEnTienda}
            abrir={abrir}
          />
        )}
        {modo === "agenda" && (
          <>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 4px 2px",
          }}
        >
          <div style={{ ...S.rotulo, fontSize: 13 }}>Hoy · {filas.length}</div>
          <button
            onClick={() =>
              void guardarAjuste(CLAVE_ORDEN, SIGUIENTE[orden as keyof typeof SIGUIENTE] ?? "ruta")
            }
            style={{
              fontSize: 13,
              color: "var(--acento-claro)",
              fontWeight: 500,
              // Zona táctil de 52px (§4: nada táctil por debajo de eso). Con
              // `padding: 6` medía ~28px de alto y en el teléfono el dedo no lo
              // acertaba —«no responde al tocar»—, aunque un clic al centro en
              // el navegador siempre le daba. El margen negativo mantiene la
              // fila compacta: el área que se toca crece, el dibujo no.
              minHeight: 52,
              display: "inline-flex",
              alignItems: "center",
              whiteSpace: "nowrap",
              padding: "0 10px",
              margin: "-14px -6px",
            }}
          >
            {ETIQUETA[orden as keyof typeof ETIQUETA] ?? "Por ruta ⇅"}
          </button>
        </div>


        {filas.length === 0 && (
          <Vacio
            titulo="Todavía no has entregado nada hoy"
            sub="Pulsa el micrófono y dile a quién le dejaste, cuántos pollos y cuánto pesaron."
          />
        )}

        {filas.map((fila) => {
          if (fila.tipo === "cobro") {
            const { tiendaId, monto } = fila;
            return (
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
                  <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}>
                    {money(monto)}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 3, color: "var(--verde)" }}>Cobrado</div>
                </div>
              </div>
            );
          }
          const e = fila.e;
          const tienda = porId.get(e.tiendaId);
          const cobrado = e.totalCobrado + e.descuentoRedondeo;
          const estado = estadoDe(e.totalCalculado, cobrado);
          const deuda = deudas.get(e.tiendaId) ?? 0;

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
                <div style={{ fontSize: 14, color: "var(--texto-3)" }}>{descripcionEntrega(e)}</div>
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

        {filas.length > 0 && (
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
          </>
        )}
      </div>
    </div>
  );
}

/** Un botón del interruptor Agenda / Ruta. Objetivo táctil de 52px. */
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

/**
 * La vista de ruta: **todos** los clientes en el orden en que se suele repartir,
 * para tocar cada uno y registrarle la entrega sin dictar. Los que ya se
 * atendieron hoy quedan marcados, en su sitio de siempre: la lista no se
 * reordena al registrar, para que el dedo no pierda dónde iba.
 */
function RutaLista({
  tiendas,
  entregas,
  deudas,
  onTocar,
  abrir,
}: {
  tiendas: Tienda[];
  entregas: Entrega[];
  deudas: Map<number, number>;
  /** Tocar una tienda **sin** entrega hoy: abre la tarjeta para registrarla. */
  onTocar: (t: Tienda) => void;
  /** Tocar una **ya entregada**: abre su Detalle para editar cantidades y precio. */
  abrir: (entregaId: number) => void;
}) {
  // Lo de hoy de cada tienda: el total dejado (suma) y la última entrega, que
  // es la que se abre a editar al tocarla. Casi siempre es una sola; si dejó
  // dos veces el mismo día, se edita la más reciente (la de mayor orden).
  const hechoHoy = new Map<number, number>();
  const ultimaDe = new Map<number, Entrega>();
  for (const e of entregas) {
    hechoHoy.set(e.tiendaId, (hechoHoy.get(e.tiendaId) ?? 0) + e.totalCalculado);
    const prev = ultimaDe.get(e.tiendaId);
    if (!prev || e.orden > prev.orden) ultimaDe.set(e.tiendaId, e);
  }

  // El orden lo mandan los **días recientes**, no el promedio de todo el
  // historial: si la ruta cambió, tiene que notarse ya. Se toma la parada
  // media de las dos últimas veces que pasó por cada tienda; las que aún no
  // tienen parada quedan al final. Ya entregada hoy, su parada de hoy es la
  // que vale, para que la lista siga el recorrido real del día.
  const sinRuta = 99999;
  const paradaDe = (t: Tienda): number => {
    const hoy = ultimaDe.get(t.id!);
    if (hoy) return hoy.orden;
    const recientes = t.posiciones.slice(-2);
    if (recientes.length > 0) return recientes.reduce((a, b) => a + b, 0) / recientes.length;
    return t.ordenRuta > 0 ? t.ordenRuta : sinRuta;
  };
  const orden = [...tiendas].sort((a, b) => paradaDe(a) - paradaDe(b));

  if (tiendas.length === 0) {
    return (
      <Vacio
        titulo="Todavía no hay clientes"
        sub="Se van creando solos al dictar, o agrega uno con el botón + de aquí abajo."
      />
    );
  }

  return (
    <>
      {orden.map((t) => {
        const ultima = ultimaDe.get(t.id!);
        const hecho = ultima !== undefined;
        const total = hechoHoy.get(t.id!) ?? 0;
        const hora = mediana(t.minutos);
        const meta: string[] = [];
        if (t.ordenRuta) meta.push(`parada ${t.ordenRuta}`);
        if (hora !== null) meta.push(horaTxt(Math.round(hora)));
        if (t.pesa && t.precioKgDefecto) meta.push(`${(t.precioKgDefecto / 100).toFixed(2)}/kg`);
        else if (!t.pesa) meta.push("sin pesar");

        const deuda = deudas.get(t.id!) ?? 0;

        return (
          <button
            key={t.id}
            onClick={() => (ultima ? abrir(ultima.id!) : onTocar(t))}
            className="pulsable"
            style={{
              ...S.tarjeta,
              borderRadius: 14,
              padding: "15px 16px",
              display: "flex",
              gap: 14,
              alignItems: "center",
              width: "100%",
              opacity: hecho ? 0.62 : 1,
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                flex: "none",
                background: hecho ? "var(--verde)" : "transparent",
                border: hecho ? "none" : "2px solid var(--texto-5)",
              }}
            />
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.2, marginBottom: 3 }}>
                {t.nombre}
              </div>
              <div style={{ fontSize: 13, color: "var(--texto-3)" }}>
                {ultima
                  ? descripcionEntrega(ultima)
                  : meta.length
                    ? meta.join(" · ")
                    : "sin ruta todavía"}
              </div>
              {deuda > 0 && (
                <div style={{ fontSize: 12, color: "var(--ambar)", fontWeight: 500, marginTop: 2 }}>
                  Debe {money(deuda)} de antes
                </div>
              )}
            </div>
            {hecho ? (
              <div style={{ textAlign: "right", flex: "none" }}>
                <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>{money(total)}</div>
                <div style={{ fontSize: 12, marginTop: 2, color: "var(--verde)" }}>entregado</div>
              </div>
            ) : (
              <div
                style={{
                  flex: "none",
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  border: "1.5px solid var(--borde)",
                  color: "var(--texto-3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Plus size={22} />
              </div>
            )}
          </button>
        );
      })}
    </>
  );
}

