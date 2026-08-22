import { describe, expect, it } from "vitest";
import { modoHoyEfectivo } from "./ajustes";

describe("cómo se ve Hoy", () => {
  it("con la Agenda a la vista, manda el modo guardado", () => {
    expect(modoHoyEfectivo("agenda", true)).toBe("agenda");
    expect(modoHoyEfectivo("ruta", true)).toBe("ruta");
  });

  /**
   * Lo importante: con la Agenda escondida no se enseña el interruptor, así
   * que si el modo guardado mandara, quien dejó Hoy en "agenda" antes de la
   * actualización se quedaría en una vista sin manera de salir.
   */
  it("con la Agenda escondida es siempre Ruta, diga lo que diga lo guardado", () => {
    expect(modoHoyEfectivo("agenda", false)).toBe("ruta");
    expect(modoHoyEfectivo("ruta", false)).toBe("ruta");
    expect(modoHoyEfectivo("", false)).toBe("ruta");
  });

  it("esconder la Agenda no borra el modo: al volver a enseñarla, sigue donde estaba", () => {
    const guardado = "agenda";
    expect(modoHoyEfectivo(guardado, false)).toBe("ruta");
    expect(modoHoyEfectivo(guardado, true)).toBe("agenda");
  });

  it("un valor raro guardado cae en Ruta, no en una pantalla en blanco", () => {
    expect(modoHoyEfectivo("cualquiera", true)).toBe("ruta");
    expect(modoHoyEfectivo("", true)).toBe("ruta");
  });
});
