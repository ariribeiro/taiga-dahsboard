# Melhorias pendentes de arquitetura e segurança

Resultado de uma revisão de código (sem teste de invasão) feita em **17/11/2026**. A migração do Next.js (antigo item A) foi concluída no mesmo dia. Este documento registra o que **já foi feito** e o que **ficou para depois**, para retomarmos sem perder o contexto.

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
| Dependências | **Migração para Next.js 16.4.6 e React 19** (antes: Next 14.2.15), Dependabot semanal e `engines.node >= 20.9`. | `npm audit --omit=dev`: **0 vulnerabilidades** (eram 1 crítica e 1 alta). Toda a bateria de testes repetida em produção e em desenvolvimento (Turbopack) sem regressões. |
| Servidor de desenvolvimento | `npm run dev` agora escuta só em `127.0.0.1` (antes, em todas as interfaces). | — |
| Redirecionamentos relativos | O login e o logout devolvem `Location` relativo (`/projects`, `/`). Antes, o endereço era montado a partir do servidor e quebrava o login ao abrir por `127.0.0.1`, por IP ou atrás de proxy HTTPS (o CSP `form-action` bloqueava o salto entre origens). | Login e logout verificados abrindo por `localhost` e `127.0.0.1`, em desenvolvimento e produção, e com cabeçalhos de proxy. |
| Testes automatizados e CI | **76 testes unitários** (Vitest) e **41 de ponta a ponta** (Playwright) que cobrem os roteiros manuais; workflow no GitHub Actions (tipos, testes, build e `npm audit`) em Node 22 e 24; Dependabot ignora saltos maiores de `@types/node` e acompanha as ações do GitHub. | Os testes foram validados **quebrando o código de propósito** (redirecionamento absoluto, cabeçalho removido, limite desligado): a suíte falhou em todos. |

## 🔴 Pendências de prioridade alta

### B. Sessões em Redis — **M**
Hoje as sessões ficam na memória de **uma** instância; reiniciar desloga todos e não dá para escalar. Trocar o armazenamento em `lib/session.ts` por Redis, **criptografando** o token do Taiga em repouso e mantendo o TTL.

### C. CSP com *nonce* e restrição de imagens — **M**
- Remover `'unsafe-inline'` de `script-src` usando CSP com *nonce* (exige *middleware*).
- Restringir `img-src` ao endereço de mídia do Taiga. Hoje ele aceita qualquer `http(s)` porque ainda não sabemos em que domínio ficam as fotos e anexos.
- Imagens externas escritas numa story (Markdown) podem revelar o IP de quem abre. Alternativa: **proxy de mídia autenticado**, que também resolveria mídia protegida do Taiga.

## 🟠 Prioridade média

| # | Pendência | Detalhe | Esforço |
|---|---|---|---|
| E | Validar as respostas do Taiga | Hoje os tipos são escritos à mão e já houve diferenças reais (`is_active` ausente, `attached_file` relativo). Validar com zod e guardar respostas reais como amostras de teste. | M |
| F | Configuração central | As variáveis de ambiente são lidas em vários arquivos. Criar `lib/config.ts` validado na inicialização, com mensagens claras. | P |
| G | Cache unificado com limite | Os caches em `Map` (projetos, finalizados do Kanban) crescem com usuários × projetos. Usar LRU com teto e TTL, e guardar por mais tempo sprints fechadas (não mudam). | M |
| H | Páginas de erro amigáveis | Um timeout do Taiga hoje vira a página 500 genérica. Criar `error.tsx` e `not-found.tsx` com mensagem e botão para tentar de novo. | P |
| I | Observabilidade | Logs estruturados com identificador de requisição, `/api/health` e métricas de latência e erro do Taiga. | M |
| J | Implantação | Dockerfile com `output: "standalone"`, usuário sem privilégios e orientação de HTTPS/HSTS. | P/M |
| L | Limite também em `/api/item` | Cada abertura de modal gera ~5 chamadas ao Taiga; um limite por sessão evita amplificação. | P |

## 🟡 Governança e decisões em aberto

- **Proteger a `main`:** em *Settings → Branches → Add rule*, exigir os checks do CI ("Testes (Node 22)", "Testes (Node 24)" e "Auditoria de dependências") antes de juntar PRs. Sem isso, o CI avisa, mas não impede o merge.
- **Dados de desempenho individual (LGPD):** hoje qualquer membro do projeto vê os números de todos. `DEV_ROLES` é só um filtro de exibição, **não** controle de acesso. Decidir quem pode ver o quê (por exemplo, só gestores) e se há registro de acessos.
- **Hospedagem:** onde vai rodar e em quantas instâncias (define a urgência do item B).
- **Segredos:** adicionar `gitleaks` no CI ou como *pre-commit* (já houve um domínio no `.env.example`).
- **Simulador (`scripts/mock-taiga.mjs`):** aceita qualquer usuário com a senha `senha`. Garantir que fique fora de qualquer imagem de produção; opcionalmente recusar `TAIGA_URL` apontando para `localhost` quando `NODE_ENV=production`.
- **CSRF do login:** o cookie `SameSite=Lax` já protege as ações; um *Origin check* no `POST /api/login` fecharia o *login CSRF*.

## Ordem sugerida

1. **Proteção da branch `main`** (exigir o CI verde antes de juntar): configuração no GitHub, sem código. Ver "Decisões em aberto".
2. **H** (páginas de erro amigáveis).
3. **B** e **C**, conforme a decisão de hospedagem.
4. **E**, **F**, **G**, **I**, **J**, **L**.
