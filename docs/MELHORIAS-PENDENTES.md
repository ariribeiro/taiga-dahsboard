# Pendências do back

Registro do que ficou para depois. Legenda de esforço: **P** (horas) · **M** (1 a 3 dias) · **G** (mais de 3 dias).

## 🔴 Prioridade alta

### B. Sessões e freios de login em Redis — **M**
Hoje ficam na memória de **uma** réplica; reiniciar o pod desloga todos e não dá para escalar. Trocar o armazenamento em `src/lib/session.ts` (e os contadores de `src/lib/ratelimit.ts`) por Redis, mantendo o TTL. Como a sessão guarda só a identidade (sem token do Taiga), não há segredo a criptografar em repouso.

### Entrada por SSO — **M/G**
Hoje as pessoas informam a senha do Taiga no nosso login. Se a organização tiver SSO (OIDC/Keycloak do OpenShift), trocar `POST /auth/login` por validação do token do provedor elimina o tratamento de senhas e o freio de força bruta.

## 🟠 Prioridade média

| # | Pendência | Detalhe | Esforço |
|---|---|---|---|
| E | Validar as respostas do Taiga | Os tipos são escritos à mão e já houve diferenças reais (`is_active` ausente, `attached_file` relativo). Validar com zod e guardar respostas reais como amostras de teste. | M |
| F | Configuração central | As variáveis são lidas em vários arquivos. Criar `src/lib/config.ts` validado na inicialização. | P |
| G | Cache unificado com limite | Os caches em `Map` (projetos, finalizados do Kanban) crescem sem teto. Usar LRU com TTL. Como os dados agora vêm do usuário de serviço, dá para cachear respostas por projeto para todos. | M |
| I | Observabilidade | Há log JSON por requisição; faltam identificador de correlação com o front e métricas (Prometheus) de latência/erro do Taiga. | M |
| L | Limite também em `GET /items` | Cada abertura de modal gera ~5 chamadas ao Taiga; um limite por sessão evita amplificação. | P |

## 🟡 Governança e decisões em aberto

- **Dados de desempenho individual (LGPD):** quem tem o papel no projeto vê os números de todos. `DEV_ROLES` é só filtro de exibição. Decidir quem pode ver o quê e se há registro de acessos.
- **Segredos:** adicionar `gitleaks` ao CI do GitLab.
- **Simulador (`scripts/mock-taiga.mjs`):** aceita qualquer usuário com a senha `senha`. Já fica fora da imagem; opcionalmente recusar `TAIGA_URL` em `localhost` quando `NODE_ENV=production`.
- **Escopo do usuário de serviço:** manter como membro somente leitura e rotacionar a senha periodicamente (a API renova o token sozinha, mas a senha precisa ser trocada no Secret).
