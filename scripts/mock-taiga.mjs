// Mock mínimo da API do Taiga para testar a UI sem uma instância real.
// Uso: npm run mock   (porta 9000)  e  TAIGA_URL=http://localhost:9000 npm run dev
import http from "node:http";
const d = new Date(), iso = (n) => new Date(d.getTime() + n * 864e5).toISOString().slice(0, 10);
const st = (name, color) => ({ name, color });
const NEW = st("Novo", "#999"), DOING = st("Em andamento", "#e6a700"), DONE = st("Pronto", "#1f9d6b");
const members = [
  { user: 1, full_name: "Ana Souza", photo: "http://localhost:9000/media/ana.svg", role_name: "Back", is_active: true },
  { user: 2, full_name: "Bruno Lima", photo: "http://localhost:9000/media/quebrada.png", role_name: "Front", is_active: true },
  { user: 3, full_name: "Carla Dias", photo: null, role_name: "Back", is_active: true },
];
const milestones = [
  { id: 10, name: "Sprint 12", slug: "s12", estimated_start: iso(-7), estimated_finish: iso(6), closed: false },
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
const send = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
http.createServer((req, res) => {
  if (req.url.startsWith("/media/")) {
    if (req.url.includes("quebrada")) { res.writeHead(404); return res.end(); }
    const c = req.url.includes("logo") ? "#f59e0b" : "#0ea5e9";
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${c}"/><circle cx="20" cy="16" r="7" fill="#fff"/><rect x="8" y="26" width="24" height="10" rx="5" fill="#fff"/></svg>`);
  }
  const u = new URL(req.url, "http://x"); const p = u.pathname.replace("/api/v1", "");
  if (p === "/auth") {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      const { username, password } = JSON.parse(b || "{}");
      if (password !== "senha") return send(res, 401, { _error_message: "invalid" });
      send(res, 200, { id: 1, username, full_name_display: "Ana Souza", auth_token: "tok", refresh: "ref", photo: "http://localhost:9000/media/ana.svg" });
    }); return;
  }
  if (req.headers.authorization !== "Bearer tok") return send(res, 401, {});
  const PROJ = ["Projeto Alfa", "Projeto Beta", "Portal do Aluno", "PNLD - Programa Nacional do Livro e do Material Didático: Distribuição e Logística Integrada", "App Mobile", "Data Lake", "Sistema Legado", "Painel Executivo", "Integração MEC"].map((name, i) => ({ id: i + 1, name, slug: name.toLowerCase().replace(/\W+/g, "-"), description: i === 0 ? "Produto principal" : "", logo_small_url: i === 0 ? "http://localhost:9000/media/logo.svg" : null }));
  if (p === "/projects") return send(res, 200, PROJ);
  { const pm = p.match(/^\/projects\/(\d+)$/); if (pm) { const pr = PROJ.find((x) => x.id === +pm[1]); return pr ? send(res, 200, pr) : send(res, 404, {}); } }
  if (p === "/users/233") return send(res, 200, { id: 233, username: "paula", full_name_display: "Paula Externa" });
  if (p === "/milestones/10/stats") {
    const total = 16, n = 14, open = [16,16,15,15,13,13,11,11]; // 8 dias já decorridos (hoje = índice 7)
    return send(res, 200, { days: Array.from({ length: n }, (_, i) => ({ day: iso(-7 + i), name: i + 1, open_points: i < 8 ? open[i] : null, optimal_points: Math.round(total * (1 - i / (n - 1)) * 10) / 10 })) });
  }
  if (p === "/memberships") return send(res, 200, members);
  if (p === "/milestones") return send(res, 200, milestones);
  let m;
  if (p.endsWith("/attachments")) return send(res, 200, [
    // formato real do Taiga: "url" completa e/ou "attached_file" como caminho relativo ao MEDIA_ROOT
    { id: 1, name: "diagrama.svg", attached_file: "attachments/a/1/hash1/diagrama.svg", url: null, size: 20480, is_deprecated: false },
    { id: 5, name: "organograma.svg", attached_file: "attachments/c/3/hash3/organograma.svg", size: 9000, is_deprecated: false },
    { id: 6, name: "tela-inicial.svg", attached_file: "attachments/d/4/hash4/tela-inicial.svg", size: 8000, is_deprecated: false },
    { id: 3, name: "especificacao.pdf", attached_file: "attachments/b/2/hash2/especificacao.pdf", url: "http://localhost:9000/media/attachments/b/2/hash2/especificacao.pdf?token=abc", size: 3145728, is_deprecated: false },
    { id: 2, name: "foto-quebrada.png", attached_file: "http://localhost:9000/media/quebrada.png", size: 1000, is_deprecated: false },
    { id: 4, name: "antigo.png", attached_file: "/media/x.png", size: 1, is_deprecated: true }]);  if ((m = p.match(/^\/userstories\/(\d+)$/))) {
    const st = stories.find((x) => x.id === +m[1]); if (!st) return send(res, 404, {});
    return send(res, 200, { ...st, project: 1, description: "**PNLD–HU001: Integração com API**\n\n## COMO\nSistema PNLD\n\n## QUERO\nConsumir a API `PDDE_INTERATIVO` via [APIGateway](https://exemplo.com/gateway), usando o CPF do gestor.\n\n## Critérios\n- [x] filtro por sprint\n- [ ] exportar PDF\n- Item **importante**\n\n| Campo | Tipo |\n|---|---|\n| cpf | string |\n\n> Atenção ao timeout\n\n![relativa](/media/ana.svg)\n\n<img src=\"http://localhost:9000/media/logo.svg\" width=\"80\" onerror=\"alert(1)\"> HTML cru\n\n![quebrada](http://localhost:9000/media/quebrada.png)\n\n```json\n{\"ok\": true}\n```", tags: [["frontend", "#5b5bf0"], ["relatorios", null]],
      due_date: iso(5), created_date: iso(-20) + "T10:00:00Z", modified_date: iso(-1) + "T15:30:00Z", is_blocked: st.id === 2, blocked_note: "Aguardando API de dados",
      owner_extra_info: { full_name_display: "Ana Souza", photo: null }, assigned_to_extra_info: st.assigned_to ? { id: st.assigned_to, full_name_display: "Ana Souza" } : null });
  }
  if ((m = p.match(/^\/tasks\/(\d+)$/))) {
    const t = tasks.find((x) => x.id === +m[1]); if (!t) return send(res, 404, {});
    return send(res, 200, { ...t, project: 1, description: "", tags: [], created_date: iso(-6) + "T09:00:00Z", modified_date: iso(-2) + "T11:00:00Z",
      user_story_extra_info: { ref: stories.find((x) => x.id === t.user_story)?.ref, subject: stories.find((x) => x.id === t.user_story)?.subject } });
  }
  if (p.startsWith("/history/")) return send(res, 200, [{ id: "a", user: { name: "Bruno Lima", photo: null }, created_at: iso(-3) + "T14:00:00Z", comment: "Subi o **protótipo** no Figma.\nPreciso de revisão — veja [aqui](https://exemplo.com)." }, { id: "b", user: { name: "Carla Dias" }, created_at: iso(-2) + "T09:10:00Z", comment: "" }]);
  if (p === "/userstories") return send(res, 200, stories);
  if (p === "/tasks") { const us = u.searchParams.get("user_story"); return send(res, 200, us ? tasks.filter((t) => t.user_story === +us) : tasks); }
  send(res, 404, {});
}).listen(9000, () => console.log("Mock Taiga em http://localhost:9000"));
