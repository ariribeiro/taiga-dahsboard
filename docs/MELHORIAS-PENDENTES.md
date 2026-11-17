# Melhorias pendentes de arquitetura e segurança

Resultado de uma revisão de código (sem teste de invasão) feita em **17/11/2026**. Este documento registra o que **já foi feito** e o que **ficou para depois**, para retomarmos sem perder o contexto.

Legenda de esforço: **P** (horas) · **M** (1 a 3 dias) · **G** (mais de 3 dias).

## ✅ Já feito (pacote 1)

| Item | O que mudou | Como foi verificado |
|---|---|---|
| Cabeçalhos de segurança | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP e HSTS (produção); `X-Powered-By` removido. Ver `next.config.mjs`. | Navegador real em modo produção percorrendo toda a interface: **0 violações de CSP**. |
| Otimizador de imagens desligado | `images.unoptimized: true` (o app não usa `next/image`). | `/_next/image` responde **404**. |
| Limite de tentativas de login | Janela deslizante por usuário e por IP, bloqueando **antes** de consultar o Taiga. Só credenciais recusadas contam. Ver `lib/ratelimit.ts`. | 4ª tentativa bloqueada mesmo com a senha certa; outro usuário não é afetado; sucesso zera o contador; falha de rede não conta. |
| Sessões com prazo | Expiração por inatividade (padrão 2 h) e duração máxima (12 h), limpeza periódica, teto de 5.000 sessões, novo login encerra a sessão anterior e cookie `__Host-` em produção. Ver `lib/session.ts`. | Uso renova o prazo, inatividade expira e o cookie antigo é recusado (401). |
| Cliente do Taiga robusto | Timeout (20 s), até 2 retentativas em 429/502/503/504 e falhas de rede, e no máximo 8 requisições simultâneas. Ver `lib/taiga.ts` e `lib/limit.ts`. | Timeout em 1,5 s com a API travada; página carrega com o 503 na 1ª chamada; pico de requisições limitado a 3 quando configurado (era 7). |
| Links de anexo | Só `http(s)` ou caminho relativo; `javascript:`, `data:` e `ftp:` são descartados. | Anexos maliciosos do simulador não chegam ao navegador. |
| Dependências | Next atualizado para 14.2.35 e Dependabot semanal (`.github/dependabot.yml`). | Veja o item A abaixo: **não resolve o `npm audit`**. |
| Servidor de desenvolvimento | `npm run dev` agora escuta só em `127.0.0.1` (antes, em todas as interfaces). | — |

## 🔴 Pendências de prioridade alta

### A. Migrar o Next.js para uma versão com as correções — **G**
O `npm audit --omit=dev` continua em **1 crítica e 1 alta** mesmo no 14.2.35: o Next 14 deixou de receber correções, e elas só existem a partir do **Next 15.5.x/16**. A correção completa indicada pelo audit é o **Next 16.4.6** (versão maior).

- Itens relevantes: execução remota no otimizador de imagens (AVIF/SVG), execução remota em servidores Windows, vários DoS em Server Components/Server Actions, SSRF e *cache poisoning*. Vários dependem de recursos que o app **não usa** (Server Actions, middleware, rewrites), e o otimizador já está desligado. Mesmo assim, o ideal é sair de uma versão sem suporte.
- **Mitigações já aplicadas:** otimizador de imagens desligado, servidor de desenvolvimento só em `127.0.0.1`, e o app não expõe Server Actions.
- **Cuidado enquanto isso:** não exponha `npm run dev` na rede; rode produção atrás de proxy reverso.
- **Plano:** subir para Next 15.5.x e depois 16.x; React 19; `cookies()`, `headers()`, `params` e `searchParams` passam a ser assíncronos (afeta `lib/session.ts` e as páginas); conferir `react-markdown`/`remark`; repetir a bateria de testes de navegador.
- **Pronto quando:** `npm audit --omit=dev` sem críticas nem altas.

### B. Sessões em Redis — **M**
Hoje as sessões ficam na memória de **uma** instância; reiniciar desloga todos e não dá para escalar. Trocar o armazenamento em `lib/session.ts` por Redis, **criptografando** o token do Taiga em repouso e mantendo o TTL.

### C. CSP com *nonce* e restrição de imagens — **M**
- Remover `'unsafe-inline'` de `script-src` usando CSP com *nonce* (exige *middleware*).
- Restringir `img-src` ao endereço de mídia do Taiga. Hoje ele aceita qualquer `http(s)` porque ainda não sabemos em que domínio ficam as fotos e anexos.
- Imagens externas escritas numa story (Markdown) podem revelar o IP de quem abre. Alternativa: **proxy de mídia autenticado**, que também resolveria mídia protegida do Taiga.

### D. Testes automatizados e CI — **M**
Não há testes nem integração contínua, e a branch `main` não tem proteção.
- Vitest nas funções puras (`lib/metrics.ts`, `lib/kanban-metrics.ts`, `lib/roles.ts`, `lib/ratelimit.ts`).
- Playwright nos fluxos. **Os cenários já existem** como roteiros manuais e podem virar testes: login, limite de tentativas, expiração de sessão, CSP sem violações, timeout, retentativa, concorrência, anexos maliciosos, favoritos, Kanban com amostra parcial.
- GitHub Actions: tipos, build, testes e `npm audit`. Exige permissão de *workflows* para o envio.
- Proteção da `main` (revisão obrigatória, sem push forçado).

## 🟠 Prioridade média

| # | Pendência | Detalhe | Esforço |
|---|---|---|---|
| E | Validar as respostas do Taiga | Hoje os tipos são escritos à mão e já houve diferenças reais (`is_active` ausente, `attached_file` relativo). Validar com zod e guardar respostas reais como amostras de teste. | M |
| F | Configuração central | As variáveis de ambiente são lidas em vários arquivos. Criar `lib/config.ts` validado na inicialização, com mensagens claras. | P |
| G | Cache unificado com limite | Os caches em `Map` (projetos, finalizados do Kanban) crescem com usuários × projetos. Usar LRU com teto e TTL, e guardar por mais tempo sprints fechadas (não mudam). | M |
| H | Páginas de erro amigáveis | Um timeout do Taiga hoje vira a página 500 genérica. Criar `error.tsx` e `not-found.tsx` com mensagem e botão para tentar de novo. | P |
| I | Observabilidade | Logs estruturados com identificador de requisição, `/api/health` e métricas de latência e erro do Taiga. | M |
| J | Implantação | Dockerfile com `output: "standalone"`, usuário sem privilégios e orientação de HTTPS/HSTS. | P/M |
| K | Endereço público da aplicação | Os redirecionamentos usam o `Host` da requisição (`new URL(q, req.url)`). Atrás de um proxy, usar uma variável `APP_URL` configurada. | P |
| L | Limite também em `/api/item` | Cada abertura de modal gera ~5 chamadas ao Taiga; um limite por sessão evita amplificação. | P |

## 🟡 Governança e decisões em aberto

- **Dados de desempenho individual (LGPD):** hoje qualquer membro do projeto vê os números de todos. `DEV_ROLES` é só um filtro de exibição, **não** controle de acesso. Decidir quem pode ver o quê (por exemplo, só gestores) e se há registro de acessos.
- **Hospedagem:** onde vai rodar e em quantas instâncias (define a urgência do item B).
- **Segredos:** adicionar `gitleaks` no CI ou como *pre-commit* (já houve um domínio no `.env.example`).
- **Simulador (`scripts/mock-taiga.mjs`):** aceita qualquer usuário com a senha `senha`. Garantir que fique fora de qualquer imagem de produção; opcionalmente recusar `TAIGA_URL` apontando para `localhost` quando `NODE_ENV=production`.
- **CSRF do login:** o cookie `SameSite=Lax` já protege as ações; um *Origin check* no `POST /api/login` fecharia o *login CSRF*.

## Ordem sugerida

1. **A** (migrar o Next), a única pendência com vulnerabilidade conhecida no `npm audit`.
2. **D** (testes e CI), que protege a migração e todo o resto.
3. **H** e **K** (rápidos e visíveis para o usuário).
4. **B** e **C**, conforme a decisão de hospedagem.
5. **E**, **F**, **G**, **I**, **J**, **L**.
