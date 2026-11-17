import Link from "next/link";
import type { TProject } from "@/lib/taiga";
import { loadKanban } from "@/lib/kanban";
import { kanbanMetrics, type KDev, type KItem } from "@/lib/kanban-metrics";
import { BLOCKED_STATUS_PATTERN } from "@/lib/metrics";
import { allowedRoleNames } from "@/lib/roles";
import { taigaWebLink } from "@/lib/links";
import { Header } from "./header";
import { Avatar, Chip, ExtLink, Kpi, Picture } from "./ui";
import { ItemButton } from "./item-modal";
import { PeriodPicker } from "./period-picker";
import { ThroughputChart } from "./kanban-chart";
import { KanbanHelp } from "./criteria-help";

const STALE_DAYS = Math.max(1, Number(process.env.KANBAN_STALE_DAYS) || 7);

function Row({ it, pid, slug }: { it: KItem; pid: number; slug: string }) {
  return (
    <li className={it.blocked ? "krow-blocked" : ""}>
      <span className="ref">#{it.ref}</span>
      <span className="subj"><ItemButton kind="us" id={it.id} project={pid} href={taigaWebLink(slug, "us", it.ref)}>{it.subject}</ItemButton> <ExtLink href={taigaWebLink(slug, "us", it.ref)} what={`story #${it.ref}`} /></span>
      <Chip name={it.status} color={it.color} />
      <span className={`meta${it.stale ? " err" : ""}`}>{it.days} d sem alteração</span>
    </li>
  );
}

function DevCard({ d, pid, slug, days, points }: { d: KDev; pid: number; slug: string; days: number; points: boolean }) {
  const idle = !d.wip && !d.done;
  return (
    <details className={`card kdev${d.blocked ? " blocked" : ""}${idle ? " idle" : ""}`}>
      <summary>
        <div className="dc-top">
          <Avatar name={d.name} src={d.photo} size={46} />
          <span className="who"><strong>{d.name}</strong><span className="muted">{d.role || "Time"}</span></span>
        </div>
        {d.blocked > 0 && <div className="dc-block"><span aria-hidden="true">🚧</span> {d.blocked} {d.blocked === 1 ? "história com impedimento" : "histórias com impedimento"}</div>}
        {idle ? <p className="muted dc-idle">Sem atividade nos últimos {days} dias</p> : (
          <div className="dc-stats">
            <div><b>{d.wip}</b><span>em andamento{points && d.wipPoints ? ` · ${d.wipPoints} pts` : ""}</span></div>
            <div><b>{d.done}</b><span>concluídos{points && d.donePoints ? ` · ${d.donePoints} pts` : ""}</span></div>
            <div><b className={d.stale ? "err" : ""}>{d.stale}</b><span>parados</span></div>
          </div>
        )}
      </summary>
      {d.items.length > 0 && <ul className="items kitems">{d.items.map((it) => <Row key={it.id} it={it} pid={pid} slug={slug} />)}</ul>}
    </details>
  );
}

/** Visão de fluxo para projetos Kanban (sem sprints). */
export async function KanbanPage({ project, pid, userId, userName, days }: { project: TProject; pid: number; userId: number; userName: string; days: number }) {
  const data = await loadKanban(pid, userId);
  const m = kanbanMetrics({ statuses: data.statuses, open: data.open, done: data.done, doneTotal: data.doneTotal, ordered: data.ordered, partial: data.partial, members: data.members, days, staleDays: STALE_DAYS });
  const slug = project.slug;
  const board = data.statuses;
  const delta = m.doneInWindow != null && m.prevDone != null ? m.doneInWindow - m.prevDone : null;
  const avg = m.throughput.length ? Math.round((m.throughput.reduce((n, w) => n + w.count, 0) / m.throughput.length) * 10) / 10 : 0;

  return (
    <>
      <Header name={userName} />
      <main className="wrap">
        <Link href="/projects" className="back">← Projetos</Link>
        <div className="page-title">
          <div className="dev-head"><Picture name={project.name} src={project.logo_small_url} size={44} square /><h2>{project.name}</h2><span className="badge b-closed">Kanban</span><KanbanHelp info={{ days, staleDays: STALE_DAYS, blockedPattern: BLOCKED_STATUS_PATTERN, roles: allowedRoleNames(), doneTotal: data.doneTotal, fetched: data.done.length, ordered: data.ordered, partial: data.partial }} /></div>
          <PeriodPicker current={days} />
        </div>

        <section className="card">
          <h4 className="sec">Quadro</h4>
          <div className="kcols">
            {board.map((s) => {
              const over = s.wipLimit != null && s.count > s.wipLimit;
              return (
                <div key={s.id} className={`kcol${over ? " over" : ""}${s.kind === "archived" || s.kind === "done" ? " kdone" : ""}`} style={{ ["--c" as string]: s.color }}>
                  <span className="kcol-n">{s.name}</span>
                  <b>{s.count}</b>
                  <span className="muted kcol-s">{s.kind === "done" || s.kind === "archived" ? "no total" : s.wipLimit != null ? `limite ${s.wipLimit}${over ? " — excedido" : ""}` : s.kind === "queue" ? "fila" : "em fluxo"}</span>
                </div>
              );
            })}
          </div>
        </section>

        {m.windowIncomplete && (
          <p className="alert">
            Há <b>{data.doneTotal}</b> itens concluídos no total, e só os {data.done.length} {data.ordered ? "mais recentes" : "primeiros devolvidos pelo Taiga"} foram analisados.
            {data.ordered ? " Eles não cobrem todo o período escolhido" : " Como o Taiga não ordenou a lista, não dá para garantir que cobrem o período"}, então os números de conclusão (vazão e tempo de entrega) podem estar incompletos. Tente um período menor.
          </p>
        )}

        <div className="kpis">
          <Kpi icon="▶" value={m.wip} label={`em andamento · ${m.queue} na fila`} />
          <Kpi icon="🚧" value={m.blocked} label="impedidos" />
          <Kpi icon="⏱" value={m.stale} label={`parados há ${STALE_DAYS}+ dias`} />
          <Kpi icon="✓" value={m.doneInWindow ?? "—"} label={`concluídos em ${days} dias${delta != null ? ` (${delta > 0 ? "+" : ""}${delta} vs. período anterior)` : ""}`} />
          <Kpi icon="◷" value={m.leadMedian != null ? <>{m.leadMedian}<small> d</small></> : "—"} label={m.leadP85 != null ? `tempo de entrega · mediana (p85: ${m.leadP85} d)` : "tempo de entrega"} />
          <Kpi icon="!" value={m.unassignedWip} label="em andamento sem responsável" />
        </div>

        <section className="card">
          <div className="row"><h4 className="sec" style={{ margin: 0 }}>Vazão semanal</h4><span className="muted">média de {avg} por semana · linha tracejada</span></div>
          <ThroughputChart data={m.throughput} />
        </section>

        <div className="k2">
          <section className="card">
            <h4 className="sec">Sem movimento há mais tempo <span className="count">{m.aging.length}</span></h4>
            {m.aging.length ? <ul className="items kitems">{m.aging.map((it) => <Row key={it.id} it={it} pid={pid} slug={slug} />)}</ul> : <p className="muted">Nada em andamento.</p>}
          </section>
          <section className="card">
            <h4 className="sec">Impedimentos <span className="count">{m.blockedItems.length}</span></h4>
            {m.blockedItems.length ? <ul className="items kitems">{m.blockedItems.map((it) => <Row key={it.id} it={it} pid={pid} slug={slug} />)}</ul> : <p className="muted">Nenhum item impedido. 🎉</p>}
          </section>
        </div>

        <div className="page-title"><h3>Por desenvolvedor</h3><span className="muted">Clique em um card para ver os itens em andamento</span></div>
        {!m.devs.length && <p className="muted">Nenhum membro com os papéis configurados.</p>}
        <div className="dev-grid">{m.devs.map((d) => <DevCard key={d.userId} d={d} pid={pid} slug={slug} days={days} points={m.hasPoints} />)}</div>
      </main>
    </>
  );
}
