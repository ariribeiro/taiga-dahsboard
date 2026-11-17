import { describe, expect, it } from "vitest";
import { Semaphore } from "@/infra/limit";

const tick = (ms = 5) => new Promise<void>((r) => setTimeout(r, ms));

describe("Semaphore", () => {
  it("nunca passa do limite de operações simultâneas", async () => {
    const s = new Semaphore(3);
    let active = 0, peak = 0;
    await Promise.all(Array.from({ length: 12 }, () => s.run(async () => { active++; peak = Math.max(peak, active); await tick(); active--; })));
    expect(peak).toBe(3);
  });
  it("atende na ordem de chegada", async () => {
    const s = new Semaphore(1); const order: number[] = [];
    await Promise.all([1, 2, 3, 4].map((n) => s.run(async () => { order.push(n); await tick(2); })));
    expect(order).toEqual([1, 2, 3, 4]);
  });
  it("libera a vaga mesmo quando a operação falha", async () => {
    const s = new Semaphore(1);
    await expect(s.run(async () => { throw new Error("falhou"); })).rejects.toThrow("falhou");
    await expect(s.run(async () => "ok")).resolves.toBe("ok");   // não trava
  });
  it("devolve o resultado da operação", async () => {
    expect(await new Semaphore(2).run(async () => 42)).toBe(42);
  });
});
