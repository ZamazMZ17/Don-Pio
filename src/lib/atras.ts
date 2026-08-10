import { useEffect, useRef } from "react";
import { App as AppNativa } from "@capacitor/app";
import { esNativo } from "./plataforma";

/**
 * El botón atrás de Android.
 *
 * Por defecto Capacitor lo deja cerrar la app entera, y eso es inaceptable
 * aquí: un toque de más estando en Cobranza o en el detalle de una entrega y se
 * sale de golpe, en mitad de la ruta. Este gancho lo intercepta y deja que la
 * app decida qué cerrar.
 *
 * @param manejar devuelve `true` si ya se ocupó del atrás (cerró una hoja,
 *   retrocedió una pantalla). Si devuelve `false`, se está en la pantalla
 *   principal y la app pasa a segundo plano — como cualquier app de Android,
 *   sin cerrarse ni perder nada.
 */
export function useBotonAtras(manejar: () => boolean): void {
  // En una ref para no volver a registrar el oyente en cada render.
  const manejarRef = useRef(manejar);
  manejarRef.current = manejar;

  useEffect(() => {
    if (!esNativo) return;

    const promesa = AppNativa.addListener("backButton", () => {
      if (manejarRef.current()) return;
      // `minimizeApp` y no `exitApp`: al volver, sigue donde lo dejó.
      void AppNativa.minimizeApp();
    });

    return () => {
      void promesa.then((oyente) => oyente.remove());
    };
  }, []);
}
