import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getMembers, getMilestones, getProject, getStories, getTasks, TaigaError } from "@/lib/taiga";
import { buildViews, pickCurrentSprint } from "@/lib/metrics";
import { Header } from "../../header";
import { Avatar, Bar, Chip, Kpi, Ring } from "../../ui";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }: { params: { id: string }; searchParams: { sprint?: string } }) {
  const cur = getSession();
  if (!cur) redirect("/");
  const pid = Number(params.id);
  if (!Number.isInteger(pid)) notFound();

  try {
    const [project, members, milestones] = await Promise.all([getProject(pid), getMembers(pid), getMilestones(pid)]);
    const sorted = [...milestones].sort((a, b) => b.estimated_start.localeCompare(a.estimated_start));
    const sprint = milestones.find((m) => String(m.id) === searchParams.sprint) ?? pickCurrentSprint(milestones);

    if (!sprint) {
      return (<><Header name={cur.session.fullName} /><main className="wrap"><h2>{project.name}</h2><p className="muted">Este projeto não tem sprints.</p></main></>);
    }
    const [stories, tasks] = await Promise.all([getStories(pid, sprint.id), getTasks(pid, sprint.id)]);
    const { devs, overview: o } = buildViews(members, stories, tasks, sprint);
    const late = o.expectedProgress != null && o.progress + 10 < o.expectedProgress;

    const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    const totalStatus = o.byStatus.reduce((n, x) => n + x.count, 0) || 1;
    const unassigned = o.unassignedStories + o.unassignedTasks;

    return (
      <>
        <Header name={cur.session.fullName} />
        <main className="wrap">
          <Link href="/projects" className="back">← Projetos</Link>
          <div className="page-title">
            <h2>{project.name}</h2>
            <form method="get" className="picker">
              <select name="sprint" defaultValue={sprint.id}>
                {sorted.map((m) => <option key={m.id} value={m.id}>{m.name}{m.closed ? " (fechada)" : ""}</option>)}
              </select>
              <button type="submit">Ver</button>
            </form>
          </div>

          <section className="card overview">
            <Ring value={o.progress} size={132} stroke={12} label="concluído" />
            <div className="ov-main">
              <div className="row">
                <h3>{sprint.name}</h3>
                <span className={`badge ${sprint.closed ? "b-closed" : late ? "b-late" : "b-ok"}`}>
                  {sprint.closed ? "Fechada" : late ? "Atrasada" : "No ritmo"}
                </span>
              </div>
              <p className="muted">
                {fmt(sprint.estimated_start)} → {fmt(sprint.estimated_finish)}
                {!sprint.closed && o.daysLeft != null && ` · ${o.daysLeft} de ${o.totalDays} dias restantes`}
              </p>
              <Bar value={o.progress} marker={sprint.closed ? null : o.expectedProgress} />
              {!sprint.closed && o.expectedProgress != null && (
                <p className="muted small">A marca na barra indica o esperado pelo calendário ({o.expectedProgress}%).</p>
              )}
            </div>
          </section>

          <div className="kpis">
            <Kpi icon="◎" value={<>{o.closedPoints}<small>/{o.totalPoints}</small></>} label="pontos" />
            <Kpi icon="▤" value={<>{o.storiesDone}<small>/{o.stories}</small></>} label="user stories" />
            <Kpi icon="✓" value={<>{o.tasksDone}<small>/{o.tasks}</small></>} label="tasks" />
            <Kpi icon="!" value={unassigned} label="sem responsável" />
          </div>

          <section className="card">
            <h4 className="sec">Stories por status</h4>
            <div className="stack">
              {o.byStatus.map((s) => <span key={s.name} style={{ width: `${(s.count / totalStatus) * 100}%`, background: s.color }} title={`${s.name}: ${s.count}`} />)}
            </div>
            <div className="legend">{o.byStatus.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name} <b>{s.count}</b></span>)}</div>
          </section>

          <div className="page-title"><h3>Por desenvolvedor</h3><span className="muted">{devs.length} pessoa(s) com atividade</span></div>
          {!devs.length && <p className="muted">Nenhuma atividade atribuída nesta sprint.</p>}
          <div className="devs">
            {devs.map((d) => (
              <details key={d.userId} className="card dev" open>
                <summary>
                  <Avatar name={d.name} size={44} />
                  <span className="who"><strong>{d.name}</strong><span className="muted">{d.role || "Time"}</span></span>
                  <span className="dev-stats"><b>{d.tasksDone}/{d.tasks.length}</b> tasks<br /><b>{d.closedPoints}/{d.points}</b> pts</span>
                  <Ring value={d.progress} size={54} stroke={6} />
                </summary>
                {d.stories.length > 0 && (<>
                  <h4 className="sec">User stories</h4>
                  <ul>{d.stories.map((s) => (
                    <li key={s.id} className={s.closed ? "done" : ""}>
                      <span className="ref">#{s.ref}</span><span className="subj">{s.subject}</span>
                      <Chip name={s.status} color={s.color} />
                      <span className="meta">{s.role === "via task" ? "via task" : `${s.points} pts`}</span>
                    </li>))}</ul>
                </>)}
                {d.tasks.length > 0 && (<>
                  <h4 className="sec">Tasks</h4>
                  <ul>{d.tasks.map((t) => (
                    <li key={t.id} className={t.closed ? "done" : ""}>
                      <span className="ref">#{t.ref}</span><span className="subj">{t.subject}</span>
                      <Chip name={t.status} color={t.color} />
                      <span className="meta">{t.storyRef ? `story #${t.storyRef}` : ""}</span>
                    </li>))}</ul>
                </>)}
              </details>
            ))}
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
