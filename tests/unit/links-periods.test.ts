import { afterEach, describe, expect, it, vi } from "vitest";
import { taigaWebLink } from "@/lib/links";
import { DEFAULT_PERIOD, PERIODS, parsePeriod } from "@/lib/periods";

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
