import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { LayoutList, MoreHorizontal, Store, Undo2 } from "lucide-react";

import { db } from "./db/db";
import { cerrarDiasPasados, guardarStock, leerJornada } from "./db/jornada";
import { registrarEntrega } from "./db/entregas";
import { registrarCobro } from "./db/entregas";
import { contextoDeRuta, crearTienda, identificar } from "./db/tiendas";
import { aCentimos, aGramos } from "./lib/dinero";
import { hoyISO, type DiaISO } from "./lib/fecha";
import { avisoAtencion, avisoEntendido, avisoEscuchando, avisoGuardado, configurarAviso } from "./lib/aviso";
import { useAjuste, useAjusteBool } from "./lib/ganchos";
import { useBotonAtras } from "./lib/atras";
import {
  CLAVE_API,
  CLAVE_MODO_TECLADO,
  CLAVE_SONIDO,
  CLAVE_STOCK_OFRECIDO,
  HORA_TOPE_STOCK,
  guardarAjuste,
  leerAjuste,
} from "./voz/ajustes";
import { useCola, useConexion } from "./voz/cola";
import {
  descartarDictado,
  hayInternet,
  interpretar,
  interpretarAudio,
  ligarAEntrega,
  limpiarAudiosViejos,
  type Interpretacion,
} from "./voz/interpretar";
import { duracion, useGrabadora } from "./voz/grabacion";
import { useReconocedor } from "./voz/reconocimiento";
import type { Contexto } from "./tiendas/emparejar";
import type { Intencion } from "./voz/intencion";

import { Hoy } from "./pantallas/Hoy";
import { Detalle } from "./pantallas/Detalle";
import { Cobranza } from "./pantallas/Cobranza";
import { Cierre } from "./pantallas/Cierre";
import { Stock } from "./pantallas/Stock";
import { Tiendas } from "./pantallas/Tiendas";
import { Historial } from "./pantallas/Historial";
import { Dia } from "./pantallas/Dia";
import { Ajustes } from "./pantallas/Ajustes";
import { Menu } from "./pantallas/Menu";
import { Gastos } from "./pantallas/Gastos";
import {
  BotonMic,
  HojaEscribir,
  HojaEscuchando,
  TarjetaConfirmacion,
  type Propuesta,
} from "./ui/Dictado";

type Pantalla =
  | "hoy"
  | "cobranza"
  | "detalle"
  | "cierre"
  | "tiendas"
  | "historial"
  | "dia"
  | "ajustes"
  | "stock"
  | "gastos"
  | "menu";

/** Las pestañas: son la raíz de la navegación, no se apilan entre ellas. */
const RAIZ: Pantalla[] = ["hoy", "cobranza", "tiendas", "menu"];

export default function App() {
  const [pantalla, setPantalla] = useState<Pantalla>("hoy");
  const [entregaSel, setEntregaSel] = useState<number | null>(null);
  const [diaSel, setDiaSel] = useState<DiaISO>(hoyISO());
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [pensando, setPensando] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  /** Hay un cobro abierto con su teclado: los flotantes estorban. */
  const [cobroAbierto, setCobroAbierto] = useState(false);
  /** Cómo cerrarlo desde el botón atrás. Lo rellena la propia Cobranza. */
  const cerrarCobro = useRef<(() => void) | null>(null);
  /** De dónde vino, para que el atrás no lleve siempre a Hoy. */
  const pila = useRef<Pantalla[]>([]);

  const fecha = hoyISO();
  const enLinea = useConexion();
  // La cola se revisa sola al volver la señal; ya no se enseña en pantalla.
  useCola();
  const sonido = useAjusteBool(CLAVE_SONIDO, true);

  // Las dos juntas en una consulta para que resuelvan a la vez: si el ajuste
  // llegara después, la pantalla de stock alcanzaría a saltar igualmente.
  const inicio = useLiveQuery(
    async () => ({
      jornada: await leerJornada(fecha),
      ofrecido: await leerAjuste(CLAVE_STOCK_OFRECIDO),
    }),
    [fecha],
  );
  const jornada = inicio?.jornada;

  useEffect(() => configurarAviso(sonido), [sonido]);

  /*
   * Al abrir, cerrar los días que quedaron abiertos: lo que no se cobró pasa a
   * deuda de cada tienda y así aparece hoy en Cobranza. Si esperáramos a que él
   * cierre la jornada a mano, un olvido escondería esa plata para siempre.
   */
  useEffect(() => {
    void cerrarDiasPasados(fecha);
    void limpiarAudiosViejos();
  }, [fecha]);

  /**
   * Preguntar con cuánto sale, pero **sin obligar**.
   *
   * Solo salta por la mañana, solo si el día está en cero y solo una vez: el
   * resto del tiempo se llega por el menú o tocando el encabezado. Saber el
   * stock hace útil el «me quedan», pero no es requisito para repartir, y una
   * pantalla que te bloquea a las 5 a.m. es una pantalla que estorba.
   */
  useEffect(() => {
    if (!inicio) return;
    const { jornada: j, ofrecido } = inicio;
    if (j.estado !== "abierta" || j.stockPollos > 0) return;
    if (ofrecido === fecha) return;
    if (new Date().getHours() >= HORA_TOPE_STOCK) return;
    setPantalla((p) => (p === "hoy" ? "stock" : p));
  }, [inicio, fecha]);

  /** Deja constancia de que ya se preguntó hoy, se responda o no. */
  const stockAtendido = useCallback(
    () => guardarAjuste(CLAVE_STOCK_OFRECIDO, fecha),
    [fecha],
  );

  /* ── El circuito de voz ─────────────────────────────────────────────── */

  /** De una interpretación ya hecha a la tarjeta de confirmación. */
  const proponer = useCallback(
    async (r: Interpretacion) => {
      const { intencion, aviso, dictadoId, transcripcion } = r;

      // Stock no necesita confirmación: es un número suyo, no de un cliente.
      if (intencion.intencion === "cargar_stock") {
        await guardarStock(
          fecha,
          intencion.stockPollos ?? jornada?.stockPollos ?? 0,
          intencion.stockPiernas ?? jornada?.stockPiernas ?? 0,
        );
        avisoGuardado();
        setPantalla("hoy");
        return;
      }

      const { resultado } = await identificar(intencion.cliente, fecha);
      if (resultado.decision === "ambiguo" || resultado.decision === "nueva") avisoAtencion();
      setPropuesta({ intencion, emparejamiento: resultado, transcripcion, dictadoId, aviso });
    },
    [fecha, jornada],
  );

  const procesar = useCallback(
    async (texto: string) => {
      setEscribiendo(false);
      setPensando(true);
      try {
        await proponer(await interpretar(texto));
      } finally {
        setPensando(false);
      }
    },
    [proponer],
  );

  /**
   * El reconocedor entrega el texto cuando él pulsa el botón **o cuando
   * Android deja de escuchar solo** tras una pausa. Los dos caminos acaban
   * aquí, así que una pausa a mitad de frase ya no pierde el dictado.
   */
  const rec = useReconocedor(
    useCallback(
      (texto: string) => {
        if (!texto) {
          avisoAtencion();
          return;
        }
        avisoEntendido();
        void procesar(texto);
      },
      [procesar],
    ),
  );

  const grab = useGrabadora();
  const apiKey = useAjuste(CLAVE_API);
  /**
   * Por defecto se dicta con el teclado: el micrófono de Gboard transcribe
   * igual de bien y **no gasta cuota de la API**, que en el plan gratuito se
   * acaba en cuatro dictados. Se puede cambiar en Ajustes.
   */
  const modoTeclado = useAjusteBool(CLAVE_MODO_TECLADO, true);
  const escuchando = rec.estado === "escuchando" || rec.estado === "pidiendo";
  const grabando = grab.estado === "grabando" || grab.estado === "pidiendo";
  const dictando = escuchando || grabando;
  /** Con key e internet manda el audio a Gemini; si no, reconocedor offline. */
  const porAudio = !modoTeclado && apiKey !== "" && enLinea && hayInternet();

  /**
   * Dictar.
   *
   * Con API key e internet **se graba el audio y se manda entero a Gemini**,
   * que transcribe y estructura de una vez. El reconocedor del teléfono se
   * comía el nombre del cliente («hay de cinco pollos») porque transcribe a
   * ciegas; Gemini oye las pausas y la entonación, que es donde está la
   * separación entre el nombre y las cantidades.
   *
   * Sin key o sin señal se usa el reconocedor de Android, que funciona offline.
   */
  const dictar = useCallback(async () => {
    if (grabando) {
      const audio = await grab.detener();
      if (!audio) {
        avisoAtencion();
        return;
      }
      avisoEntendido();
      setPensando(true);
      try {
        await proponer(await interpretarAudio(audio, ""));
      } finally {
        setPensando(false);
      }
      return;
    }
    if (escuchando) {
      rec.detener();
      return;
    }

    setPropuesta(null);
    // Modo teclado: se abre el cuadro de escribir y él usa el micrófono de su
    // teclado. Un toque más, pero gratis y con mejor transcripción.
    if (modoTeclado) {
      setEscribiendo(true);
      return;
    }
    setEscribiendo(false);
    avisoEscuchando();
    if (porAudio) await grab.iniciar();
    else await rec.iniciar();
  }, [grab, rec, grabando, escuchando, porAudio, modoTeclado, proponer]);

  /** Confirma la propuesta. Aquí es donde por fin se escribe en la base. */
  const confirmar = useCallback(
    async (tiendaId: number | null, nombreEscrito?: string) => {
      if (!propuesta) return;
      const { intencion: i } = propuesta;

      const ctx: Contexto = await contextoDeRuta(fecha);
      const id =
        tiendaId ??
        (await crearTienda(nombreEscrito || i.cliente || "Cliente nuevo", {
          pesa: i.sinPesar ? 0 : 1,
        })).id!;

      if (i.intencion === "registrar_pago" || i.intencion === "abono_deuda") {
        // «Pagó todo» sin monto: se cobra la cuenta entera que tenga abierta.
        const monto = i.pagoTodo
          ? await cuentaTotalDe(id, fecha)
          : aCentimos(i.monto ?? 0);
        await registrarCobro(id, monto, { fecha });
      } else {
        const tienda = await db.tiendas.get(id);
        const entregaId = await registrarEntrega(
          {
            tiendaId: id,
            pollos: i.pollos,
            piernas: i.piernas,
            pechos: i.pechos,
            sinPesar: i.sinPesar,
            tandas: i.tandasKg.map(aGramos),
            peso: i.pesoTotalKg ? aGramos(i.pesoTotalKg) : undefined,
            // Sin precio dictado se usa el que la tienda ya tenía: es lo que
            // hace que «lo de siempre» funcione.
            precioKg: i.precioPorKg ? aCentimos(i.precioPorKg) : tienda?.precioKgDefecto,
            precioPollo: tienda?.precioPolloDefecto,
            totalDictado: i.totalDictado ? aCentimos(i.totalDictado) : undefined,
            notas: i.notas,
          },
          ctx,
          { fecha, dictado: i.cliente },
        );
        await ligarAEntrega(propuesta.dictadoId, entregaId);
      }

      avisoGuardado();
      setPropuesta(null);
    },
    [propuesta, fecha],
  );

  const elegirOtra = useCallback(
    (tiendaId: number) => {
      if (!propuesta) return;
      const candidata = propuesta.emparejamiento.candidatas.find((c) => c.tienda.id === tiendaId);
      if (!candidata) return;
      setPropuesta({
        ...propuesta,
        emparejamiento: { ...propuesta.emparejamiento, decision: "encontrada", mejor: candidata },
      });
    },
    [propuesta],
  );

  const descartar = useCallback(() => {
    if (propuesta) void descartarDictado(propuesta.dictadoId);
    setPropuesta(null);
  }, [propuesta]);

  /** Corrige a mano un dato que se entendió mal, antes de confirmar. */
  const editarPropuesta = useCallback(
    (cambios: Partial<Intencion>) => {
      setPropuesta((actual) =>
        actual ? { ...actual, intencion: { ...actual.intencion, ...cambios } } : actual,
      );
    },
    [],
  );

  /* ── Navegación ─────────────────────────────────────────────────────── */

  const ir = useCallback(
    (p: Pantalla) => {
      setPantalla((actual) => {
        // Las cuatro pestañas son la raíz: moverse entre ellas no apila nada,
        // o el botón atrás acabaría recorriendo todo lo que tocó en el día.
        if (actual !== p && !RAIZ.includes(actual)) {
          pila.current = [...pila.current.filter((x) => x !== actual), actual];
        }
        return p;
      });
      setPropuesta(null);
      setEscribiendo(false);
      rec.cancelar();
      grab.cancelar();
    },
    [rec],
  );

  /**
   * El botón atrás de Android. Cierra lo que haya abierto, de fuera hacia
   * dentro, y solo manda la app a segundo plano cuando ya no queda nada.
   *
   * Antes cerraba la app entera de un toque, en mitad de la ruta.
   */
  useBotonAtras(() => {
    if (dictando) {
      rec.cancelar();
      grab.cancelar();
      return true;
    }
    if (propuesta) {
      descartar();
      return true;
    }
    if (escribiendo) {
      setEscribiendo(false);
      return true;
    }
    if (cobroAbierto) {
      // Lo cierra la propia Cobranza, que es quien sabe cuál está abierto.
      cerrarCobro.current?.();
      return true;
    }
    if (pantalla === "detalle") {
      ir("hoy");
      return true;
    }
    if (pantalla === "dia") {
      ir("historial");
      return true;
    }
    if (!RAIZ.includes(pantalla)) {
      const previa = pila.current.pop() ?? "hoy";
      setPantalla(previa);
      return true;
    }
    if (pantalla !== "hoy") {
      setPantalla("hoy");
      return true;
    }
    return false;
  });

  /**
   * Las cuatro pestañas siempre enseñan la barra: una pestaña que la esconde
   * es una trampa — se entra a Menú y ya no hay forma de salir.
   * El micrófono, en cambio, solo tiene sentido repartiendo o cobrando.
   */
  const conPestanas =
    pantalla === "hoy" ||
    pantalla === "cobranza" ||
    pantalla === "tiendas" ||
    pantalla === "menu";
  const conMic = pantalla === "hoy" || pantalla === "cobranza";
  /**
   * Mientras escucha, el micrófono flotante se quita: tapaba la mitad de lo
   * que se está transcribiendo. Para parar está el botón «Ya terminé» dentro
   * de la propia tarjeta, que es donde él está mirando.
   */
  const flotantes = conMic && !propuesta && !escribiendo && !cobroAbierto;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        // Debajo de la hora y la batería, no encima.
        paddingTop: "var(--seguro-arriba)",
      }}
    >

      {pantalla === "hoy" && (
        <Hoy
          fecha={fecha}
          abrir={(id) => {
            setEntregaSel(id);
            setPantalla("detalle");
          }}
          abrirStock={() => setPantalla("stock")}
          abrirAjustes={() => ir("ajustes")}
        />
      )}
      {pantalla === "cobranza" && (
        <Cobranza fecha={fecha} onEditando={setCobroAbierto} registrarCierre={cerrarCobro} />
      )}
      {pantalla === "detalle" && entregaSel !== null && (
        <Detalle entregaId={entregaSel} volver={() => ir("hoy")} />
      )}
      {pantalla === "cierre" && <Cierre fecha={fecha} volver={() => ir("hoy")} />}
      {pantalla === "stock" && (
        <Stock
          fecha={fecha}
          listo={() => {
            void stockAtendido();
            ir("hoy");
          }}
          ahoraNo={() => {
            void stockAtendido();
            ir("hoy");
          }}
        />
      )}
      {pantalla === "tiendas" && <Tiendas />}
      {pantalla === "historial" && (
        <Historial
          volver={() => ir("hoy")}
          abrirDia={(d) => {
            setDiaSel(d);
            setPantalla("dia");
          }}
        />
      )}
      {pantalla === "dia" && <Dia fecha={diaSel} volver={() => ir("historial")} />}
      {pantalla === "ajustes" && <Ajustes volver={() => ir("hoy")} />}
      {pantalla === "gastos" && <Gastos fecha={fecha} volver={() => ir("menu")} />}
      {pantalla === "menu" && <Menu ir={ir} />}

      {/* Capa de voz: micrófono, escucha y confirmación */}
      {conPestanas && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            zIndex: 20,
          }}
        >
          {escuchando && <HojaEscuchando texto={rec.parcial} onTerminar={rec.detener} />}
          {grabando && (
            <HojaEscuchando
              texto={`Grabando · ${duracion(grab.ms)}`}
              onda={grab.onda}
              onTerminar={() => void dictar()}
            />
          )}
          {escribiendo && (
            <HojaEscribir
              onEnviar={(t) => void procesar(t)}
              onCerrar={() => setEscribiendo(false)}
            />
          )}
          {(rec.error || grab.error) && (
            <div
              style={{
                pointerEvents: "auto",
                margin: "0 18px 14px",
                background: "var(--superficie)",
                borderRadius: "var(--radio)",
                padding: 16,
                fontSize: 15,
                color: "var(--ambar)",
                boxShadow: "0 0 0 1px var(--borde)",
              }}
            >
              {rec.error ?? grab.error}
            </div>
          )}
          {propuesta && (
            <TarjetaConfirmacion
              propuesta={propuesta}
              precioDefectoKg={propuesta.emparejamiento.mejor?.tienda.precioKgDefecto ?? 0}
              onConfirmar={(id) => void confirmar(id)}
              onElegirOtra={elegirOtra}
              onCrearNueva={(nombre) => void confirmar(null, nombre)}
              onCorregir={descartar}
              onEditar={editarPropuesta}
            />
          )}

          {/*
            Cobrando, las pestañas sobran y encima tapaban las teclas de abajo
            del teclado. Mientras hay un cobro abierto se quitan: él está en
            una sola cosa y tiene su botón de cancelar.
          */}
          {!cobroAbierto && <BarraPestanas actual={pantalla} ir={ir} />}
          {/*
            Los flotantes se esconden en cuanto hay algo abierto encima: la
            tarjeta de confirmación, el cuadro de escribir o el teclado de un
            cobro. Antes tapaban el botón «Confirmar» y las teclas 3-6-9, y un
            toque sin querer en el micrófono borraba lo que estaba revisando.
          */}
          {/*
            Un solo botón. Antes había micrófono y teclado, pero en modo teclado
            los dos abrían lo mismo: dos botones para una acción solo hacen
            dudar cuál tocar.
          */}
          {flotantes && (
            <BotonMic
              escuchando={dictando}
              procesando={pensando}
              onClick={() => void dictar()}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Cuánto debe en total una tienda: lo de hoy más lo que arrastra. */
async function cuentaTotalDe(tiendaId: number, fecha: DiaISO): Promise<number> {
  const [entregas, deudas] = await Promise.all([
    db.entregas.where("[fecha+tiendaId]").equals([fecha, tiendaId]).toArray(),
    db.deudas.where("tiendaId").equals(tiendaId).toArray(),
  ]);
  return (
    entregas.reduce(
      (a, e) => a + Math.max(0, e.totalCalculado - e.totalCobrado - e.descuentoRedondeo),
      0,
    ) + deudas.filter((d) => !d.cerrada).reduce((a, d) => a + (d.monto - d.saldado), 0)
  );
}

function BarraPestanas({ actual, ir }: { actual: Pantalla; ir: (p: Pantalla) => void }) {
  const pestanas = [
    { icono: LayoutList, label: "Hoy", destino: "hoy" as const },
    { icono: Undo2, label: "Cobranza", destino: "cobranza" as const },
    { icono: Store, label: "Tiendas", destino: "tiendas" as const },
    { icono: MoreHorizontal, label: "Más", destino: "menu" as const },
  ];

  return (
    <div
      style={{
        pointerEvents: "auto",
        position: "relative",
        background: "var(--hundido)",
        borderTop: "1px solid var(--linea)",
        display: "flex",
        alignItems: "flex-start",
        // Por encima de la barra de gestos de Android.
        padding: "10px 8px calc(26px + var(--seguro-abajo))",
      }}
    >
      {pestanas.map(({ icono: Icono, label, destino }) => {
        const activa = actual === destino;
        return (
          <button
            key={destino}
            onClick={() => ir(destino)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              padding: "6px 0",
              color: activa ? "var(--acento-claro)" : "var(--texto-4)",
            }}
          >
            <Icono size={22} strokeWidth={activa ? 2.3 : 2} />
            <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
          </button>
        );
      })}
    </div>
  );
}
