// Compila el APK y lo instala en el teléfono conectado. `npm run apk`
import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const APK = "android/app/build/outputs/apk/debug/app-debug.apk";
/** Copia a mano, fuera de las carpetas de compilación, para poder llevársela. */
const COPIA = "DonPio.apk";

/**
 * Gradle necesita un JDK 17 o más nuevo. El `java` del PATH suele ser un
 * Java 8 viejo, así que se busca el que trae Android Studio.
 */
function buscarJdk() {
  const candidatos = [
    process.env.DONPIO_JAVA_HOME,
    "C:/Program Files/Android/Android Studio1/jbr",
    "C:/Program Files/Android/Android Studio/jbr",
    join(homedir(), "AppData/Local/Programs/Android Studio/jbr"),
    process.env.JAVA_HOME,
  ].filter(Boolean);
  return candidatos.find(
    (r) => existsSync(join(r, "bin/java.exe")) || existsSync(join(r, "bin/java")),
  );
}

function buscarAdb() {
  const candidatos = [
    join(homedir(), "AppData/Local/Android/Sdk/platform-tools/adb.exe"),
    join(homedir(), "Android/Sdk/platform-tools/adb"),
    "adb",
  ];
  return candidatos.find((r) => r === "adb" || existsSync(r));
}

const jdk = buscarJdk();
if (!jdk) {
  console.error("No encontré un JDK 17+. Instala uno o define DONPIO_JAVA_HOME.");
  process.exit(1);
}

const entorno = {
  ...process.env,
  JAVA_HOME: jdk,
  ANDROID_HOME: process.env.ANDROID_HOME ?? join(homedir(), "AppData/Local/Android/Sdk"),
};

console.log("· compilando la web…");
execSync("npm run build", { stdio: "inherit" });

console.log("· pasándola al proyecto android…");
execSync("npx cap sync android", { stdio: "inherit" });

console.log(`· compilando el APK (JDK: ${jdk})…`);
// Ruta absoluta y por shell: en Windows, cmd no ejecuta un .bat del directorio
// actual si no lleva ruta, y Node ya no lanza .bat sin shell.
const gradlew = resolve("android", process.platform === "win32" ? "gradlew.bat" : "gradlew");
execSync(`"${gradlew}" assembleDebug`, { cwd: "android", stdio: "inherit", env: entorno });

copyFileSync(APK, COPIA);
console.log(`✓ ${COPIA} listo en la carpeta del proyecto`);

const adb = buscarAdb();
if (!adb) {
  console.log("· no hay adb: instálalo a mano desde ese archivo.");
  process.exit(0);
}

const dispositivos = execFileSync(adb, ["devices"], { encoding: "utf8" })
  .split("\n")
  .slice(1)
  .filter((l) => l.trim().endsWith("device"));

if (dispositivos.length === 0) {
  console.log("· no hay ningún dispositivo conectado; el archivo ya está listo.");
  process.exit(0);
}

console.log("· instalando…");
execFileSync(adb, ["install", "-r", APK], { stdio: "inherit" });
// `am start`, no `monkey`: monkey inyecta un evento aleatorio al lanzar y
// puede tocar o arrastrar cosas de la interfaz sin que nadie se entere.
execFileSync(adb, ["shell", "am", "start", "-n", "com.donpio.app/.MainActivity"], {
  stdio: "ignore",
});
console.log("✓ instalada y abierta en el dispositivo");
