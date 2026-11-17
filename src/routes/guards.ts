import type { FastifyReply, FastifyRequest } from "fastify";
import { getSession, type Session } from "../infra/session";
import { hasProjectAccess } from "../infra/taiga";

export type Q = Record<string, string | undefined>;

/** Identificador de sessão do cabeçalho `Authorization: Bearer <sid>` (64 hex), ou null. */
export const bearer = (req: FastifyRequest): string | null => {
  const m = /^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization ?? "");
  return m ? m[1] : null;
};

/** Exige sessão válida. Devolve a identidade, ou null depois de responder 401. */
export function requireSession(req: FastifyRequest, reply: FastifyReply): Session | null {
  const s = getSession(bearer(req));
  if (!s) { reply.code(401).send({ error: "UNAUTHENTICATED" }); return null; }
  return s;
}

/** Converte um id numérico da URL; null se inválido. */
export const toId = (v: string | undefined) => (/^\d{1,9}$/.test(v ?? "") ? Number(v) : null);

/**
 * Valida o id do projeto e o papel da pessoa nele. Devolve o id, ou null depois de responder 400/403.
 * O usuário de serviço enxerga mais do que cada pessoa: TODA rota que receba um projeto deve passar por aqui.
 */
export async function guardProject(reply: FastifyReply, s: Session, raw: string | undefined): Promise<number | null> {
  const pid = toId(raw);
  if (pid == null) { reply.code(400).send({ error: "BAD_REQUEST" }); return null; }
  if (!(await hasProjectAccess(s.userId, pid))) { reply.code(403).send({ error: "FORBIDDEN" }); return null; }
  return pid;
}
