import { describe, expect, it } from "vitest";
import type { Tienda } from "../db/db";
import { paradaDe, paradaReciente, SIN_RUTA, VISITAS_RUTA } from "./ruta";

function tienda(posiciones: number[], ordenRuta = 0): Tienda {
  return {
    nombre: "X",
    alias: [],
    minutos: [],
    posiciones,
    precedentes: {},
    ordenRuta,
    pesa: 1,
    precioKgDefecto: 0,
    precioOffsetKg: 0,
    creada: 0,
  } as unknown as Tienda;
}

describe("la parada por la que se ordena la ruta", () => {
  it("mira las dos últimas semanas de visitas", () => {
    expect(VISITAS_RUTA).toBe(14);
  });

  it("sin visitas todavía, no hay parada conocida", () => {
    expect(paradaReciente(tienda([]))).toBeNull();
  });

  it("promedia solo las últimas VISITAS_RUTA visitas, no todo el historial", () => {
    // 20 visitas: 6 antiguas en la parada 1, y 14 recientes en la 10.
    const posiciones = [...Array(6).fill(1), ...Array(VISITAS_RUTA).fill(10)];
    expect(paradaReciente(tienda(posiciones))).toBe(10);
  });

  /**
   * Lo que motivó subir la ventana de 2 a 14. Con 2, un solo día raro era la
   * mitad de la muestra y reescribía el orden al día siguiente.
   */
  it("un día suelto fuera de sitio ya no desordena la ruta", () => {
    const habitual = Array(13).fill(4);
    const conRareza = tienda([...habitual, 30]);
    // Con la ventana vieja de 2 mandaría la rareza; con 14 apenas se nota.
    const vieja = [...habitual, 30].slice(-2);
    expect(vieja.reduce((a, b) => a + b, 0) / 2).toBe(17);
    expect(paradaReciente(conRareza)!).toBeLessThan(7);
  });

  it("pero si la ruta cambia de verdad, termina moviéndose", () => {
    const t = tienda([...Array(14).fill(4), ...Array(14).fill(20)]);
    expect(paradaReciente(t)).toBe(20);
  });

  it("la parada de hoy manda sobre el promedio", () => {
    const t = tienda(Array(14).fill(4));
    expect(paradaDe(t, 19)).toBe(19);
    expect(paradaDe(t)).toBe(4);
  });

  it("sin visitas cae a su orden aprendido, y sin eso al final de la lista", () => {
    expect(paradaDe(tienda([], 7))).toBe(7);
    expect(paradaDe(tienda([], 0))).toBe(SIN_RUTA);
  });

  it("ordena la lista de menor a mayor parada, y las desconocidas al final", () => {
    const lista = [
      { n: "tercera", t: tienda([9, 9]) },
      { n: "nueva", t: tienda([]) },
      { n: "primera", t: tienda([1, 1]) },
      { n: "segunda", t: tienda([5, 5]) },
    ];
    const ordenada = [...lista].sort((a, b) => paradaDe(a.t) - paradaDe(b.t)).map((x) => x.n);
    expect(ordenada).toEqual(["primera", "segunda", "tercera", "nueva"]);
  });
});
