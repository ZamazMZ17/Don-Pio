// Genera los íconos de la PWA y los del APK. `npm run iconos`
//
// **Si existe `marca/logo.png`, ese archivo manda.** El dibujo de aquí es solo
// el respaldo, para que la app nunca se quede sin ícono.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const FONDO = "#1b1d2c";
const ACENTO = "#9184d9";
const AMBAR = "#e0a06a";
const CRESTA = "#e07a6a";

const ORIGINAL = "marca/logo.png";
const hayOriginal = existsSync(ORIGINAL);

async function prepararOriginal() {
  const base = sharp(ORIGINAL);
  const { data } = await base
    .clone()
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const fondo = { r: data[0], g: data[1], b: data[2], alpha: 1 };
  const recortado = await base.clone().trim({ threshold: 12 }).toBuffer();
  return { fondo, recortado };
}

const original = hayOriginal ? await prepararOriginal() : null;
const FONDO_RGB = original ? original.fondo : { r: 0x1b, g: 0x1d, b: 0x2c, alpha: 1 };

/**
 * El respaldo: la silueta de un pollo. Nada de letras — a 48 px una «DP» es
 * una mancha, y una silueta se reconoce hasta en el cajón de aplicaciones.
 */
const marca = ({ fondo = FONDO, cuerpo = AMBAR, plano = false } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${fondo === "none" ? "" : `<rect width="512" height="512" rx="112" fill="${fondo}"/>`}
  ${plano ? "" : `<circle cx="256" cy="262" r="168" fill="none" stroke="${ACENTO}" stroke-width="16" opacity="0.55"/>`}
  <g transform="translate(256 268) scale(1.06)">
    <!-- cuerpo -->
    <ellipse cx="6" cy="34" rx="92" ry="76" fill="${cuerpo}"/>
    <!-- cola: arranca dentro del cuerpo para que no parezca despegada -->
    <path d="M -50 -6 L -134 -62 L -104 42 Z" fill="${cuerpo}"/>
    <!-- cabeza -->
    <circle cx="62" cy="-46" r="50" fill="${cuerpo}"/>
    <!-- cresta -->
    <path d="M 34 -88 q 12 -34 28 -12 q 14 -32 28 -8 q 16 -26 22 4"
          fill="none" stroke="${plano ? cuerpo : CRESTA}" stroke-width="17"
          stroke-linecap="round" stroke-linejoin="round"/>
    <!-- pico -->
    <path d="M 108 -50 L 146 -36 L 108 -22 Z" fill="${plano ? cuerpo : CRESTA}"/>
    <!-- ojo -->
    ${plano ? "" : `<circle cx="74" cy="-56" r="10" fill="${FONDO}"/>`}
    <!-- patas -->
    <path d="M -18 106 L -18 140 M -34 140 L 2 140 M 44 106 L 44 140 M 28 140 L 64 140"
          stroke="${cuerpo}" stroke-width="15" stroke-linecap="round" fill="none"/>
  </g>
</svg>`;

async function png(svg, px, { recorte = 0.86, transparente = false } = {}) {
  if (!original) return sharp(Buffer.from(svg)).resize(px, px).png();

  const dentro = Math.round(px * recorte);
  const contenido = await sharp(original.recortado)
    .resize(dentro, dentro, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const borde = Math.round((px - dentro) / 2);
  return sharp({
    create: {
      width: px,
      height: px,
      channels: 4,
      background: transparente ? { r: 0, g: 0, b: 0, alpha: 0 } : FONDO_RGB,
    },
  })
    .composite([{ input: contenido, top: borde, left: borde }])
    .png();
}

console.log(hayOriginal ? `· usando ${ORIGINAL}` : `· usando el respaldo (no hay ${ORIGINAL})`);

/* ── PWA ─────────────────────────────────────────────────────────── */
await mkdir("public", { recursive: true });
for (const [ruta, px, opciones] of [
  ["public/icono-192.png", 192, {}],
  ["public/icono-512.png", 512, {}],
  ["public/icono-180.png", 180, {}],
  ["public/icono-512-maskable.png", 512, { recorte: 0.68 }],
]) {
  await (await png(marca(opciones), px, opciones)).toFile(ruta);
  console.log("✓", ruta);
}

/* ── APK ─────────────────────────────────────────────────────────── */
const RES = "android/app/src/main/res";
if (!existsSync(RES)) {
  console.log("· sin proyecto android, me salto los íconos del APK");
  process.exit(0);
}

const DENSIDADES = [
  ["mdpi", 48, 108],
  ["hdpi", 72, 162],
  ["xhdpi", 96, 216],
  ["xxhdpi", 144, 324],
  ["xxxhdpi", 192, 432],
];

const circulo = (px) =>
  Buffer.from(
    `<svg width="${px}" height="${px}"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}" fill="#fff"/></svg>`,
  );

for (const [densidad, launcher, adaptativo] of DENSIDADES) {
  const dir = join(RES, `mipmap-${densidad}`);
  await mkdir(dir, { recursive: true });

  await (await png(marca(), launcher)).toFile(join(dir, "ic_launcher.png"));

  await (await png(marca(), launcher))
    .composite([{ input: circulo(launcher), blend: "dest-in" }])
    .toFile(join(dir, "ic_launcher_round.png"));

  await (
    await png(marca({ fondo: "none" }), adaptativo, {
      // El lanzador recorta hasta el 66 % central: la marca va más adentro.
      recorte: 0.58,
      transparente: true,
    })
  ).toFile(join(dir, "ic_launcher_foreground.png"));

  // La silueta de la barra de estado se dibuja siempre: Android la pinta de un
  // solo color y de una imagen a color no sale nada legible.
  const drawable = join(RES, `drawable-${densidad}`);
  await mkdir(drawable, { recursive: true });
  await sharp(Buffer.from(marca({ fondo: "none", cuerpo: "#FFFFFF", plano: true })))
    .resize(launcher, launcher)
    .png()
    .toFile(join(drawable, "ic_stat_donpio.png"));

  console.log("✓", dir);
}

const hex = (c) => "#" + [c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, "0")).join("");
const fondoAdaptativo = original ? hex(original.fondo) : FONDO;

await mkdir(join(RES, "values"), { recursive: true });
await writeFile(
  join(RES, "values/ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${fondoAdaptativo}</color>
</resources>
`,
);
console.log("✓ fondo del ícono adaptativo:", fondoAdaptativo);
