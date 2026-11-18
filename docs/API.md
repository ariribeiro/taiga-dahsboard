# Contrato da API

Todas as respostas são JSON. Rotas autenticadas exigem `Authorization: Bearer <sid>` (o `sid` vem do login). Se `INTERNAL_API_KEY` estiver definida, todas (exceto `/healthz` e `/readyz`) exigem também `x-api-key`.

**Códigos de erro** (`{"error": "..."}`): `API_KEY` 401 · `UNAUTHENTICATED` 401 · `BAD_REQUEST` 400 · `FORBIDDEN` 403 (sem o papel no projeto) · `NOT_FOUND` 404 · `CRED` 401 · `LIMITE` 429 (`retryAfterMinutes`) · `TIMEOUT` 504 · `UPSTREAM` 502 · `REDE` / `CERT` 502 · `CONFIG` / `SERVICE_AUTH` 503 · `INTERNAL` 500.

## POST /auth/login
Corpo: `{"username": "...", "password": "..."}`. Cabeçalho opcional `Authorization: Bearer <sid anterior>` encerra a sessão antiga do mesmo navegador. `X-Forwarded-For` só vale com `TRUST_PROXY=1`.

```json
{ "sid": "<64 hex>", "maxAge": 43200,
  "user": { "userId": 1, "fullName": "Ana Souza", "username": "ana", "photo": "https://..." } }
```

## GET /projects
`{ "projects": [ { "id", "name", "slug", "description", "logo_small_url", "logo_big_url", "is_backlog_activated", "is_kanban_activated" } ] }`

## GET /projects/:id/sprint?sprint=<id>&stats=1
Scrum:
```json
{ "kind": "scrum", "project": {}, "sorted": [ /* milestones, mais recente primeiro */ ],
  "sprint": { "id", "name", "estimated_start", "estimated_finish", "closed" },
  "devs": [ /* DevView */ ], "overview": { /* SprintOverview */ }, "unassigned": { "stories": [], "tasks": [] },
  "stats": { "days": [ { "day", "name", "open_points", "optimal_points" } ] } | null,
  "pace": { "state": "closed|ahead|late|ok", "diff": 0 },
  "meta": { "webBase": "", "roles": ["..."] , "blockedPattern": "", "paceTolerance": 10, "staleDays": 7 } }
```
Com `sprint: null` o projeto não tem sprints (sem `devs`/`overview`). Projeto Kanban: `{ "kind": "kanban", "project": {} }` → o front chama `/projects/:id/kanban`.

## GET /projects/:id/kanban?days=14|28|56|84
`{ project, days, board: KStatus[], doneTotal, fetched, ordered, partial, metrics: KanbanMetrics, meta }`

## GET /items?kind=us|task&id=&project=
`ItemDetail` (veja `src/domain/item.ts`). 404 se o item não for do projeto informado.

Os tipos `DevView`, `SprintOverview`, `KStatus`, `KanbanMetrics` etc. estão em `src/domain/metrics.ts` e `src/domain/kanban-metrics.ts`. O front mantém uma cópia em `lib/api/types.ts`; **ao mudar o contrato, atualize os dois.**
