/** Semáforo simples: limita quantas operações assíncronas rodam ao mesmo tempo. */
export class Semaphore {
  private waiting: Array<() => void> = [];
  private active = 0;
  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.waiting.push(resolve)); // a vaga é repassada por quem sai
    else this.active++;
    try {
      return await fn();
    } finally {
      const next = this.waiting.shift();
      if (next) next(); // repassa a vaga sem liberar (evita estourar o limite)
      else this.active--;
    }
  }
}
