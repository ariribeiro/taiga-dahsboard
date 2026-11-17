import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { TaigaError, hasProjectAccess } from "@/lib/taiga";
import { Forbidden } from "../../forbidden";
import { loadSprint } from "@/lib/sprint";
import { paceOf, PACE_TOLERANCE, BLOCKED_STATUS_PATTERN } from "@/lib/metrics";
import { CriteriaHelp } from "../../criteria-help";
import { KanbanPage } from "../../kanban-page";
import { parsePeriod } from "@/lib/periods";
import { allowedRoleNames } from "@/lib/roles";
import { Header } from "../../header";
import { Burndown } from "../../burndown";
import { UnassignedKpi } from "../../unassigned";
import { taigaWebLink } from "@/lib/links";
import { Avatar, Bar, Kpi, Picture, Ring, SprintPicker, fmtDate as fmt } from "../../ui";

export const dynamic = "force-dynamic";

export default async function ProjectPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ sprint?: string; days?: string }> }) {
  const params = await props.params;             // Next 15+: params e searchParams são assíncronos
  const searchParams = await props.searchParams;
  const cur = await getSession();
  if (!cur) redirect("/");
  const pid = Number(params.id);
  if (!Number.isInteger(pid)) notFound();

  try {
    if (!(await hasProjectAccess(cur.session.userId, pid))) return <Forbidden name={cur.session.fullName} />;
    const data = await loadSprint(pid, searchParams.sprint, true);
    if (data.kind === "kanban") {
      return <KanbanPage project={data.project} pid={pid} userId={cur.session.userId} userName={cur.session.fullName} days={parsePeriod(searchParams.days)} />;
    }
    const { project, sorted, sprint } = data;
    if (!sprint) {
      return (<><Header name={cur.session.fullName} /><main className="wrap"><h2>{project.name}</h2><p className="muted">Este projeto não tem sprints.</p></main></>);
    }
    const { devs, overview: o, stats, unassigned: un } = data;
    const pace = paceOf(o.progress, o.expectedProgress, sprint.closed);
    const PACE_LABEL = { closed: "Fechada", ahead: "Acima do ritmo", late: "Atrasada", ok: "No ritmo" } as const;

    const totalStatus = o.byStatus.reduce((n, x) => n + x.count, 0) || 1;

    return (
      <>
        <Header name={cur.session.fullName} />
        <main className="wrap">
          <Link href="/projects" className="back">← Projetos</Link>
          <div className="page-title">
            <div className="dev-head"><Picture name={project.name} src={project.logo_small_url} size={44} square /><h2>{project.name}</h2></div>
            <SprintPicker sprints={sorted} current={sprint.id} />
          </div>

          <section className="card overview">
            <Ring value={o.progress} size={132} stroke={12} label="concluído" />
            <div className="ov-main">
              <div className="row">
                <h3>{sprint.name}</h3>
                <span className="badge-row">
                  <span className={`badge b-${pace.state}`}>{PACE_LABEL[pace.state]}</span>
                  <CriteriaHelp info={{ sprint: sprint.name, closed: sprint.closed, progress: o.progress, expected: o.expectedProgress, diff: pace.diff, state: pace.state,
                    tolerance: PACE_TOLERANCE, hasPoints: o.totalPoints > 0, blockedPattern: BLOCKED_STATUS_PATTERN, roles: allowedRoleNames() }} />
                </span>
              </div>
              <p className="muted">
                {fmt(sprint.estimated_start)} → {fmt(sprint.estimated_finish)}
                {!sprint.closed && o.daysLeft != null && ` · ${o.daysLeft} de ${o.totalDays} dias restantes`}
              </p>
              <Bar value={o.progress} marker={sprint.closed ? null : o.expectedProgress} />
              {!sprint.closed && o.expectedProgress != null && (
                <p className="muted small">
                  A marca na barra indica o esperado pelo calendário ({o.expectedProgress}%)
                  {pace.state !== "ok" && <> · <b className={pace.state === "late" ? "err" : "ok-txt"}>{Math.abs(pace.diff)} p.p. {pace.diff > 0 ? "à frente" : "atrás"}</b></>}.
                </p>
              )}
            </div>
          </section>

          <div className="kpis">
            <Kpi icon="◎" value={<>{o.closedPoints}<small>/{o.totalPoints}</small></>} label="pontos" />
            <Kpi icon="▤" value={<>{o.storiesDone}<small>/{o.stories}</small></>} label="user stories" />
            <Kpi icon="✓" value={<>{o.tasksDone}<small>/{o.tasks}</small></>} label="tasks" />
            <UnassignedKpi project={pid} sprint={sprint.name}
              stories={un.stories.map((x) => ({ ...x, href: taigaWebLink(project.slug, "us", x.ref) }))}
              tasks={un.tasks.map((x) => ({ ...x, href: taigaWebLink(project.slug, "task", x.ref) }))} />
          </div>

          {stats?.days && <Burndown days={stats.days} />}

          <section className="card">
            <h4 className="sec">Stories por status</h4>
            <div className="stack">
              {o.byStatus.map((s) => <span key={s.name} style={{ width: `${(s.count / totalStatus) * 100}%`, background: s.color }} title={`${s.name}: ${s.count}`} />)}
            </div>
            <div className="legend">{o.byStatus.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name} <b>{s.count}</b></span>)}</div>
          </section>

          <div className="page-title"><h3>Por desenvolvedor</h3><span className="muted">Clique em um card para ver a situação na sprint</span></div>
          {!devs.length && <p className="muted">Nenhum membro encontrado.</p>}
          <div className="dev-grid">
            {devs.map((d) => {
              const idle = !d.stories.length && !d.tasks.length;
              return (
                <Link key={d.userId} href={`/projects/${pid}/devs/${d.userId}?sprint=${sprint.id}`} className={`card devcard${idle ? " idle" : ""}${d.blocked.length ? " blocked" : ""}`}>
                  <div className="dc-top">
                    <Avatar name={d.name} src={d.photo} size={46} />
                    <span className="who"><strong>{d.name}</strong><span className="muted">{d.role || "Time"}</span></span>
                    <Ring value={d.progress} size={54} stroke={6} title={`Progresso baseado em ${d.basis}`} />
                  </div>
                  {d.blocked.length > 0 && (
                    <div className="dc-block" title={d.blocked.map((b) => `#${b.ref} ${b.subject} — ${b.note}`).join("\n")}>
                      <span aria-hidden="true">🚧</span> {d.blocked.length} {d.blocked.length === 1 ? "história com impedimento" : "histórias com impedimento"}
                    </div>
                  )}
                  {idle ? <p className="muted dc-idle">Sem atividade nesta sprint</p> : (
                    <div className="dc-stats">
                      <div><b>{d.tasksDone}/{d.tasks.length}</b><span>tasks</span></div>
                      <div><b>{d.closedPoints}/{d.points}</b><span>pontos</span></div>
                      <div><b>{d.open}</b><span>em aberto</span></div>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </main>
      </>
    );
  } catch (e) {
    if (e instanceof TaigaError) {
      if (e.status === 401) redirect("/");
      if (e.status === 403 || e.status === 404) return (<><Header name={cur.session.fullName} /><main className="wrap"><p className="err">Sem permissão ou projeto não encontrado.</p><Link href="/projects">Voltar</Link></main></>);
    }
    throw e;
  }
}
