import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getMembers, getMilestones, getProject, getStories, getTasks, TaigaError } from "@/lib/taiga";
import { buildViews, pickCurrentSprint } from "@/lib/metrics";
import { Header } from "../../header";

export const dynamic = "force-dynamic";

const Bar = ({ value, marker }: { value: number; marker?: number | null }) => (
  <div className="bar">
    <div className="fill" style={{ width: `${value}%` }} />
    {marker != null && <div className="mark" style={{ left: `${marker}%` }} title={`Esperado pelo calendário: ${marker}%`} />}
  </div>
);
const Chip = ({ name, color }: { name: string; color: string }) => (
  <span className="chip" style={{ borderColor: color, color }}>{name}</span>
);

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

    return (
      <>
        <Header name={cur.session.fullName} />
        <main className="wrap">
          <p><Link href="/projects" className="muted">← Projetos</Link></p>
          <div className="row">
            <h2>{project.name}</h2>
            <form method="get" className="row">
              <select name="sprint" defaultValue={sprint.id}>
                {sorted.map((m) => <option key={m.id} value={m.id}>{m.name}{m.closed ? " (fechada)" : ""}</option>)}
              </select>
              <button className="ghost" type="submit">Ver</button>
            </form>
          </div>

          <section className="card">
            <div className="row">
              <h3>{sprint.name}</h3>
              <span className="muted">{sprint.estimated_start} → {sprint.estimated_finish}{!sprint.closed && o.daysLeft != null ? ` · ${o.daysLeft} dia(s) restantes de ${o.totalDays}` : ""}</span>
            </div>
            <Bar value={o.progress} marker={sprint.closed ? null : o.expectedProgress} />
            <p className={late ? "err" : "muted"}>
              {o.progress}% concluído{!sprint.closed && o.expectedProgress != null && ` · calendário indica ${o.expectedProgress}%`}{late && " — atrás do esperado"}
            </p>
            <div className="kpis">
              <div><b>{o.closedPoints}/{o.totalPoints}</b><span>pontos</span></div>
              <div><b>{o.storiesDone}/{o.stories}</b><span>user stories</span></div>
              <div><b>{o.tasksDone}/{o.tasks}</b><span>tasks</span></div>
              <div><b>{o.unassignedStories + o.unassignedTasks}</b><span>sem responsável</span></div>
            </div>
            <div className="chips">{o.byStatus.map((s) => <span key={s.name}><Chip name={s.name} color={s.color} /> {s.count}</span>)}</div>
          </section>

          <h3>Por desenvolvedor</h3>
          {!devs.length && <p className="muted">Nenhuma atividade atribuída nesta sprint.</p>}
          <div className="devs">
            {devs.map((d) => (
              <details key={d.userId} className="card dev" open>
                <summary>
                  <span className="avatar">{d.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
                  <span className="grow"><strong>{d.name}</strong> <span className="muted">{d.role}</span></span>
                  <span className="muted">{d.tasksDone}/{d.tasks.length} tasks · {d.closedPoints}/{d.points} pts</span>
                  <span className="pctn">{d.progress}%</span>
                </summary>
                <Bar value={d.progress} />
                {d.stories.length > 0 && (<>
                  <h4>User stories</h4>
                  <ul>{d.stories.map((s) => (
                    <li key={s.id} className={s.closed ? "done" : ""}>
                      <span className="muted">#{s.ref}</span> {s.subject} <Chip name={s.status} color={s.color} />
                      {s.role === "via task" ? <span className="muted"> · via task</span> : <span className="muted"> · {s.points} pts</span>}
                    </li>))}</ul>
                </>)}
                {d.tasks.length > 0 && (<>
                  <h4>Tasks</h4>
                  <ul>{d.tasks.map((t) => (
                    <li key={t.id} className={t.closed ? "done" : ""}>
                      <span className="muted">#{t.ref}</span> {t.subject} <Chip name={t.status} color={t.color} />
                      {t.storyRef && <span className="muted"> · story #{t.storyRef}</span>}
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
