/** Link para abrir um item no Taiga (precisa de TAIGA_WEB_URL = endereço do frontend). */
export function taigaWebLink(slug: string, kind: "us" | "task", ref: number): string | null {
  const web = (process.env.TAIGA_WEB_URL ?? "").replace(/\/+$/, "");
  return web ? `${web}/project/${slug}/${kind}/${ref}` : null;
}
