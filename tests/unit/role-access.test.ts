import { describe, expect, it } from "vitest";
import { isAllowedRole } from "@/infra/taiga";

describe("isAllowedRole", () => {
  it("aceita as variações com servidor, fiscal ou fiscalização", () => {
    for (const r of ["Servidor Dirti/Fiscal", "SERVIDOR/DIRTI/FISCALIZAÇÃO", "fiscalizacao", "Servidor", "Fiscal Técnico"])
      expect(isAllowedRole(r), r).toBe(true);
  });
  it("rejeita outros papéis e valores vazios", () => {
    for (const r of ["Desenvolvedor", "Product Owner", "", null, undefined])
      expect(isAllowedRole(r as string | null | undefined), String(r)).toBe(false);
  });
});
