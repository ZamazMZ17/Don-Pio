import { useState } from "react";
import { Keyboard, Mic, Plus, Square, Trash2 } from "lucide-react";
import type { Candidata, Emparejamiento } from "../tiendas/emparejar";
import type { Intencion } from "../voz/intencion";
import { aCentimos, aGramos, money } from "../lib/dinero";
import { calcular } from "../dominio/calculo";
import { S } from "./base";

/**
 * Lo que se ve mientras dicta y justo después.
 *
 * La regla de esta pantalla: **nunca guardar sin enseñar antes qué se entendió
 * y a quién se le va a cargar**. Un error aquí le cobra a quien no era.
 */

export function HojaEscuchando({
  texto,
  onda,
  onTerminar,
}: {
  texto: string;
  /**
   * Cuando el audio va a Gemini no hay transcripción en vivo que enseñar, así
   * que se dibuja la onda del micrófono: es lo único que le dice que le está
   * agarrando la voz.
   */
  onda?: number[];
  /** Sin esto no hay forma de cerrar el dictado: Android no lo corta solo. */
  onTerminar?: () => void;
}) {
  return (
    <div
      style={{
        pointerEvents: "auto",
        margin: "0 18px 14px",
        background: "var(--superficie)",
        borderRadius: "var(--radio-lg)",
        padding: 18,
        border: "1px solid var(--borde)",
        boxShadow: "0 16px 40px rgba(0,0,0,.65)",
        animation: "dpup .22s ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 18 }}>
          {[0, 0.12, 0.24, 0.36].map((d) => (
            <div
              key={d}
              style={{
                width: 3,
                height: "100%",
                background: "var(--acento)",
                borderRadius: 2,
                animation: `dpbar .7s ease-in-out ${d}s infinite`,
              }}
            />
          ))}
        </div>
        <div style={{ ...S.rotulo, fontSize: 13 }}>Escuchando</div>
      </div>

      {onda ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            height: 56,
            padding: "4px 0",
          }}
        >
          {onda.map((v, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                // Un mínimo visible: una barra de 0px parece que se colgó.
                height: `${Math.max(6, v * 100)}%`,
                background: v > 0.06 ? "var(--acento)" : "var(--borde)",
                borderRadius: 2,
                transition: "height 80ms linear",
              }}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            fontSize: 19,
            lineHeight: 1.45,
            color: texto ? "var(--texto)" : "var(--texto-4)",
            maxHeight: 132,
            overflowY: "auto",
          }}
        >
          {texto || "Di a quién le dejaste, cuántos pollos y cuánto pesaron…"}
        </div>
      )}

      {onda && (
        <div style={{ fontSize: 15, color: "var(--texto-3)", marginTop: 8 }}>{texto}</div>
      )}

      {/*
        El cuadrado de parar, como en cualquier grabadora. La escucha ya no se
        cierra sola con las pausas, así que **tiene que haber** una forma clara
        de decir «ya terminé», y aquí, donde está mirando.
      */}
      {onTerminar && (
        <button
          onClick={onTerminar}
          className="pulsable-acento"
          style={{
            marginTop: 16,
            height: 62,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            borderRadius: "var(--radio-md)",
            border: "1.5px solid var(--acento)",
            background: "var(--acento-900)",
            color: "var(--acento-200)",
            fontSize: 19,
            fontWeight: 600,
          }}
        >
          <Square size={20} strokeWidth={0} fill="currentColor" />
          Ya terminé
        </button>
      )}
    </div>
  );
}

export interface Propuesta {
  intencion: Intencion;
  emparejamiento: Emparejamiento;
  transcripcion: string;
  /**
   * La fila de `dictados` de la que salió, para poder ligarla o descartarla.
   * Falta cuando la entrega se registró **tocando** una tienda en la vista de
   * ruta (o el botón +), no dictándola: ahí no hubo dictado que rastrear.
   */
  dictadoId?: number;
  /**
   * Registrada tocando una tienda de la ruta, no dictada. La tarjeta oculta la
   * transcripción y el «¿es esta?»: ya sabemos a quién, la tocó él mismo.
   */
  manual?: boolean;
}

/**
 * La tarjeta de confirmación. Muestra la cuenta ya hecha y, sobre todo, **a
 * quién** se le va a cargar, con un toque para cambiarlo.
 */
export function TarjetaConfirmacion({
  propuesta,
  precioDefectoKg,
  onConfirmar,
  onElegirOtra,
  onCrearNueva,
  onCorregir,
  onEditar,
}: {
  propuesta: Propuesta;
  precioDefectoKg: number;
  onConfirmar: (tiendaId: number) => void;
  onElegirOtra: (tiendaId: number) => void;
  onCrearNueva: (nombre: string) => void;
  onCorregir: () => void;
  /** Corrige a mano lo que se entendió mal, antes de confirmar. */
  onEditar: (cambios: Partial<Intencion>) => void;
}) {
  const { intencion: i, emparejamiento: em } = propuesta;
  const [eligiendo, setEligiendo] = useState(em.decision === "ambiguo" || !em.mejor);
  const [nombreNuevo, setNombreNuevo] = useState(em.mejor?.tienda.nombre ?? i.cliente);
  /**
   * Piernas va siempre junto a Pollos — pedido explícito: son casi tan
   * comunes como los pollos enteros. Pechos sigue siendo la excepción de
   * verdad, solo de pollos partidos, así que su campo no ocupa sitio hasta
   * que hace falta: se muestra si ya venía con valor (de un dictado) o si él
   * lo pide con «+ pecho», que es lo que faltaba al registrar tocando.
   */
  const [mostrarPechos, setMostrarPechos] = useState(i.pechos > 0);
  const [mostrarTandas, setMostrarTandas] = useState(i.tandasKg.length > 1);
  const [nuevaTanda, setNuevaTanda] = useState("");

  const tandas = i.tandasKg.map(aGramos);
  const precio = i.precioPorKg ? aCentimos(i.precioPorKg) : precioDefectoKg;
  const cuenta = calcular({
    tandas,
    peso: i.pesoTotalKg ? aGramos(i.pesoTotalKg) : undefined,
    precioKg: precio,
    totalDictado: i.totalDictado ? aCentimos(i.totalDictado) : undefined,
    sinPesar: i.sinPesar,
    pollos: i.pollos,
  });

  const esPago = i.intencion === "registrar_pago" || i.intencion === "abono_deuda";

  return (
    <div
      style={{
        pointerEvents: "auto",
        margin: "0 14px 14px",
        background: "var(--superficie)",
        borderRadius: "var(--radio-xl)",
        padding: "20px 18px 18px",
        border: "1px solid var(--texto-5)",
        boxShadow: "0 16px 40px rgba(0,0,0,.7)",
        animation: "dpup .24s ease-out",
        maxHeight: "78vh",
        overflowY: "auto",
      }}
    >
      <div style={{ ...S.rotulo, fontSize: 13, marginBottom: 12 }}>
        {esPago ? "Confirma el cobro" : "Confirma la entrega"}
      </div>

      {/* Quién. Es lo que más se equivoca y lo que más caro sale. */}
      {eligiendo ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 15, color: "var(--texto-2)", marginBottom: 10 }}>
            {em.candidatas.length > 1
              ? `Hay ${em.candidatas.length} que se llaman parecido. ¿Cuál es?`
              : "¿A quién le dejaste?"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {em.candidatas.map((c) => (
              <Candidato
                key={c.tienda.id}
                candidata={c}
                onClick={() => {
                  onElegirOtra(c.tienda.id!);
                  setEligiendo(false);
                }}
              />
            ))}
            {/*
              Escribir el nombre a mano. Hace falta de verdad: cuando el
              dictado se corta o el ruido se come el nombre, la tarjeta se
              quedaba con «sin nombre» y no había forma de arreglarlo sin
              descartar la entrega entera y repetirla.
            */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={nombreNuevo}
                onChange={(ev) => setNombreNuevo(ev.target.value)}
                placeholder="Escribe el nombre"
                autoComplete="off"
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 56,
                  borderRadius: "var(--radio)",
                  border: "1.5px dashed var(--borde)",
                  background: "var(--hundido)",
                  padding: "0 14px",
                  fontSize: 17,
                }}
              />
              <button
                className="pulsable-acento"
                disabled={!nombreNuevo.trim()}
                onClick={() => onCrearNueva(nombreNuevo.trim())}
                style={{
                  flex: "none",
                  width: 92,
                  height: 56,
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
        </div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          {/*
            El nombre se escribe encima. El dictado lo oye mal a menudo, y
            corregirlo aquí evita crear «Juanita» cuando era «Juana».
          */}
          <input
            value={nombreNuevo}
            onChange={(ev) => setNombreNuevo(ev.target.value)}
            placeholder="¿Quién?"
            aria-label="Nombre del cliente"
            style={{
              width: "100%",
              fontSize: 26,
              fontWeight: 700,
              lineHeight: 1.2,
              background: "none",
              border: "none",
              borderBottom: "1.5px dashed var(--borde)",
              padding: "2px 0 6px",
              outline: "none",
              marginBottom: 8,
            }}
          />
          {/* Tocada desde la ruta ya sabemos quién es: no se ofrece re-elegir. */}
          {!propuesta.manual && (
            <button
              onClick={() => setEligiendo(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  padding: "4px 9px",
                  borderRadius: 99,
                  border: "1px solid var(--acento-700)",
                  color: "var(--acento-claro)",
                  flex: "none",
                }}
              >
                {em.decision === "nueva" ? "cliente nuevo" : "¿es esta?"}
              </div>
              {em.mejor && nombreNuevo.trim() !== em.mejor.tienda.nombre && (
                <div style={{ fontSize: 12, color: "var(--ambar)", flex: "none" }}>
                  se guardará como cliente nuevo
                </div>
              )}
            </button>
          )}
        </div>
      )}

      {/* Qué. Todo editable: lo que se entendió mal se corrige aquí mismo,
          sin tener que descartar y repetir el dictado entero. */}
      {!esPago && (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              borderTop: "1px solid var(--borde)",
              borderBottom: "1px solid var(--borde)",
              padding: "14px 0",
              marginBottom: 16,
            }}
          >
            {/* Piernas siempre visible junto a Pollos. Pechos solo ocupa
                sitio si lo hay o si él lo pide. */}
            <CampoEditable
              flex={1}
              rotulo={mostrarPechos ? "Enteros" : "Pollos"}
              valor={i.pollos ? String(i.pollos) : ""}
              placeholder="0"
              onGuardar={(n) => onEditar({ pollos: Math.max(0, Math.round(n)) })}
            />
            <CampoEditable
              flex={1}
              rotulo="Piernas"
              valor={i.piernas ? String(i.piernas) : ""}
              placeholder="0"
              onGuardar={(n) => onEditar({ piernas: Math.max(0, Math.round(n)) })}
            />
            {mostrarPechos && (
              <CampoEditable
                flex={1}
                rotulo="Pechos"
                valor={i.pechos ? String(i.pechos) : ""}
                placeholder="0"
                onGuardar={(n) => onEditar({ pechos: Math.max(0, Math.round(n)) })}
              />
            )}
            {!mostrarTandas && (
              <CampoEditable
                flex={1.2}
                rotulo="Peso"
                valor={cuenta.peso ? (cuenta.peso / 1000).toFixed(2) : ""}
                placeholder="sin pesar"
                sufijo="kg"
                onGuardar={(n) => onEditar({ tandasKg: [], pesoTotalKg: n > 0 ? n : null })}
              />
            )}
            <CampoEditable
              flex={1.2}
              rotulo="Por kilo"
              valor={cuenta.precioKg ? (cuenta.precioKg / 100).toFixed(2) : ""}
              placeholder="—"
              onGuardar={(n) => onEditar({ precioPorKg: n > 0 ? n : null })}
            />
          </div>

          {/* Tandas de peso: se muestran al tocar "+ Agregar pesada" o cuando
              ya vienen varias del dictado. Mismo patrón que en Detalle. */}
          {mostrarTandas && (
            <div style={{ marginBottom: 14 }}>
              {i.tandasKg.map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--linea)",
                  }}
                >
                  <span style={{ fontSize: 14, color: "var(--texto-2)" }}>
                    {["Primera", "Segunda", "Tercera", "Cuarta"][idx] ?? `Tanda ${idx + 1}`} tanda
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18, fontWeight: 600 }}>{t.toFixed(2)} kg</span>
                    <button
                      aria-label="Quitar tanda"
                      onClick={() => {
                        const nuevas = i.tandasKg.filter((_, j) => j !== idx);
                        onEditar({ tandasKg: nuevas, pesoTotalKg: nuevas.length > 0 ? null : i.pesoTotalKg });
                        if (nuevas.length <= 1) setMostrarTandas(false);
                      }}
                      style={{ color: "var(--texto-4)", display: "flex", padding: 4 }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </span>
                </div>
              ))}

              <div style={{ display: "flex", gap: 8, padding: "10px 0 4px" }}>
                <input
                  value={nuevaTanda}
                  onChange={(ev) => setNuevaTanda(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      const n = Number(nuevaTanda.replace(",", "."));
                      if (Number.isFinite(n) && n > 0) {
                        onEditar({ tandasKg: [...i.tandasKg, n], pesoTotalKg: null });
                        setNuevaTanda("");
                      }
                    }
                  }}
                  inputMode="decimal"
                  placeholder="Otra pesada"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 48,
                    borderRadius: "var(--radio)",
                    border: "1.5px solid var(--borde)",
                    background: "var(--hundido)",
                    padding: "0 12px",
                    fontSize: 16,
                  }}
                />
                <button
                  onClick={() => {
                    const n = Number(nuevaTanda.replace(",", "."));
                    if (!Number.isFinite(n) || n <= 0) return;
                    onEditar({ tandasKg: [...i.tandasKg, n], pesoTotalKg: null });
                    setNuevaTanda("");
                  }}
                  className="pulsable-acento"
                  style={{
                    flex: "none",
                    width: 84,
                    height: 48,
                    borderRadius: "var(--radio)",
                    border: "1.5px solid var(--acento)",
                    color: "var(--acento-300)",
                    fontSize: 15,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  Agregar
                </button>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8 }}>
                <span style={{ fontSize: 14, color: "var(--texto-2)" }}>Peso total</span>
                <span style={{ fontSize: 20, fontWeight: 700 }}>
                  {cuenta.peso ? (cuenta.peso / 1000).toFixed(2) : "0.00"} kg
                </span>
              </div>
            </div>
          )}

          {/* La forma de sumar un pecho cuando el pollo va partido: parte un
              pecho por un lado y una pierna por otro (que ya tiene su campo
              siempre puesto). Sin esto, al registrar tocando no había dónde
              ponerlo. */}
          <div style={{ display: "flex", gap: 14, marginTop: -4, marginBottom: 14, flexWrap: "wrap" }}>
            {!mostrarPechos && (
              <button
                onClick={() => setMostrarPechos(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--acento-claro)",
                  fontSize: 14,
                  fontWeight: 500,
                  padding: "4px 2px",
                }}
              >
                + pecho
              </button>
            )}
            {!mostrarTandas && (
              <button
                onClick={() => {
                  const base: number[] = i.tandasKg.length > 0
                    ? [...i.tandasKg]
                    : i.pesoTotalKg && i.pesoTotalKg > 0
                      ? [i.pesoTotalKg]
                      : [];
                  if (base.length > 0) {
                    onEditar({ tandasKg: base, pesoTotalKg: null });
                  }
                  setMostrarTandas(true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--acento-claro)",
                  fontSize: 14,
                  fontWeight: 500,
                  padding: "4px 2px",
                }}
              >
                + agregar pesada
              </button>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: cuenta.origen === "incompleto" ? 6 : 18,
            }}
          >
            <span style={{ fontSize: 15, color: "var(--texto-3)" }}>Total</span>
            <input
              key={cuenta.origen === "incompleto" ? "vacio" : cuenta.total}
              defaultValue={cuenta.origen === "incompleto" ? "" : (cuenta.total / 100).toFixed(2)}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Total"
              onFocus={(ev) => ev.currentTarget.select()}
              onBlur={(ev) => {
                const n = Number(ev.target.value.replace(",", "."));
                if (!Number.isFinite(n) || n < 0) return;
                // Si no cambió, no lo fijes: si no, cualquier toque sin
                // querer congelaría el total en vez de dejarlo recalcularse
                // solo cuando cambia el peso o el precio.
                if (Math.abs(n - cuenta.total / 100) < 0.005) return;
                onEditar({ totalDictado: n > 0 ? n : null });
              }}
              style={{
                width: 170,
                textAlign: "right",
                fontSize: cuenta.origen === "incompleto" ? 22 : 44,
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: cuenta.origen === "incompleto" ? 0 : -1,
                background: "none",
                border: "none",
                borderBottom: "1.5px dashed var(--borde)",
                padding: "2px 0",
                outline: "none",
                color: cuenta.origen === "incompleto" ? "var(--ambar)" : "var(--texto)",
              }}
            />
          </div>
          {cuenta.origen === "incompleto" && (
            <div
              style={{
                textAlign: "right",
                fontSize: 12,
                color: "var(--ambar)",
                marginBottom: 12,
              }}
            >
              Falta el precio o el total · tócalo para ponerlo
            </div>
          )}
        </>
      )}

      {esPago && (
        <div
          style={{
            borderTop: "1px solid var(--borde)",
            padding: "16px 0",
            marginBottom: 16,
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 15, color: "var(--texto-3)" }}>
            {i.pagoTodo ? "Paga toda su cuenta" : "Te dio"}
          </span>
          <span style={{ fontSize: 44, fontWeight: 700, lineHeight: 1, letterSpacing: -1 }}>
            {i.pagoTodo ? "todo" : money(aCentimos(i.monto ?? 0))}
          </span>
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onCorregir}
          className="pulsable"
          style={{
            flex: 1,
            height: 62,
            borderRadius: "var(--radio-md)",
            // 2.5px como el Confirmar de al lado y como BotonPrincipal: son
            // los botones grandes de acción, donde el contorno es lo que los
            // dibuja. Ver la nota en ui/base.tsx.
            border: "2.5px solid var(--borde)",
            color: "var(--texto-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
          }}
        >
          Descartar
        </button>
        <button
          // Sin candidata es un cliente nuevo: confirmar lo crea. El día uno
          // el directorio está vacío y este es *el* camino, no un caso raro.
          onClick={() =>
            em.mejor && nombreNuevo.trim() === em.mejor.tienda.nombre
              ? onConfirmar(em.mejor.tienda.id!)
              : onCrearNueva(nombreNuevo.trim())
          }
          disabled={eligiendo}
          className="pulsable-acento"
          style={{
            flex: 1.4,
            height: 62,
            borderRadius: "var(--radio-md)",
            border: "2.5px solid var(--acento)",
            background: "var(--acento-900)",
            color: "var(--acento-200)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 19,
            fontWeight: 600,
            opacity: eligiendo ? 0.45 : 1,
          }}
        >
          Confirmar
        </button>
      </div>

      {!propuesta.manual && propuesta.transcripcion && (
        <div
          style={{
            textAlign: "center",
            fontSize: 13,
            color: "var(--texto-4)",
            marginTop: 12,
            lineHeight: 1.5,
          }}
        >
          «{propuesta.transcripcion}»
        </div>
      )}
    </div>
  );
}

function Candidato({ candidata, onClick }: { candidata: Candidata; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="pulsable"
      style={{
        borderRadius: "var(--radio)",
        border: "1.5px solid var(--borde)",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
      }}
    >
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{candidata.tienda.nombre}</div>
        <div style={{ fontSize: 13, color: "var(--texto-3)", marginTop: 3 }}>
          {candidata.distintivo}
        </div>
      </div>
    </button>
  );
}

/** Un número que se corrige tocándolo y se guarda al salir del campo. */
function CampoEditable({
  rotulo,
  valor,
  placeholder,
  sufijo,
  flex,
  onGuardar,
}: {
  rotulo: string;
  valor: string;
  placeholder?: string;
  sufijo?: string;
  flex: number;
  onGuardar: (n: number) => void;
}) {
  return (
    <div style={{ flex, minWidth: 64 }}>
      <div style={{ fontSize: 12, color: "var(--texto-4)", marginBottom: 4 }}>{rotulo}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <input
          key={valor}
          className="campo-editable"
          defaultValue={valor}
          placeholder={placeholder}
          inputMode="decimal"
          onFocus={(ev) => ev.currentTarget.select()}
          onBlur={(ev) => {
            const n = Number(ev.target.value.replace(",", "."));
            if (Number.isFinite(n)) onGuardar(n);
          }}
          style={{
            width: "100%",
            minWidth: 0,
            fontSize: 24,
            fontWeight: 700,
            background: "none",
            border: "none",
            borderBottom: "1.5px dashed var(--borde)",
            padding: "2px 0",
            outline: "none",
          }}
        />
        {sufijo && <span style={{ fontSize: 13, color: "var(--texto-3)" }}>{sufijo}</span>}
      </div>
    </div>
  );
}

/**
 * Escribir en vez de hablar.
 *
 * La voz es la entrada principal, pero **no puede ser la única**: si el
 * micrófono no tiene permiso, si el mercado está a tope de ruido o si
 * simplemente no lo entiende, tiene que poder registrar la entrega igual.
 * Se escribe la misma frase que diría y pasa por el mismo intérprete.
 */
export function HojaEscribir({
  onEnviar,
  onCerrar,
}: {
  onEnviar: (texto: string) => void;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState("");

  return (
    <div
      style={{
        pointerEvents: "auto",
        margin: "0 14px 14px",
        background: "var(--superficie)",
        borderRadius: "var(--radio-lg)",
        padding: 18,
        border: "1px solid var(--borde)",
        boxShadow: "0 16px 40px rgba(0,0,0,.65)",
        animation: "dpup .22s ease-out",
      }}
    >
      <div style={{ ...S.rotulo, fontSize: 13, marginBottom: 10 }}>Escríbelo como lo dirías</div>
      <textarea
        value={texto}
        autoFocus
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Para don Julio, 8 pollos, 14 kilos 200 y 12 kilos, a 9.50 el kilo"
        rows={3}
        style={{
          width: "100%",
          borderRadius: "var(--radio)",
          border: "1.5px solid var(--borde)",
          background: "var(--hundido)",
          padding: 14,
          fontSize: 17,
          lineHeight: 1.45,
          resize: "none",
          fontFamily: "inherit",
          color: "var(--texto)",
        }}
      />
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button
          onClick={onCerrar}
          className="pulsable"
          style={{
            flex: 1,
            height: 56,
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
          onClick={() => texto.trim() && onEnviar(texto.trim())}
          disabled={!texto.trim()}
          className="pulsable-acento"
          style={{
            flex: 1.4,
            height: 56,
            borderRadius: "var(--radio)",
            border: "1.5px solid var(--acento)",
            background: "var(--acento-900)",
            color: "var(--acento-200)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 600,
            opacity: texto.trim() ? 1 : 0.45,
          }}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

/** Abre la escritura a mano. Va pegado al micrófono, más chico. */
export function BotonEscribir({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Escribir en vez de hablar"
      style={{
        position: "absolute",
        // La capa que envuelve esto va con `pointer-events: none` para no
        // tapar la lista de abajo, así que cada hijo tiene que reactivarlo.
        // Sin esta línea el botón se ve, pero no recibe ni un toque.
        pointerEvents: "auto",
        right: 34,
        // Encima del micrófono, que a su vez flota sobre la barra.
        bottom: "calc(202px + var(--seguro-abajo))",
        width: 52,
        height: 52,
        borderRadius: "50%",
        background: "var(--superficie)",
        border: "1.5px solid var(--borde)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--texto-2)",
        boxShadow: "0 6px 18px rgba(0,0,0,.5)",
      }}
    >
      <Keyboard size={22} />
    </button>
  );
}

/** El botón del micrófono: 84px, abajo a la derecha, siempre visible. */
export function BotonMic({
  escuchando,
  procesando,
  onClick,
}: {
  escuchando: boolean;
  /**
   * Entendiendo lo que acaba de decir o escribir.
   *
   * Se anuncia en el propio botón —anillos girando— y no con una ventana
   * flotante: abrir un cuadro que dice «escuchando» justo después de darle a
   * confirmar es confuso, porque ya no está escuchando nada.
   */
  procesando?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={escuchando ? "Dejar de escuchar" : "Dictar"}
      style={{
        position: "absolute",
        // Igual que el de escribir: la capa padre no deja pasar los toques
        // salvo que cada hijo lo pida. Es el botón más importante de la app.
        pointerEvents: "auto",
        right: 18,
        /*
         * Por encima de la barra de pestañas, no encima de ella. La barra mide
         * unos 90px y el micrófono cae justo sobre la pestaña «Más»: si se
         * solapan, se pulsa una queriendo la otra con el teléfono en una mano.
         */
        bottom: "calc(106px + var(--seguro-abajo))",
        width: 84,
        height: 84,
        borderRadius: "50%",
        background: "var(--acento-900)",
        border: "2px solid var(--acento)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 10px 30px rgba(0,0,0,.6)",
        color: "var(--acento-200)",
      }}
    >
      {escuchando && (
        <div
          style={{
            position: "absolute",
            inset: -2,
            borderRadius: "50%",
            border: "2px solid var(--acento)",
            animation: "dpring 1.35s ease-out infinite",
          }}
        />
      )}
      {procesando && (
        <div
          style={{
            position: "absolute",
            inset: -6,
            borderRadius: "50%",
            border: "3px solid transparent",
            borderTopColor: "var(--acento-claro)",
            borderRightColor: "var(--acento-claro)",
            animation: "dpgira .9s linear infinite",
          }}
        />
      )}
      <Mic size={34} strokeWidth={2} style={{ opacity: procesando ? 0.35 : 1 }} />
    </button>
  );
}

/**
 * El botón «+» de la vista de ruta: agrega a alguien que todavía no está en el
 * directorio y abre su tarjeta de entrega. Ocupa el mismo sitio que el
 * micrófono —abajo a la derecha, 84px— porque hace su papel en esta vista: es
 * la forma de sumar una entrega cuando no se dicta.
 */
export function BotonMas({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Agregar un cliente que no está en la lista"
      style={{
        position: "absolute",
        // Igual que el micrófono: la capa padre no deja pasar los toques salvo
        // que cada hijo lo pida.
        pointerEvents: "auto",
        right: 18,
        bottom: "calc(106px + var(--seguro-abajo))",
        width: 84,
        height: 84,
        borderRadius: "50%",
        background: "var(--acento-900)",
        border: "2px solid var(--acento)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 10px 30px rgba(0,0,0,.6)",
        color: "var(--acento-200)",
      }}
    >
      <Plus size={38} strokeWidth={2.2} />
    </button>
  );
}
