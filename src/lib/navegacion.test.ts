import { describe, expect, it } from "vitest";
import { atrasDesde, esRaiz, PADRE, RAIZ, type Pantalla } from "./navegacion";

const TODAS: Pantalla[] = [
  "hoy",
  "cobranza",
  "detalle",
  "cierre",
  "tiendas",
  "historial",
  "dia",
  "ajustes",
  "stock",
  "gastos",
  "menu",
];

/** Aprieta atrás hasta salir, o se rinde si no llega — un ciclo. */
function caminoAtras(desde: Pantalla, tope = TODAS.length + 1): Pantalla[] {
  const camino: Pantalla[] = [];
  let actual: Pantalla | null = desde;
  for (let i = 0; i < tope; i++) {
    actual = atrasDesde(actual);
    if (actual === null) return camino;
    camino.push(actual);
  }
  throw new Error(`el atrás desde "${desde}" no llega nunca a Hoy: ${camino.join(" → ")}`);
}

describe("el atrás", () => {
  it("desde Hoy no lleva a ninguna pantalla: la app pasa a segundo plano", () => {
    expect(atrasDesde("hoy")).toBeNull();
  });

  it("desde cualquier otra pestaña lleva a Hoy", () => {
    for (const p of RAIZ) {
      if (p === "hoy") continue;
      expect(atrasDesde(p)).toBe("hoy");
    }
  });

  it("desde cualquier pantalla acaba en Hoy, sin quedarse dando vueltas", () => {
    for (const p of TODAS) {
      const camino = caminoAtras(p);
      if (p !== "hoy") expect(camino.at(-1)).toBe("hoy");
    }
  });

  it("nunca se repite una pantalla en el camino de salida", () => {
    for (const p of TODAS) {
      const camino = caminoAtras(p);
      expect(new Set(camino).size).toBe(camino.length);
    }
  });

  it("Historial y Día no se quedan dando vueltas entre las dos", () => {
    expect(atrasDesde("dia")).toBe("historial");
    expect(atrasDesde("historial")).toBe("hoy");
  });

  /**
   * El fallo reportado: tras un día de reparto —abriendo y cerrando el
   * Detalle de muchas entregas—, entrar a Más → Historial → un día y
   * retroceder abría a editar una entrega cualquiera. La pila guardaba
   * "detalle" porque salir de una pantalla la apilaba.
   *
   * Ahora el atrás no depende de por dónde pasó: desde Historial es Hoy,
   * se haya abierto el Detalle mil veces antes o ninguna.
   */
  it("salir del Detalle muchas veces no cambia a dónde lleva el atrás después", () => {
    for (let i = 0; i < 15; i++) {
      expect(atrasDesde("detalle")).toBe("hoy");
    }
    // Más → Historial → un día → atrás → atrás
    expect(atrasDesde("dia")).toBe("historial");
    expect(atrasDesde("historial")).toBe("hoy");
    expect(atrasDesde("historial")).not.toBe("detalle");
  });

  it("no depende del orden ni de cuántas veces se llame: es una función pura", () => {
    const antes = TODAS.map(atrasDesde);
    for (const p of [...TODAS].reverse()) caminoAtras(p);
    expect(TODAS.map(atrasDesde)).toEqual(antes);
  });
});

describe("la tabla de pantallas", () => {
  it("cubre todas las que no son pestaña, y solo esas", () => {
    const ramas = TODAS.filter((p) => !esRaiz(p)).sort();
    expect(Object.keys(PADRE).sort()).toEqual(ramas);
  });

  it("Gastos sale a Menú, que es de donde se abre", () => {
    expect(PADRE.gastos).toBe("menu");
  });
});
