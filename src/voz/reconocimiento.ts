import { useCallback, useEffect, useRef, useState } from "react";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { esNativo } from "../lib/plataforma";
import { esPluginAusente, ReconocedorNativo, type CorteNativo } from "./reconocedorNativo";

/**
 * Voz a texto.
 *
 * En el APK manda el **reconocedor propio** (`Reconocedor.java` + su puente
 * `reconocedorNativo.ts`): el mismo servicio de voz de Google del teléfono,
 * pero pedido con lo que este dictado necesita — silencios largos, preferir
 * el reconocimiento en el teléfono (sin esperar a la red) y el texto final
 * repasado de cada tramo. Si el APK es viejo y no trae ese plugin, se cae al
 * de la comunidad, que era el motor de antes. En el navegador de desarrollo
 * se usa la Web Speech API.
 *
 * **El problema que resuelve este archivo:** Android corta la escucha al poco
 * silencio. Él dicta con pausas — «para don Julio… ocho pollos… siete kilos
 * doscientos» — así que el reconocedor se cerraba a mitad de frase. Aquí,
 * cuando el servicio corta por su cuenta, **se vuelve a abrir solo y se sigue
 * acumulando**: la escucha termina cuando él pulsa el botón, no cuando el
 * teléfono se cansa. Con el motor propio además el corte llega mucho más
 * tarde (se le piden ~4 s de tolerancia) y cada tramo cerrado entrega su
 * versión final repasada, que es mejor que el último parcial.
 */

export type EstadoEscucha = "inactivo" | "pidiendo" | "escuchando" | "error";

const IDIOMA = "es-PE";

/** Tope de seguridad: si se queda abierto, no escucha para siempre. */
const MAXIMO_MS = 120_000;
/** Tantos reinicios seguidos sin oír nada = ya no está hablando. */
const SILENCIOS_SEGUIDOS = 3;
/** Cuánto silencio se le pide aguantar al motor propio antes de cortar. */
const SILENCIO_MS = 4000;
/**
 * Con tramos de ~4 s, dos vacíos seguidos ya son ~8 s callado: suficiente
 * para dar la escucha por terminada sin que una pausa larga la mate.
 */
const SILENCIOS_SEGUIDOS_PROPIO = 2;
/** Errores duros seguidos (red, servicio caído) antes de rendirse. */
const ERRORES_SEGUIDOS = 3;

/** La Web Speech API no está tipada en TS y solo se usa en desarrollo. */
interface ReconocedorWeb {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
}

function crearWeb(): ReconocedorWeb | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => ReconocedorWeb;
    webkitSpeechRecognition?: new () => ReconocedorWeb;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/** Qué motor está sirviendo la escucha en curso. */
type Motor = "propio" | "plugin" | "web";

/**
 * @param alTerminar recibe todo lo dictado cuando él pulsa para parar (o
 *   cuando salta el tope de seguridad). Cadena vacía = no se agarró nada.
 */
export function useReconocedor(alTerminar: (texto: string) => void) {
  const [estado, setEstado] = useState<EstadoEscucha>("inactivo");
  const [parcial, setParcial] = useState("");
  const [error, setError] = useState<string | null>(null);

  const motor = useRef<Motor>("plugin");
  const web = useRef<ReconocedorWeb | null>(null);
  /** Lo de los tramos ya cerrados por las pausas. */
  const base = useRef("");
  /** El tramo que está diciendo ahora mismo. */
  const tramo = useRef("");
  const activo = useRef(false);
  const pidioParar = useRef(false);
  const inicio = useRef(0);
  const silencios = useRef(0);
  const erroresDuros = useRef(0);
  /**
   * El motor propio arranca prefiriendo el reconocimiento en el teléfono.
   * Si el servicio contesta que no tiene el idioma descargado, se baja esta
   * bandera y el siguiente tramo va a la red — mejor lento que mudo.
   */
  const preferirOffline = useRef(true);
  /** Sube en cada apertura y cierre; los reinicios viejos se descartan solos. */
  const generacion = useRef(0);

  const alTerminarRef = useRef(alTerminar);
  alTerminarRef.current = alTerminar;

  const todo = () => `${base.current} ${tramo.current}`.replace(/\s+/g, " ").trim();

  const soltar = useCallback(() => {
    activo.current = false;
    // Cambiar de generación invalida cualquier reinicio que estuviera en cola:
    // si no, un temporizador pendiente podía resucitar la escucha ya cerrada.
    generacion.current += 1;
    if (motor.current === "propio") {
      // Primero los oyentes y después parar de verdad, igual que abajo.
      void ReconocedorNativo.removeAllListeners().catch(() => {});
      void ReconocedorNativo.cancelar().catch(() => {});
    } else if (esNativo) {
      // Primero los oyentes, para que el aviso de parada no reabra nada, y
      // **después parar de verdad**: sin este `stop` el reconocedor de Android
      // se quedaba grabando aunque la app ya no lo escuchara.
      void SpeechRecognition.removeAllListeners();
      void SpeechRecognition.stop().catch(() => {});
    }
    if (web.current) {
      web.current.onend = null;
      web.current.onresult = null;
      web.current.onerror = null;
      web.current.abort();
      web.current = null;
    }
  }, []);

  useEffect(() => soltar, [soltar]);

  /** Cierra la sesión y entrega el texto. El guardia evita entregarlo dos veces. */
  const finalizar = useCallback(() => {
    if (!activo.current) return;
    const texto = todo();
    base.current = "";
    tramo.current = "";
    soltar();
    setEstado("inactivo");
    setParcial("");
    alTerminarRef.current(texto);
  }, [soltar]);

  /** Reabre la escucha del motor propio para el siguiente tramo. */
  const reabrirPropio = useCallback(
    (esperaMs: number) => {
      const mia = generacion.current;
      setTimeout(() => {
        if (!activo.current || pidioParar.current || generacion.current !== mia) return;
        void ReconocedorNativo.iniciar({
          idioma: IDIOMA,
          preferirOffline: preferirOffline.current,
          silencioMs: SILENCIO_MS,
        }).catch(() => finalizar());
      }, esperaMs);
    },
    [finalizar],
  );

  /** El motor propio cerró un tramo. ¿Fue él, un silencio o un fallo? */
  const alCortePropio = useCallback(
    (d: CorteNativo) => {
      if (!activo.current) return;

      // El texto final del tramo viene repasado por el servicio: pisa al
      // último parcial, que es un borrador.
      if (d.texto.trim()) tramo.current = d.texto;

      if (pidioParar.current) return finalizar();
      if (Date.now() - inicio.current > MAXIMO_MS) return finalizar();

      if (d.motivo === "permiso") return finalizar();

      if (d.motivo === "idioma") {
        // No tiene el paquete de español en el teléfono: que el siguiente
        // tramo vaya a la red en vez de quedarse mudo.
        if (!preferirOffline.current) return finalizar();
        preferirOffline.current = false;
        return reabrirPropio(0);
      }

      if (d.motivo === "red" || d.motivo === "error") {
        erroresDuros.current += 1;
        if (erroresDuros.current >= ERRORES_SEGUIDOS) return finalizar();
        return reabrirPropio(300);
      }

      erroresDuros.current = 0;
      if (tramo.current.trim()) {
        silencios.current = 0;
        base.current = todo();
        tramo.current = "";
      } else {
        // Tramo vacío: va callado. A la segunda (~8 s) se cierra sola.
        silencios.current += 1;
        if (silencios.current >= SILENCIOS_SEGUIDOS_PROPIO) return finalizar();
      }
      reabrirPropio(0);
    },
    [finalizar, reabrirPropio],
  );

  /** Arranca el motor propio. Lanza para que `iniciar` pruebe el siguiente. */
  const iniciarPropio = useCallback(async () => {
    const { disponible } = await ReconocedorNativo.disponible();
    if (!disponible) throw new Error("sin-reconocedor");

    await ReconocedorNativo.removeAllListeners();
    await ReconocedorNativo.addListener("parcial", (d) => {
      if (!d.texto) return;
      tramo.current = d.texto;
      setParcial(todo());
    });
    await ReconocedorNativo.addListener("corte", alCortePropio);

    motor.current = "propio";
    preferirOffline.current = true;
    activo.current = true;
    try {
      // La primera llamada puede pedir el permiso del micrófono.
      await ReconocedorNativo.iniciar({
        idioma: IDIOMA,
        preferirOffline: true,
        silencioMs: SILENCIO_MS,
      });
    } catch (e) {
      activo.current = false;
      if (e instanceof Error && /sin-permiso/.test(e.message)) throw new Error("sin-permiso");
      throw e;
    }
    setEstado("escuchando");
  }, [alCortePropio]);

  /** El plugin de la comunidad dejó de escuchar. ¿Fue él, o solo una pausa? */
  const alCortar = useCallback(() => {
    if (!activo.current) return;

    if (pidioParar.current) return finalizar();
    if (Date.now() - inicio.current > MAXIMO_MS) return finalizar();

    // Si en este tramo no dijo nada, va callado; a la tercera se cierra.
    if (!tramo.current.trim()) {
      silencios.current += 1;
      if (silencios.current >= SILENCIOS_SEGUIDOS) return finalizar();
    } else {
      silencios.current = 0;
      base.current = todo();
      tramo.current = "";
    }

    // Fuera del manejador: reabrir desde dentro del propio evento no gusta.
    const mia = generacion.current;
    setTimeout(() => {
      if (!activo.current || pidioParar.current || generacion.current !== mia) return;
      void SpeechRecognition.start({
        language: IDIOMA,
        partialResults: true,
        popup: false,
        maxResults: 1,
      }).catch(() => finalizar());
    }, 0);
  }, [finalizar]);

  /** El motor de antes, por si el APK todavía no trae el plugin propio. */
  const iniciarPlugin = useCallback(async () => {
    const { available } = await SpeechRecognition.available();
    if (!available) throw new Error("sin-reconocedor");

    const permiso = await SpeechRecognition.checkPermissions();
    if (permiso.speechRecognition !== "granted") {
      const pedido = await SpeechRecognition.requestPermissions();
      if (pedido.speechRecognition !== "granted") throw new Error("sin-permiso");
    }

    await SpeechRecognition.removeAllListeners();
    await SpeechRecognition.addListener("partialResults", (datos) => {
      const t = datos.matches?.[0] ?? "";
      if (!t) return;
      tramo.current = t;
      setParcial(todo());
    });
    await SpeechRecognition.addListener("listeningState", (d) => {
      if (d.status === "stopped") alCortar();
    });

    motor.current = "plugin";
    activo.current = true;
    await SpeechRecognition.start({
      language: IDIOMA,
      partialResults: true,
      popup: false,
      maxResults: 1,
    });
    setEstado("escuchando");
  }, [alCortar]);

  const iniciar = useCallback(async () => {
    if (activo.current) return;
    setError(null);
    setParcial("");
    base.current = "";
    tramo.current = "";
    pidioParar.current = false;
    silencios.current = 0;
    erroresDuros.current = 0;
    inicio.current = Date.now();
    setEstado("pidiendo");

    try {
      if (esNativo) {
        try {
          await iniciarPropio();
        } catch (e) {
          // Un APK viejo no trae el plugin propio: el motor de siempre.
          if (!esPluginAusente(e)) throw e;
          await iniciarPlugin();
        }
        return;
      }

      const r = crearWeb();
      if (!r) throw new Error("sin-reconocedor");
      r.lang = IDIOMA;
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        const ev = e as { results: ArrayLike<ArrayLike<{ transcript: string }>> };
        let t = "";
        for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
        tramo.current = t;
        setParcial(todo());
      };
      r.onerror = () => finalizar();
      r.onend = () => finalizar();
      motor.current = "web";
      web.current = r;
      activo.current = true;
      r.start();
      setEstado("escuchando");
    } catch (e) {
      soltar();
      setEstado("error");
      const causa = e instanceof Error ? e.message : "";
      setError(
        causa === "sin-permiso"
          ? "Falta el permiso del micrófono. Actívalo en Ajustes de Android → Don Pio → Permisos."
          : causa === "sin-reconocedor"
            ? esNativo
              ? "Este teléfono no tiene reconocimiento de voz. Puedes escribirlo con el botón del teclado."
              : "Este navegador no reconoce voz. En el teléfono sí funciona."
            : "No se pudo abrir el micrófono. Puedes escribirlo con el botón del teclado.",
      );
    }
  }, [finalizar, iniciarPlugin, iniciarPropio, soltar]);

  /**
   * Pulsó «Ya terminé»: cierra **ya**, sin esperar al plugin.
   *
   * Antes esto hacía `await SpeechRecognition.stop()` antes de cerrar, y si esa
   * promesa no resolvía —que es lo que pasaba en el teléfono— la escucha se
   * quedaba abierta para siempre por mucho que él pulsara. Ahora se cierra
   * primero y el motor se para dentro de `soltar()`, pase lo que pase.
   */
  const detener = useCallback(() => {
    if (!activo.current) return;
    pidioParar.current = true;
    if (motor.current === "web") web.current?.stop();
    finalizar();
  }, [finalizar]);

  /** Salir sin usar lo dictado (cambió de pantalla, por ejemplo). */
  const cancelar = useCallback(() => {
    if (!activo.current) return;
    pidioParar.current = true;
    base.current = "";
    tramo.current = "";
    if (motor.current === "plugin" && esNativo) void SpeechRecognition.stop().catch(() => {});
    soltar();
    setEstado("inactivo");
    setParcial("");
  }, [soltar]);

  return { estado, parcial, error, iniciar, detener, cancelar };
}
