import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Funciona desde src/config y dist/config; no requiere copiar secretos al build. */
const metadata = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8")) as { version: string };

export const APP_VERSION = metadata.version;
