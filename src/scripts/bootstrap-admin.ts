import { bootstrapAdminService } from "../services/bootstrap-admin.service";

function emailArgument(args: string[]): string {
  const index = args.indexOf("--email");
  const email = index >= 0 ? args[index + 1] : undefined;
  if (!email) throw new Error("Uso: npm run admin:bootstrap -- --email admin@ejemplo.com");
  return email;
}

async function main() {
  const result = await bootstrapAdminService.bootstrap(emailArgument(process.argv.slice(2)));
  console.log(`Administrador inicial configurado: ${result.email} (${result.userId})`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Error desconocido";
  console.error(`No se pudo configurar el administrador: ${message}`);
  process.exitCode = 1;
});
