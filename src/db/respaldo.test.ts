import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, tiendaNueva, type Entrega } from "./db";
import { generarRespaldo, restaurarRespaldo, type Respaldo } from "./respaldo";
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

  it("no mezcla tiendas ajenas con las propias solo porque coincida el id autoincremental", async () => {
    // El celular destino ya tiene su propia tienda en el id=1.
    await db.tiendas.put({
      ...tiendaNueva("Rosa, celular destino", "rosa celular destino"),
      id: 1,
      creada: 1000,
    });

    // El respaldo viene de otro celular, cuya tienda "Manuel" también nació
    // con id=1 ahí — mismo número, entidad completamente distinta.
    const manuel = { ...tiendaNueva("Manuel, celular de origen", "manuel celular de origen"), id: 1, creada: 2000 };
    const entregaAjena: Entrega = {
      id: 7,
      fecha: "2026-01-05",
      tiendaId: 1,
      orden: 1,
      minuto: 400,
      pollos: 3,
      piernas: 0,
      pechos: 0,
      sinPesar: 0,
      tandas: [],
      peso: 0,
      precioKg: 0,
      totalCalculado: 0,
      totalCobrado: 0,
      descuentoRedondeo: 0,
      estadoPago: "pendiente",
      notas: "",
      creada: 3000,
    };
    const respaldoAjeno: Respaldo = {
      version: 1,
      creado: new Date().toISOString(),
      tiendas: [manuel],
      jornadas: [],
      entregas: [entregaAjena],
      pagos: [],
      deudas: [],
      gastos: [],
      ajustes: [],
    };

    await restaurarRespaldo(respaldoAjeno);

    const propia = await db.tiendas.get(1);
    expect(propia?.nombre).toBe("Rosa, celular destino");

    const ajena = (await db.tiendas.toArray()).find((t) => t.nombre === "Manuel, celular de origen");
    expect(ajena).toBeDefined();
    expect(ajena!.id).not.toBe(1);

    // La entrega restaurada tiene que apuntar a la tienda "Manuel" recién
    // creada, nunca a "Rosa" solo porque el id=1 original ya estaba ocupado.
    const entregas = await db.entregas.toArray();
    const entregaRestaurada = entregas.find((e) => e.creada === 3000);
    expect(entregaRestaurada?.tiendaId).toBe(ajena!.id);
  });

  it("rechaza un archivo que no es un respaldo de Don Pio", async () => {
    await expect(restaurarRespaldo({ hola: "mundo" })).rejects.toThrow();
    await expect(restaurarRespaldo(null)).rejects.toThrow();
    await expect(restaurarRespaldo("no soy json de respaldo")).rejects.toThrow();
  });
});
