import { useCallback, useEffect, useRef, useState } from "react";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { esNativo } from "../lib/plataforma";

/**
 * Voz a texto.
 *
 * En el APK usa el reconocedor de Android: es gratis y, con el paquete de
 * idioma descargado, funciona sin señal. En el navegador de desarrollo cae a la
 * Web Speech API.
 *
 * **El problema que resuelve este archivo:** Android corta la escucha a los dos
 * o tres segundos de silencio. Él dicta con pausas — «para don Julio… ocho
 * pollos… siete kilos doscientos» — así que el reconocedor se cerraba a mitad
 * de frase y guardaba «a 12» o «hay de ocho pollos». Aquí, cuando Android corta
 * por su cuenta, **se vuelve a abrir solo y se sigue acumulando**: la escucha
 * termina cuando él pulsa el botón, no cuando el teléfono se cansa.
 */

export type EstadoEscucha = "inactivo" | "pidiendo" | "escuchando" | "error";

const IDIOMA = "es-PE";

/** Tope de seguridad: si se queda abierto, no escucha para siempre. */
const MAXIMO_MS = 120_000;
/** Tantos reinicios seguidos sin oír nada = ya no está hablando. */
const SILENCIOS_SEGUIDOS = 3;

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

/**
 * @param alTerminar recibe todo lo dictado cuando él pulsa para parar (o
 *   cuando salta el tope de seguridad). Cadena vacía = no se agarró nada.
 */
export function useReconocedor(alTerminar: (texto: string) => void) {
  const [estado, setEstado] = useState<EstadoEscucha>("inactivo");
  const [parcial, setParcial] = useState("");
  const [error, setError] = useState<string | null>(null);

  const web = useRef<ReconocedorWeb | null>(null);
  /** Lo de los tramos ya cerrados por las pausas. */
  const base = useRef("");
  /** El tramo que está diciendo ahora mismo. */
  const tramo = useRef("");
  const activo = useRef(false);
  const pidioParar = useRef(false);
  const inicio = useRef(0);
  const silencios = useRef(0);
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
    if (esNativo) {
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

  /** Android dejó de escuchar. ¿Fue él, o solo una pausa? */
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

  const iniciar = useCallback(async () => {
    if (activo.current) return;
    setError(null);
    setParcial("");
    base.current = "";
    tramo.current = "";
    pidioParar.current = false;
    silencios.current = 0;
    inicio.current = Date.now();
    setEstado("pidiendo");

    try {
      if (esNativo) {
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

        activo.current = true;
        await SpeechRecognition.start({
          language: IDIOMA,
          partialResults: true,
          popup: false,
          maxResults: 1,
        });
        setEstado("escuchando");
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
  }, [alCortar, finalizar, soltar]);

  /**
   * Pulsó «Ya terminé»: cierra **ya**, sin esperar al plugin.
   *
   * Antes esto hacía `await SpeechRecognition.stop()` antes de cerrar, y si esa
   * promesa no resolvía —que es lo que pasaba en el teléfono— la escucha se
   * quedaba abierta para siempre por mucho que él pulsara. Ahora se cierra
   * primero y el plugin se para dentro de `soltar()`, pase lo que pase.
   */
  const detener = useCallback(() => {
    if (!activo.current) return;
    pidioParar.current = true;
    if (!esNativo) web.current?.stop();
    finalizar();
  }, [finalizar]);

  /** Salir sin usar lo dictado (cambió de pantalla, por ejemplo). */
  const cancelar = useCallback(() => {
    if (!activo.current) return;
    pidioParar.current = true;
    base.current = "";
    tramo.current = "";
    if (esNativo) void SpeechRecognition.stop().catch(() => {});
    soltar();
    setEstado("inactivo");
    setParcial("");
  }, [soltar]);

  return { estado, parcial, error, iniciar, detener, cancelar };
}
