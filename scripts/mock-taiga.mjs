// Mock mínimo da API do Taiga para testar a UI sem uma instância real.
// Uso: npm run mock   (porta 9000)  e  TAIGA_URL=http://localhost:9000 npm run dev
import http from "node:http";
const PORT = +process.env.MOCK_PORT || 9000;
const BASE = `http://localhost:${PORT}`;
const d = new Date(), iso = (n) => new Date(d.getTime() + n * 864e5).toISOString().slice(0, 10);
const st = (name, color) => ({ name, color });
const NEW = st("Novo", "#999"), DOING = st("Em andamento", "#e6a700"), DONE = st("Pronto", "#1f9d6b");
const members = [
  { user: 1, full_name: "Ana Souza", photo: `${BASE}/media/ana.svg`, role_name: "Desenvolvedor", is_active: true },
  { user: 2, full_name: "Bruno Lima", photo: `${BASE}/media/quebrada.png`, role_name: "Analista de negócios e requisitos", is_active: true },
  { user: 3, full_name: "Carla Dias", photo: null, role_name: "Product Owner", is_active: true },
  // sem nenhuma story/task na sprint:
  { user: 4, full_name: "Eva Rocha", photo: null, role_name: "ANALISTA DE TESTE DE QUALIDADE", is_active: true },
  { user: 5, full_name: "Fabio Inativo", photo: null, role_name: "Arquiteto", is_active: false },   // conta desativada
  { user: 6, full_name: "Gil Semcampo", photo: null, role_name: "ESTAGIÁRIO" },                          // resposta sem o campo is_active
  { user: null, full_name: "convite@pendente.com", photo: null, role_name: "Back", is_active: false }, // convite pendente
];
const milestones = [
  { id: 10, name: "Sprint 12", slug: "s12", estimated_start: iso(-7), estimated_finish: iso(6), closed: false },
  { id: 11, name: "Sprint 13", slug: "s13", estimated_start: iso(-2), estimated_finish: iso(25), closed: false },
  { id: 9, name: "Sprint 11", slug: "s11", estimated_start: iso(-21), estimated_finish: iso(-8), closed: true },
];
const stories = [
  { id: 1, ref: 101, subject: "Login SSO", assigned_to: 1, assigned_users: [1], status_extra_info: DONE, is_closed: true, total_points: 5 },
  { id: 2, ref: 102, subject: "Tela de relatórios", assigned_to: 2, assigned_users: [2, 3], status_extra_info: DOING, is_closed: false, total_points: 8, is_blocked: true, blocked_note: "Aguardando API de dados" },
  { id: 4, ref: 104, subject: "Integração com gateway", assigned_to: 233, assigned_users: [233], status_extra_info: { name: "IMPEDIMENTO", color: "#d6465a" }, is_closed: false, total_points: 5 },
  { id: 3, ref: 103, subject: "Exportar CSV", assigned_to: null, assigned_users: [], status_extra_info: NEW, is_closed: false, total_points: 3 },
];
const tasks = [
  { id: 1, ref: 201, subject: "Endpoint de relatórios", user_story: 2, assigned_to: 3, status_extra_info: DONE, is_closed: true },
  { id: 2, ref: 202, subject: "Gráficos", user_story: 2, assigned_to: 2, status_extra_info: DOING, is_closed: false },
  { id: 3, ref: 203, subject: "Revisar SSO", user_story: 1, assigned_to: 1, status_extra_info: DONE, is_closed: true },
  { id: 5, ref: 205, subject: "Ajuste legado", user_story: 3, assigned_to: 190, assigned_to_extra_info: { id: 190, full_name_display: "Diego Antigo" }, status_extra_info: NEW, is_closed: false },
  { id: 6, ref: 206, subject: "Doc API", user_story: 3, assigned_to: 233, status_extra_info: NEW, is_closed: false },
  { id: 20, ref: 300, subject: "PDDE-00 — Spike token Olinda + secrets", user_story: 2, assigned_to: 3, assigned_to_extra_info: { id: 3, full_name_display: "CARLA DIAS DA SILVA" }, status_extra_info: DOING, is_closed: false },
  { id: 21, ref: 301, subject: "PDDE-01 — Cliente HTTP Olinda + DTOs", user_story: 2, assigned_to: 3, assigned_to_extra_info: { id: 3, full_name_display: "CARLA DIAS DA SILVA" }, status_extra_info: DONE, is_closed: true },
  { id: 22, ref: 302, subject: "403-T1 — Endpoint interno consulta diretor por CPF", user_story: 2, assigned_to: 3, assigned_to_extra_info: { id: 3, full_name_display: "CARLA DIAS DA SILVA" }, status_extra_info: DOING, is_closed: false },
  { id: 23, ref: 303, subject: "403-T2 — Persistência / sincronização (confirmar)", user_story: 2, assigned_to: 3, assigned_to_extra_info: { id: 3, full_name_display: "CARLA DIAS DA SILVA" }, status_extra_info: DONE, is_closed: true },
  { id: 30, ref: 330, subject: "Definir esquema de cache", user_story: 3, assigned_to: null, status_extra_info: NEW, is_closed: false },
  { id: 31, ref: 331, subject: "Revisar contrato da API", user_story: 2, assigned_to: 1, status_extra_info: NEW, is_closed: false },
  { id: 4, ref: 204, subject: "Teste de carga", user_story: 3, assigned_to: 1, status_extra_info: NEW, is_closed: false },
];
// ---- projeto Kanban (id 10): 7 colunas, muitos finalizados, paginação com x-pagination-count ----
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const KST = [
  { id: 1, name: "NOVO", color: "#70728F", order: 1, is_closed: false },
  { id: 2, name: "EM ANDAMENTO", color: "#E47C40", order: 2, is_closed: false, wip_limit: 3 },
  { id: 3, name: "PRONTO PARA TESTE", color: "#E4CE40", order: 3, is_closed: false },
  { id: 4, name: "EM APROVAÇÃO", color: "#40D9E4", order: 4, is_closed: false },
  { id: 5, name: "IMPEDIMENTO", color: "#E44057", order: 5, is_closed: false },
  { id: 6, name: "FINALIZADO", color: "#A8E440", order: 6, is_closed: true },
  { id: 7, name: "ARQUIVADO", color: "#A9AABC", order: 7, is_closed: true, is_archived: true },
];
const OWNERS = [1, 2, 3, 4, 6, null, null];
const K = []; let kid = 1000;
const mk = (stId, n, maxAgo, fin) => { const st = KST.find((x) => x.id === stId); for (let i = 0; i < n; i++) {
  const o = OWNERS[Math.floor(rnd() * OWNERS.length)]; const ago = Math.floor(rnd() * maxAgo); kid++;
  K.push({ id: kid, ref: kid - 900, subject: `Item ${kid - 900} - ${["Portal Gov.br", "Intranet", "Balcão Virtual", "PNLD", "Identidade Visual"][Math.floor(rnd() * 5)]}`, project: 10,
    status: stId, status_extra_info: { name: st.name, color: st.color, is_closed: st.is_closed }, is_closed: st.is_closed, assigned_to: o, assigned_users: o ? [o] : [],
    total_points: rnd() < 0.5 ? null : Math.ceil(rnd() * 5), is_blocked: false, created_date: iso(-(ago + 2 + Math.floor(rnd() * 40))) + "T10:00:00Z",
    modified_date: iso(-ago) + "T12:00:00Z", finish_date: fin ? iso(-ago) + "T12:00:00Z" : null }); } };
mk(1, 4, 10); mk(2, 4, 12); mk(3, 1, 3); mk(4, 13, 25); mk(5, 2, 30); mk(6, +process.env.MOCK_DONE || 300, 150, true);

const send = (res, code, body, headers = {}) => { res.writeHead(code, { "Content-Type": "application/json", ...headers }); res.end(JSON.stringify(body)); };
// ---- modos de falha para testar o cliente (só para desenvolvimento e testes) ----
// Valores iniciais por variável de ambiente; podem ser trocados em tempo de execução:
//   POST /__mode {"hang":"/history","flaky":true,"delayMs":150,"noOrder":true}   |   GET /__stats   |   GET /__reset
//   hang: nunca responde a esse caminho · flaky: cada URL falha 1x com 503 · delayMs: atraso por resposta · noOrder: recusa order_by
const initialMode = () => ({ hang: process.env.MOCK_HANG || null, flaky: !!process.env.MOCK_FLAKY, delayMs: +process.env.MOCK_DELAY_MS || 0, noOrder: !!process.env.MOCK_NO_ORDER });
let mode = initialMode();
let inflight = 0, maxInflight = 0; const seenUrls = new Set();
http.createServer((req, res) => {
  if (req.url === "/__stats") return send(res, 200, { maxInflight, mode });
  if (req.url === "/__reset") { maxInflight = 0; seenUrls.clear(); mode = initialMode(); return send(res, 200, {}); }
  if (req.url === "/__mode" && req.method === "POST") {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { mode = { ...mode, ...JSON.parse(b || "{}") }; send(res, 200, mode); }); return;
  }
  if (req.url.startsWith("/api/v1/") && !req.url.startsWith("/api/v1/auth")) {
    if (mode.hang && req.url.includes(mode.hang)) return; // nunca responde
    if (mode.flaky && !seenUrls.has(req.url)) { seenUrls.add(req.url); return send(res, 503, { _error_message: "indisponível" }, { "Retry-After": "0" }); }
    inflight++; maxInflight = Math.max(maxInflight, inflight); res.on("close", () => { inflight--; });
    if (mode.delayMs) return setTimeout(() => handle(req, res), mode.delayMs);
  }
  handle(req, res);
}).listen(PORT, () => console.log(`Mock Taiga em ${BASE}`));

function handle(req, res) {
  if (req.url.startsWith("/media/")) {
    if (req.url.includes("quebrada")) { res.writeHead(404); return res.end(); }
    const c = req.url.includes("logo") ? "#f59e0b" : "#0ea5e9";
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${c}"/><circle cx="20" cy="16" r="7" fill="#fff"/><rect x="8" y="26" width="24" height="10" rx="5" fill="#fff"/></svg>`);
  }
  const u = new URL(req.url, "http://x"); const p = u.pathname.replace("/api/v1", "");
  if (process.env.MOCK_LOG && !req.url.startsWith("/media/")) console.log(req.method, req.url, req.headers["x-disable-pagination"] ? "[tudo]" : "[paginado]");
  if (p === "/auth") {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      const { username, password } = JSON.parse(b || "{}");
      if (password !== "senha") return send(res, 401, { _error_message: "invalid" });
      send(res, 200, { id: 1, username, full_name_display: "Ana Souza", auth_token: "tok", refresh: "ref", photo: `${BASE}/media/ana.svg` });
    }); return;
  }
  if (req.headers.authorization !== "Bearer tok") return send(res, 401, {});
  const PROJ = ["Projeto Alfa", "Projeto Beta", "Portal do Aluno", "PNLD - Programa Nacional do Livro e do Material Didático: Distribuição e Logística Integrada", "App Mobile", "Data Lake", "Sistema Legado", "Painel Executivo", "Integração MEC", "Quadro Kanban"].map((name, i) => ({ id: i + 1, name, slug: name.toLowerCase().replace(/\W+/g, "-"), description: i === 0 ? "Produto principal" : "", logo_small_url: i === 0 ? `${BASE}/media/logo.svg` : null, is_backlog_activated: i !== 9, is_kanban_activated: true }));
  if (p === "/projects") return send(res, 200, PROJ);
  { const pm = p.match(/^\/projects\/(\d+)$/); if (pm) { const pr = PROJ.find((x) => x.id === +pm[1]); return pr ? send(res, 200, pr) : send(res, 404, {}); } }
  if (p === "/users/233") return send(res, 200, { id: 233, username: "paula", full_name_display: "Paula Externa" });
  if (p === "/milestones/10/stats") {
    const total = 16, n = 14, open = [16,16,15,15,13,13,11,11]; // 8 dias já decorridos (hoje = índice 7)
    return send(res, 200, { days: Array.from({ length: n }, (_, i) => ({ day: iso(-7 + i), name: i + 1, open_points: i < 8 ? open[i] : null, optimal_points: Math.round(total * (1 - i / (n - 1)) * 10) / 10 })) });
  }
  if (p === "/memberships") return send(res, 200, members);
  if (p === "/milestones" && u.searchParams.get("project") === "9") return send(res, 200, []); // Scrum ligado, sem sprints
  if (p === "/milestones") return send(res, 200, milestones);
  let m;
  if (p.endsWith("/attachments")) return send(res, 200, [
    // formato real do Taiga: "url" completa e/ou "attached_file" como caminho relativo ao MEDIA_ROOT
    { id: 1, name: "diagrama.svg", attached_file: "attachments/a/1/hash1/diagrama.svg", url: null, size: 20480, is_deprecated: false },
    { id: 5, name: "organograma.svg", attached_file: "attachments/c/3/hash3/organograma.svg", size: 9000, is_deprecated: false },
    { id: 6, name: "tela-inicial.svg", attached_file: "attachments/d/4/hash4/tela-inicial.svg", size: 8000, is_deprecated: false },
    { id: 3, name: "especificacao.pdf", attached_file: "attachments/b/2/hash2/especificacao.pdf", url: `${BASE}/media/attachments/b/2/hash2/especificacao.pdf?token=abc`, size: 3145728, is_deprecated: false },
    { id: 2, name: "foto-quebrada.png", attached_file: `${BASE}/media/quebrada.png`, size: 1000, is_deprecated: false },
    { id: 4, name: "antigo.png", attached_file: "/media/x.png", size: 1, is_deprecated: true },
    { id: 7, name: "malicioso.png", attached_file: "javascript:alert(1)", url: "javascript:alert(1)", size: 1, is_deprecated: false },
    { id: 8, name: "ftp.pdf", attached_file: "ftp://servidor/arquivo.pdf", size: 1, is_deprecated: false }]);  if ((m = p.match(/^\/userstories\/(\d+)$/))) {
    const st = stories.find((x) => x.id === +m[1]) ?? K.find((x) => x.id === +m[1]); if (!st) return send(res, 404, {});
    return send(res, 200, { ...st, project: st.project ?? 1, project_extra_info: { slug: st.project === 10 ? "quadro-kanban" : "projeto-alfa" }, description: "**PNLD–HU001: Integração com API**\n\n## COMO\nSistema PNLD\n\n## QUERO\nConsumir a API `PDDE_INTERATIVO` via [APIGateway](https://exemplo.com/gateway), usando o CPF do gestor.\n\n## Critérios\n- [x] filtro por sprint\n- [ ] exportar PDF\n- Item **importante**\n\n| Campo | Tipo |\n|---|---|\n| cpf | string |\n\n> Atenção ao timeout\n\n![relativa](/media/ana.svg)\n\n<img src=\`${BASE}/media/logo.svg\` width=\"80\" onerror=\"alert(1)\"> HTML cru\n\n![quebrada](http://localhost:9000/media/quebrada.png)\n\n```json\n{\"ok\": true}\n```", tags: [["frontend", "#5b5bf0"], ["relatorios", null]],
      due_date: iso(5), created_date: iso(-20) + "T10:00:00Z", modified_date: iso(-1) + "T15:30:00Z", is_blocked: st.id === 2, blocked_note: "Aguardando API de dados",
      owner_extra_info: { full_name_display: "Ana Souza", photo: null }, assigned_to_extra_info: st.assigned_to ? { id: st.assigned_to, full_name_display: "Ana Souza" } : null });
  }
  if ((m = p.match(/^\/tasks\/(\d+)$/))) {
    const t = tasks.find((x) => x.id === +m[1]); if (!t) return send(res, 404, {});
    return send(res, 200, { ...t, project: 1, project_extra_info: { slug: "projeto-alfa" }, description: "", tags: [], created_date: iso(-6) + "T09:00:00Z", modified_date: iso(-2) + "T11:00:00Z",
      user_story_extra_info: { ref: stories.find((x) => x.id === t.user_story)?.ref, subject: stories.find((x) => x.id === t.user_story)?.subject } });
  }
  if (p.startsWith("/history/")) return send(res, 200, [{ id: "a", user: { name: "Bruno Lima", photo: null }, created_at: iso(-3) + "T14:00:00Z", comment: "Subi o **protótipo** no Figma.\nPreciso de revisão — veja [aqui](https://exemplo.com)." }, { id: "b", user: { name: "Carla Dias" }, created_at: iso(-2) + "T09:10:00Z", comment: "" }]);
  if (p === "/userstory-statuses") return send(res, 200, KST);
  if (p === "/userstories" && u.searchParams.get("project") === "10") {
    let list = K; const st = u.searchParams.get("status"); if (st) list = list.filter((x) => x.status === +st);
    const ob = u.searchParams.get("order_by");
    if (ob) { if (mode.noOrder) return send(res, 400, { _error_message: "invalid order_by" }); if (ob === "-modified_date") list = [...list].sort((a, b) => b.modified_date.localeCompare(a.modified_date)); }
    if (req.headers["x-disable-pagination"]) return send(res, 200, list);
    const size = +u.searchParams.get("page_size") || 30, page = +u.searchParams.get("page") || 1;
    return send(res, 200, list.slice((page - 1) * size, page * size), { "x-pagination-count": String(list.length), "x-paginated": "true" });
  }
  if (p === "/userstories") return send(res, 200, stories);
  if (p === "/tasks") { const us = u.searchParams.get("user_story"); return send(res, 200, us ? tasks.filter((t) => t.user_story === +us) : tasks); }
  send(res, 404, {});
}
