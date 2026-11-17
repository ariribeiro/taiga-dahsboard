import { webBase } from "./links";
import { allowedRoleNames } from "./roles";
import { BLOCKED_STATUS_PATTERN, PACE_TOLERANCE } from "./metrics";

/** Dias sem alteração para um item em andamento (Kanban) contar como "parado". */
export const STALE_DAYS = Math.max(1, Number(process.env.KANBAN_STALE_DAYS) || 7);

/**
 * Configuração que o front precisa para desenhar a tela (links para o Taiga, textos de ajuda).
 * Fica aqui, e não no front, para haver uma única fonte: o front não conhece as regras de negócio.
 */
export type Meta = {
  webBase: string;               // endereço do SITE do Taiga ("" = links ocultos)
  roles: string[] | null;        // papéis exibidos como cards (null = todos)
  blockedPattern: string;        // regex de status de impedimento (só para a ajuda)
  paceTolerance: number;         // pontos percentuais
  staleDays: number;
};

export const meta = (): Meta => ({
  webBase: webBase(),
  roles: allowedRoleNames(),
  blockedPattern: BLOCKED_STATUS_PATTERN,
  paceTolerance: PACE_TOLERANCE,
  staleDays: STALE_DAYS,
});
