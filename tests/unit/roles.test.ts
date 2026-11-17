import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ROLES, allowedRoleNames, allowedRoleSet, normRole } from "@/domain/roles";

afterEach(() => { delete process.env.DEV_ROLES; });

describe("normRole", () => {
  it("ignora maiúsculas, acentos e plural", () => {
    expect(normRole("Analista de negócios e requisitos")).toBe(normRole("ANALISTA DE NEGÓCIO E REQUISITOS"));
    expect(normRole("Desenvolvedores")).toBe(normRole("DESENVOLVEDOR"));
    expect(normRole("Estagiários")).toBe(normRole("estagiário"));
  });
  it("não confunde papéis diferentes", () => {
    expect(normRole("Analista de UX")).not.toBe(normRole("Analista de teste de qualidade"));
    expect(normRole("Product Owner")).not.toBe(normRole("Desenvolvedor"));
  });
});

describe("papéis permitidos", () => {
  it("o padrão tem os 7 papéis e aceita as variações do Taiga", () => {
    const set = allowedRoleSet()!;
    expect(DEFAULT_ROLES).toHaveLength(7);
    for (const r of ["DESENVOLVEDOR", "Analista de negócios e requisitos", "ANALISTA DE TESTE DE QUALIDADE", "ADMINISTRADOR DE DADOS", "Estagiário", "Arquiteto", "Analista de UX"])
      expect(set.has(normRole(r)), r).toBe(true);
  });
  it("rejeita outros papéis", () => {
    const set = allowedRoleSet()!;
    for (const r of ["Product Owner", "Gerente de Projeto", "Analista de Sistemas", "Fora do projeto"]) expect(set.has(normRole(r)), r).toBe(false);
  });
  it("DEV_ROLES troca a lista", () => {
    process.env.DEV_ROLES = "Desenvolvedor, Arquiteto";
    expect(allowedRoleNames()).toEqual(["Desenvolvedor", "Arquiteto"]);
    expect(allowedRoleSet()!.has(normRole("Estagiário"))).toBe(false);
  });
  it("DEV_ROLES=* desliga o filtro", () => {
    process.env.DEV_ROLES = "*";
    expect(allowedRoleNames()).toBeNull();
    expect(allowedRoleSet()).toBeNull();
  });
  it("DEV_ROLES vazio volta ao padrão", () => {
    process.env.DEV_ROLES = "  ";
    expect(allowedRoleNames()).toEqual(DEFAULT_ROLES);
  });
});
