import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import { limpiarAudiosViejos } from "./interpretar";

beforeEach(async () => {
  await db.dictados.clear();
});

async function agregar(datos: {
  estado: "pendiente" | "procesado" | "descartado";
  diasAtras: number;
  conAudio?: boolean;
}): Promise<number> {
  return db.dictados.add({
    fecha: "2026-08-10",
    minuto: 480,
    transcripcion: "Rosa 2 pollos",
    audioBlob: datos.conAudio === false ? undefined : new Blob(["audio"]),
    duracionMs: 3000,
    estado: datos.estado,
    creada: Date.now() - datos.diasAtras * 24 * 60 * 60 * 1000,
  });
}

describe("limpiarAudiosViejos", () => {
  it("suelta el audio de un dictado procesado hace más de 3 días", async () => {
    const id = await agregar({ estado: "procesado", diasAtras: 5 });
    await limpiarAudiosViejos();
    expect((await db.dictados.get(id))?.audioBlob).toBeUndefined();
  });

  it("no toca el audio de uno reciente, aunque ya esté procesado", async () => {
    const id = await agregar({ estado: "procesado", diasAtras: 1 });
    await limpiarAudiosViejos();
    expect((await db.dictados.get(id))?.audioBlob).toBeInstanceOf(Blob);
  });

  it("no toca un dictado todavía pendiente, aunque sea viejo", async () => {
    // Uno que se quedó sin repasar por Gemini: su audio no es el camino de
    // reintento (ese usa el texto), pero tampoco hay apuro en borrarlo justo
    // cuando todavía está en la cola.
    const id = await agregar({ estado: "pendiente", diasAtras: 10 });
    await limpiarAudiosViejos();
    expect((await db.dictados.get(id))?.audioBlob).toBeInstanceOf(Blob);
  });

  it("no rompe nada con un dictado que ya no tenía audio (dictado por teclado)", async () => {
    const id = await agregar({ estado: "procesado", diasAtras: 10, conAudio: false });
    await expect(limpiarAudiosViejos()).resolves.not.toThrow();
    expect((await db.dictados.get(id))?.audioBlob).toBeUndefined();
  });

  it("no toca la transcripción, solo el audio", async () => {
    const id = await agregar({ estado: "descartado", diasAtras: 30 });
    await limpiarAudiosViejos();
    expect((await db.dictados.get(id))?.transcripcion).toBe("Rosa 2 pollos");
  });
});
