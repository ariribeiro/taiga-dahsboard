import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { TaigaError } from "@/lib/taiga";
import { loadSprint } from "@/lib/sprint";
import { Header } from "../../header";
import { Avatar, Bar, Kpi, Ring, SprintPicker, fmtDate as fmt } from "../../ui";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }: { params: { id: string }; searchParams: { sprint?: string } }) {
  const cur = getSession();
  if (!cur) redirect("/");
  const pid = Number(params.id);
  if (!Number.isInteger(pid)) notFound();

  try {
    const data = await loadSprint(pid, searchParams.sprint);
    const { project, sorted, sprint } = data;
    if (!sprint) {
      return (<><Header name={cur.session.fullName} /><main className="wrap"><h2>{project.name}</h2><p className="muted">Este projeto não tem sprints.</p></main></>);
    }
    const { devs, overview: o } = data;
    const late = o.expectedProgress != null && o.progress + 10 < o.expectedProgress;

    const totalStatus = o.byStatus.reduce((n, x) => n + x.count, 0) || 1;
    const unassigned = o.unassignedStories + o.unassignedTasks;

    return (
      <>
        <Header name={cur.session.fullName} />
        <main className="wrap">
          <Link href="/projects" className="back">← Projetos</Link>
          <div className="page-title">
            <h2>{project.name}</h2>
            <SprintPicker sprints={sorted} current={sprint.id} />
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

          <div className="page-title"><h3>Por desenvolvedor</h3><span className="muted">Clique em um card para ver a situação na sprint</span></div>
          {!devs.length && <p className="muted">Nenhum membro encontrado.</p>}
          <div className="dev-grid">
            {devs.map((d) => {
              const idle = !d.stories.length && !d.tasks.length;
              return (
                <Link key={d.userId} href={`/projects/${pid}/devs/${d.userId}?sprint=${sprint.id}`} className={`card devcard${idle ? " idle" : ""}`}>
                  <div className="dc-top">
                    <Avatar name={d.name} size={46} />
                    <span className="who"><strong>{d.name}</strong><span className="muted">{d.role || "Time"}</span></span>
                    <Ring value={d.progress} size={54} stroke={6} title={`Progresso baseado em ${d.basis}`} />
                  </div>
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
