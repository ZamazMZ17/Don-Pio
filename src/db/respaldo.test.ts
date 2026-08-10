import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { generarRespaldo, restaurarRespaldo } from "./respaldo";
import { crearTienda } from "./tiendas";
import { CLAVE_API, guardarAjuste } from "../voz/ajustes";

beforeEach(async () => {
  await Promise.all([
    db.tiendas.clear(),
    db.entregas.clear(),
    db.deudas.clear(),
    db.pagos.clear(),
    db.jornadas.clear(),
    db.gastos.clear(),
    db.ajustes.clear(),
  ]);
});

describe("respaldo", () => {
  it("nunca lleva la API key, pero sí el resto de los ajustes", async () => {
    await guardarAjuste(CLAVE_API, "una-key-secreta");
    await guardarAjuste("avisoSonido", "1");

    const r = await generarRespaldo();

    expect(r.ajustes.find((a) => a.clave === CLAVE_API)).toBeUndefined();
    expect(r.ajustes.find((a) => a.clave === "avisoSonido")?.valor).toBe("1");
  });

  it("restaura el directorio de tiendas tal cual estaba", async () => {
    await crearTienda("Doña Elsa");
    await crearTienda("Bodega Sarita");

    const r = await generarRespaldo();
    await db.tiendas.clear();
    expect(await db.tiendas.count()).toBe(0);

    await restaurarRespaldo(r);
    const nombres = (await db.tiendas.toArray()).map((t) => t.nombre).sort();
    expect(nombres).toEqual(["Bodega Sarita", "Doña Elsa"]);
  });

  it("restaurar no borra lo que ya había, solo agrega o actualiza por clave", async () => {
    const propia = await crearTienda("Mi tienda de este teléfono");
    const ajena = await crearTienda("Tienda del respaldo");
    const r = await generarRespaldo();

    // Simula que en este teléfono esa tienda ya no existe: se borró después
    // de sacar el respaldo, pero la propia se mantiene.
    await db.tiendas.delete(ajena.id!);
    expect(await db.tiendas.count()).toBe(1);

    await restaurarRespaldo(r);

    const nombres = (await db.tiendas.toArray()).map((t) => t.nombre).sort();
    expect(nombres).toEqual(["Mi tienda de este teléfono", "Tienda del respaldo"]);
    expect(await db.tiendas.get(propia.id!)).toBeDefined();
  });

  it("rechaza un archivo que no es un respaldo de Don Pio", async () => {
    await expect(restaurarRespaldo({ hola: "mundo" })).rejects.toThrow();
    await expect(restaurarRespaldo(null)).rejects.toThrow();
    await expect(restaurarRespaldo("no soy json de respaldo")).rejects.toThrow();
  });
});
