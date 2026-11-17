/**
 * Links para abrir stories/tasks no próprio Taiga.
 * Precisa de TAIGA_WEB_URL = endereço do SITE do Taiga (o que você abre no navegador),
 * que costuma ser diferente do da API (TAIGA_URL), por exemplo outro subdomínio.
 */
import { isExampleUrl } from "./placeholder";

let warned = false;

function webBase(): string {
  let w = (process.env.TAIGA_WEB_URL ?? "").trim().replace(/\/+$/, "");
  if (isExampleUrl(w)) return ""; // valor de exemplo do .env.example: trata como não configurado
  if (w && !/^https?:\/\//i.test(w)) w = "https://" + w; // tolera "taiga.empresa.com" sem protocolo
  return w;
}

export function taigaWebLink(slug: string | null | undefined, kind: "us" | "task", ref: number): string | null {
  const w = webBase();
  if (!w) {
    if (!warned) { warned = true; console.warn("[taiga] TAIGA_WEB_URL não configurada (ou ainda com o valor de exemplo): os links 'Abrir no Taiga' ficam ocultos. Defina em .env.local o endereço do site do Taiga."); }
    return null;
  }
  return slug ? `${w}/project/${encodeURIComponent(slug)}/${kind}/${ref}` : null;
}
