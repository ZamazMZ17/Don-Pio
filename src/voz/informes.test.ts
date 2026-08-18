import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import { informeDelDia, informeDeLaSemana } from "./informes";
import { hoyISO } from "../lib/fecha";

/**
 * `pedirInforme` llama a Gemini, y en la suite no hay red ni API key: lo que
 * se puede probar sin mockear nada es el caché — que es la parte con estado y
 * la que puede tener un bug —, y que sin key la llamada real rechaza en vez
 * de colgarse o devolver cualquier cosa.
 */

const HOY = hoyISO();

beforeEach(async () => {
  await Promise.all([
    db.informes.clear(),
    db.ajustes.clear(),
    db.jornadas.clear(),
    db.entregas.clear(),
    db.deudas.clear(),
    db.tiendas.clear(),
    db.gastos.clear(),
  ]);
});

describe("informeDelDia", () => {
  it("sin caché y sin API key, rechaza en vez de devolver cualquier cosa", async () => {
    await expect(informeDelDia(HOY)).rejects.toThrow();
  });

  it("con un informe ya guardado, lo devuelve sin llamar a Gemini", async () => {
    await db.informes.put({
      clave: `dia-${HOY}`,
      resumen: "Repartiste 50 pollos y cobraste S/ 400.",
      destacados: ["Julia te debe desde el jueves."],
      creado: Date.now(),
    });

    const informe = await informeDelDia(HOY);

    expect(informe.resumen).toBe("Repartiste 50 pollos y cobraste S/ 400.");
    expect(informe.destacados).toEqual(["Julia te debe desde el jueves."]);
  });

  it("con `forzar`, ignora el caché y rechaza igual sin API key", async () => {
    await db.informes.put({
      clave: `dia-${HOY}`,
      resumen: "Uno viejo.",
      destacados: [],
      creado: Date.now(),
    });

    await expect(informeDelDia(HOY, true)).rejects.toThrow();
  });
});

describe("informeDeLaSemana", () => {
  it("sin caché y sin API key, rechaza", async () => {
    await expect(informeDeLaSemana()).rejects.toThrow();
  });

  it("con un informe ya guardado para hoy, lo devuelve sin llamar a Gemini", async () => {
    await db.informes.put({
      clave: `semana-${HOY}`,
      resumen: "Repartiste 300 pollos en la semana.",
      destacados: [],
      creado: Date.now(),
    });

    const informe = await informeDeLaSemana();

    expect(informe.resumen).toBe("Repartiste 300 pollos en la semana.");
  });
});
