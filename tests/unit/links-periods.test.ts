import { afterEach, describe, expect, it, vi } from "vitest";
import { taigaWebLink } from "@/lib/links";
import { DEFAULT_PERIOD, PERIODS, parsePeriod } from "@/lib/periods";
import { isExampleUrl } from "@/lib/placeholder";

afterEach(() => { vi.unstubAllEnvs(); });

describe("taigaWebLink", () => {
  it("monta o link de story e de task", () => {
    vi.stubEnv("TAIGA_WEB_URL", "https://taiga.exemplo.com");
    expect(taigaWebLink("meu-projeto", "us", 12)).toBe("https://taiga.exemplo.com/project/meu-projeto/us/12");
    expect(taigaWebLink("meu-projeto", "task", 7)).toBe("https://taiga.exemplo.com/project/meu-projeto/task/7");
  });
  it("remove a barra final e completa o https quando falta o protocolo", () => {
    vi.stubEnv("TAIGA_WEB_URL", "taiga.exemplo.com/");
    expect(taigaWebLink("p", "us", 1)).toBe("https://taiga.exemplo.com/project/p/us/1");
  });
  it("sem a variável (ou sem slug) não há link", () => {
    vi.stubEnv("TAIGA_WEB_URL", "");
    expect(taigaWebLink("p", "us", 1)).toBeNull();
    vi.stubEnv("TAIGA_WEB_URL", "https://t.com");
    expect(taigaWebLink(undefined, "us", 1)).toBeNull();
  });
  it("o endereço de exemplo do .env.example conta como não configurado (sem link quebrado)", () => {
    vi.stubEnv("TAIGA_WEB_URL", "https://taiga.suaempresa.com");
    expect(taigaWebLink("p", "us", 1)).toBeNull();
  });
  it("codifica o slug", () => {
    vi.stubEnv("TAIGA_WEB_URL", "https://t.com");
    expect(taigaWebLink("a b/c", "us", 1)).toBe("https://t.com/project/a%20b%2Fc/us/1");
  });
});

describe("parsePeriod", () => {
  it("aceita só os períodos conhecidos", () => {
    for (const p of PERIODS) expect(parsePeriod(String(p))).toBe(p);
  });
  it("valores inválidos voltam ao padrão", () => {
    for (const v of [undefined, "", "abc", "15", "-14", "28.5"]) expect(parsePeriod(v), String(v)).toBe(DEFAULT_PERIOD);
  });
});

describe("isExampleUrl", () => {
  it("reconhece os endereços de exemplo, com ou sem protocolo, porta ou caminho", () => {
    for (const u of ["https://taiga.suaempresa.com", "https://taiga-api.suaempresa.com/", "http://taiga.suaempresa.com:8000", "taiga.suaempresa.com", "https://x.suaempresa.com.br/y"])
      expect(isExampleUrl(u), u).toBe(true);
  });
  it("não confunde endereços reais, nem valores vazios", () => {
    for (const u of ["https://taiga.minhaempresa.com", "https://suaempresa.com.evil.io", "http://localhost:9000", "https://taiga.exemplo.com", "", undefined, null])
      expect(isExampleUrl(u as string), String(u)).toBe(false);
  });
});
