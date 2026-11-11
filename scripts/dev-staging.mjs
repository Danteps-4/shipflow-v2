// Levanta el servidor de desarrollo apuntando a la base de STAGING de Neon, con
// el motor de inventario nuevo prendido. Nunca toca producción: se niega a
// arrancar si falta STAGING_DATABASE_URL o si es igual a DATABASE_URL.
//   npm run dev:staging   (puerto 3001)
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const env = {};
for (const linea of readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
  const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const staging = env.STAGING_DATABASE_URL;
if (!staging) { console.error("Falta STAGING_DATABASE_URL en .env.local"); process.exit(1); }
if (staging === env.DATABASE_URL) { console.error("STAGING_DATABASE_URL es igual a DATABASE_URL: se aborta"); process.exit(1); }

const host = staging.match(/@([^/?]+)/)?.[1];
console.log(`[dev:staging] base de datos: ${host} (staging) · INVENTARIO_V2=1 · puerto 3001`);

const proceso = spawn("npx", ["next", "dev", "-p", "3001"], {
  stdio: "inherit", shell: true,
  // Las variables ya definidas en el entorno tienen prioridad sobre .env.local en Next.
  env: { ...process.env, DATABASE_URL: staging, INVENTARIO_V2: "1" },
});
proceso.on("exit", code => process.exit(code ?? 0));
