import { buildApp } from "./app";
import { missingConfig } from "./infra/taiga";

const app = buildApp();
const port = Number(process.env.PORT) || 8080;

const missing = missingConfig();
if (missing.length) app.log.warn({ missing }, "configuração incompleta: /readyz responde 503 e o login fica indisponível");
if (!process.env.INTERNAL_API_KEY) app.log.warn("INTERNAL_API_KEY não definida: qualquer cliente que alcance esta API pode chamá-la (use NetworkPolicy ou defina a chave)");

// O OpenShift manda SIGTERM ao reiniciar/escalar o pod: termina as requisições em andamento antes de sair.
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { app.close().finally(() => process.exit(0)); });

app.listen({ port, host: "0.0.0.0" }).catch((e) => { app.log.error(e); process.exit(1); });
