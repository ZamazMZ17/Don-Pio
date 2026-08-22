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
  "ficha",
  "tutorial",
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
    const antes = TODAS.map((p) => atrasDesde(p));
    for (const p of [...TODAS].reverse()) caminoAtras(p);
    expect(TODAS.map((p) => atrasDesde(p))).toEqual(antes);
  });
});

describe("el Detalle vuelve a la lista que lo abrió", () => {
  it("abierto desde Hoy, sale a Hoy", () => {
    expect(atrasDesde("detalle", { detalle: "hoy" })).toBe("hoy");
  });

  it("abierto desde Cobranza, sale a Cobranza — no pierde el sitio de la vuelta", () => {
    expect(atrasDesde("detalle", { detalle: "cobranza" })).toBe("cobranza");
  });

  it("abierto desde un día del Historial, sale a ese día", () => {
    expect(atrasDesde("detalle", { detalle: "dia" })).toBe("dia");
  });

  it("sin origen sabido vuelve a Hoy, como dice la tabla", () => {
    expect(atrasDesde("detalle")).toBe("hoy");
  });

  it("el origen no afecta a ninguna otra pantalla", () => {
    for (const p of TODAS) {
      if (p === "detalle") continue;
      expect(atrasDesde(p, { detalle: "cobranza" })).toBe(atrasDesde(p));
    }
  });

  it("con cualquier origen se sigue llegando a Hoy sin ciclos", () => {
    for (const origen of ["hoy", "cobranza", "dia"] as const) {
      const camino: Pantalla[] = [];
      let actual: Pantalla | null = "detalle";
      for (let i = 0; i < TODAS.length + 1 && actual !== null; i++) {
        actual = atrasDesde(actual, { detalle: origen });
        if (actual) camino.push(actual);
      }
      expect(camino.at(-1)).toBe("hoy");
      expect(new Set(camino).size).toBe(camino.length);
    }
  });
});

describe("la ficha del cliente vuelve a donde se abrió", () => {
  it("abierta desde el directorio, sale al directorio", () => {
    expect(atrasDesde("ficha", { ficha: "tiendas" })).toBe("tiendas");
  });

  it("abierta desde el Detalle, vuelve al Detalle", () => {
    expect(atrasDesde("ficha", { ficha: "detalle" })).toBe("detalle");
  });

  it("sin origen sabido vuelve al directorio, como dice la tabla", () => {
    expect(atrasDesde("ficha")).toBe("tiendas");
  });

  /**
   * El encadenado más largo posible: corrigiendo una entrega en plena vuelta
   * cobrando, se abre su ficha para ver a cómo se le viene cobrando. El atrás
   * tiene que desandarlo entero sin repetir pantalla.
   */
  it("ficha → detalle → cobranza → hoy, sin ciclos", () => {
    const origenes = { ficha: "detalle", detalle: "cobranza" } as const;
    const camino: Pantalla[] = [];
    let actual: Pantalla | null = "ficha";
    for (let i = 0; i < TODAS.length + 1 && actual !== null; i++) {
      actual = atrasDesde(actual, origenes);
      if (actual) camino.push(actual);
    }
    expect(camino).toEqual(["detalle", "cobranza", "hoy"]);
    expect(new Set(camino).size).toBe(camino.length);
  });

  it("con cualquier combinación de orígenes se llega a Hoy sin repetir ninguna", () => {
    for (const ficha of ["tiendas", "detalle"] as const) {
      for (const detalle of ["hoy", "cobranza", "dia"] as const) {
        for (const desde of TODAS) {
          const camino: Pantalla[] = [];
          let actual: Pantalla | null = desde;
          for (let i = 0; i < TODAS.length + 1 && actual !== null; i++) {
            actual = atrasDesde(actual, { ficha, detalle });
            if (actual) camino.push(actual);
          }
          expect(actual).toBeNull();
          expect(new Set(camino).size).toBe(camino.length);
          if (desde !== "hoy") expect(camino.at(-1)).toBe("hoy");
        }
      }
    }
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
