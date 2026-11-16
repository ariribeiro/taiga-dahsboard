// Mock mínimo da API do Taiga para testar a UI sem uma instância real.
// Uso: npm run mock   (porta 9000)  e  TAIGA_URL=http://localhost:9000 npm run dev
import http from "node:http";
const d = new Date(), iso = (n) => new Date(d.getTime() + n * 864e5).toISOString().slice(0, 10);
const st = (name, color) => ({ name, color });
const NEW = st("Novo", "#999"), DOING = st("Em andamento", "#e6a700"), DONE = st("Pronto", "#1f9d6b");
const members = [
  { user: 1, full_name: "Ana Souza", photo: null, role_name: "Back", is_active: true },
  { user: 2, full_name: "Bruno Lima", photo: null, role_name: "Front", is_active: true },
  { user: 3, full_name: "Carla Dias", photo: null, role_name: "Back", is_active: true },
];
const milestones = [
  { id: 10, name: "Sprint 12", slug: "s12", estimated_start: iso(-7), estimated_finish: iso(6), closed: false },
  { id: 9, name: "Sprint 11", slug: "s11", estimated_start: iso(-21), estimated_finish: iso(-8), closed: true },
];
const stories = [
  { id: 1, ref: 101, subject: "Login SSO", assigned_to: 1, assigned_users: [1], status_extra_info: DONE, is_closed: true, total_points: 5 },
  { id: 2, ref: 102, subject: "Tela de relatórios", assigned_to: 2, assigned_users: [2, 3], status_extra_info: DOING, is_closed: false, total_points: 8 },
  { id: 3, ref: 103, subject: "Exportar CSV", assigned_to: null, assigned_users: [], status_extra_info: NEW, is_closed: false, total_points: 3 },
];
const tasks = [
  { id: 1, ref: 201, subject: "Endpoint de relatórios", user_story: 2, assigned_to: 3, status_extra_info: DONE, is_closed: true },
  { id: 2, ref: 202, subject: "Gráficos", user_story: 2, assigned_to: 2, status_extra_info: DOING, is_closed: false },
  { id: 3, ref: 203, subject: "Revisar SSO", user_story: 1, assigned_to: 1, status_extra_info: DONE, is_closed: true },
  { id: 4, ref: 204, subject: "Teste de carga", user_story: 3, assigned_to: 1, status_extra_info: NEW, is_closed: false },
];
const send = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"); const p = u.pathname.replace("/api/v1", "");
  if (p === "/auth") {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      const { username, password } = JSON.parse(b || "{}");
      if (password !== "senha") return send(res, 401, { _error_message: "invalid" });
      send(res, 200, { id: 1, username, full_name_display: "Ana Souza", auth_token: "tok", refresh: "ref", photo: null });
    }); return;
  }
  if (req.headers.authorization !== "Bearer tok") return send(res, 401, {});
  if (p === "/projects") return send(res, 200, [{ id: 1, name: "Projeto Alfa", slug: "alfa", description: "Produto principal" }, { id: 2, name: "Projeto Beta", slug: "beta", description: "" }]);
  if (p === "/projects/1") return send(res, 200, { id: 1, name: "Projeto Alfa", slug: "alfa" });
  if (p === "/memberships") return send(res, 200, members);
  if (p === "/milestones") return send(res, 200, milestones);
  if (p === "/userstories") return send(res, 200, stories);
  if (p === "/tasks") return send(res, 200, tasks);
  send(res, 404, {});
}).listen(9000, () => console.log("Mock Taiga em http://localhost:9000"));
