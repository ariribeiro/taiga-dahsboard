import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { TaigaError } from "@/lib/taiga";
import { loadSprint } from "@/lib/sprint";
import { Header } from "../../../../header";
import { Avatar, Bar, Chip, Kpi, Ring, SprintPicker, fmtDate } from "../../../../ui";

export const dynamic = "force-dynamic";

type Item = { id: number; ref: number; subject: string; status: string; color: string; closed: boolean; extra: string };

function groupByStatus(items: Item[]) {
  const m = new Map<string, { name: string; color: string; closed: boolean; items: Item[] }>();
  for (const it of items) {
    const g = m.get(it.status) ?? { name: it.status, color: it.color, closed: it.closed, items: [] };
    g.items.push(it); m.set(it.status, g);
  }
  // abertas primeiro, concluídas por último
  return [...m.values()].sort((a, b) => Number(a.closed) - Number(b.closed));
}

function Group({ title, items }: { title: string; items: Item[] }) {
  if (!items.length) return null;
  return (
    <section className="card">
      <h4 className="sec">{title} <span className="count">{items.length}</span></h4>
      {groupByStatus(items).map((g) => (
        <div key={g.name} className="grp">
          <div className="grp-h"><Chip name={g.name} color={g.color} /><span className="muted">{g.items.length}</span></div>
          <ul className="items">
            {g.items.map((i) => (
              <li key={i.id} className={i.closed ? "done" : ""}>
                <span className="ref">#{i.ref}</span><span className="subj">{i.subject}</span><span className="meta">{i.extra}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export default async function DevPage({ params, searchParams }: { params: { id: string; userId: string }; searchParams: { sprint?: string } }) {
  const cur = getSession();
  if (!cur) redirect("/");
  const pid = Number(params.id), uid = Number(params.userId);
  if (!Number.isInteger(pid) || !Number.isInteger(uid)) notFound();

  const shell = (children: React.ReactNode) => (<><Header name={cur.session.fullName} /><main className="wrap">{children}</main></>);

  try {
    const data = await loadSprint(pid, searchParams.sprint);
    const { project, sorted, sprint } = data;
    if (!sprint) return shell(<p className="muted">Este projeto não tem sprints.</p>);
    const dev = data.devs.find((d) => d.userId === uid);
    const back = `/projects/${pid}?sprint=${sprint.id}`;
    if (!dev) return shell(<><Link href={back} className="back">← {project.name}</Link><p className="err">Pessoa não encontrada neste projeto.</p></>);

    const storiesOwned = dev.stories.filter((s) => s.role === "responsável");
    const storiesVia = dev.stories.filter((s) => s.role === "via task");
    const toItem = (x: { id: number; ref: number; subject: string; status: string; color: string; closed: boolean }, extra: string): Item => ({ ...x, extra });
    const idle = !dev.stories.length && !dev.tasks.length;

    return shell(<>
      <Link href={back} className="back">← {project.name} · {sprint.name}</Link>
      <div className="page-title">
        <div className="dev-head">
          <Avatar name={dev.name} size={56} />
          <div><h2>{dev.name}</h2><span className="muted">{dev.role || "Time"} · {sprint.name} ({fmtDate(sprint.estimated_start)} → {fmtDate(sprint.estimated_finish)})</span></div>
        </div>
        <SprintPicker sprints={sorted} current={sprint.id} />
      </div>

      {idle ? <div className="card"><p className="muted">Sem atividade atribuída nesta sprint.</p></div> : (<>
        <section className="card overview">
          <Ring value={dev.progress} size={112} stroke={11} label="concluído" />
          <div className="ov-main">
            <h3>Situação na sprint</h3>
            <p className="muted">
              {dev.tasks.length ? `${dev.tasksDone} de ${dev.tasks.length} tasks concluídas` : `${dev.closedPoints} de ${dev.points} pontos concluídos`}
              {dev.open > 0 ? ` · ${dev.open} item(ns) em aberto` : " · tudo concluído"}
            </p>
            <Bar value={dev.progress} />
          </div>
        </section>

        <div className="kpis">
          <Kpi icon="◎" value={<>{dev.closedPoints}<small>/{dev.points}</small></>} label="pontos" />
          <Kpi icon="▤" value={storiesOwned.length} label="stories responsável" />
          <Kpi icon="✓" value={<>{dev.tasksDone}<small>/{dev.tasks.length}</small></>} label="tasks" />
          <Kpi icon="…" value={dev.open} label="em aberto" />
        </div>

        <Group title="Tasks" items={dev.tasks.map((t) => toItem(t, t.storyRef ? `story #${t.storyRef}` : ""))} />
        <Group title="User stories (responsável)" items={storiesOwned.map((s) => toItem(s, `${s.points} pts`))} />
        <Group title="Stories em que atua via task" items={storiesVia.map((s) => toItem(s, ""))} />
      </>)}
    </>);
  } catch (e) {
    if (e instanceof TaigaError) {
      if (e.status === 401) redirect("/");
      if (e.status === 403 || e.status === 404) return shell(<><p className="err">Sem permissão ou item não encontrado.</p><Link href="/projects">Voltar</Link></>);
    }
    throw e;
  }
}
