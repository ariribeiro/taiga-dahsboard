"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ItemDetail } from "@/lib/item";
import { Picture } from "./picture";

const cache = new Map<string, ItemDetail>();
const dt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const day = (d: string | null) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—");

function Dialog({ kind, id, project, href, onClose }: { kind: "us" | "task"; id: number; project: number; href: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const key = `${kind}:${id}`;
  const [data, setData] = useState<ItemDetail | null>(cache.get(key) ?? null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    if (cache.has(key)) return;
    const ac = new AbortController();
    fetch(`/api/item?kind=${kind}&id=${id}&project=${project}`, { signal: ac.signal })
      .then(async (r) => {
        if (r.status === 401) { window.location.href = "/"; return; }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Erro");
        cache.set(key, j); setData(j);
      })
      .catch((e) => { if (e.name !== "AbortError") setErr(e.message || "Erro ao carregar"); });
    return () => ac.abort();
  }, [key, kind, id, project]);

  return (
    <dialog ref={ref} className="modal" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <div className="modal-in">
        <button className="modal-x ghost" onClick={() => ref.current?.close()} aria-label="Fechar">✕</button>
        {err ? <p className="err">{err}</p> : !data ? <div className="skel"><i /><i /><i /></div> : <Body d={data} href={href} />}
      </div>
    </dialog>
  );
}

function Body({ d, href }: { d: ItemDetail; href: string | null }) {
  return (
    <>
      <p className="muted">{d.kind === "us" ? "User story" : "Task"} #{d.ref}{d.parent && <> · story #{d.parent.ref} — {d.parent.subject}</>}</p>
      <h3 className="modal-t">{d.subject}</h3>
      <div className="modal-badges">
        {d.status && <span className="chip" style={{ ["--c" as string]: d.status.color }}><i />{d.status.name}</span>}
        {d.blocked && <span className="chip" style={{ ["--c" as string]: "#e5484d" }} title={d.blocked}><i />Bloqueado</span>}
        {d.tags.map((t) => <span key={t.name} className="tag" style={t.color ? { ["--c" as string]: t.color } : undefined}>{t.name}</span>)}
      </div>
      {d.blocked && <p className="alert">Motivo do bloqueio: {d.blocked}</p>}

      <dl className="facts">
        <div><dt>Responsável</dt><dd>{d.assignees.length ? d.assignees.map((a) => <span key={a.name} className="who-i"><Picture name={a.name} src={a.photo} size={22} />{a.name}</span>) : <span className="muted">Sem responsável</span>}</dd></div>
        {d.points != null && <div><dt>Pontos</dt><dd>{d.points}</dd></div>}
        {d.dueDate && <div><dt>Prazo</dt><dd>{day(d.dueDate)}</dd></div>}
        {d.owner && <div><dt>Criado por</dt><dd>{d.owner.name}</dd></div>}
        <div><dt>Criado em</dt><dd>{dt(d.created)}</dd></div>
        <div><dt>Atualizado em</dt><dd>{dt(d.modified)}</dd></div>
        {d.finished && <div><dt>Concluído em</dt><dd>{dt(d.finished)}</dd></div>}
      </dl>

      <h4 className="sec">Descrição</h4>
      {d.description.trim() ? <p className="desc">{d.description}</p> : <p className="muted">Sem descrição.</p>}

      {d.children.length > 0 && (<>
        <h4 className="sec">Tasks da story <span className="count">{d.children.length}</span></h4>
        <ul className="items">{d.children.map((t) => (
          <li key={t.ref} className={t.closed ? "done" : ""}>
            <span className="ref">#{t.ref}</span><span className="subj">{t.subject}</span>
            <span className="chip" style={{ ["--c" as string]: t.color }}><i />{t.status}</span>
            <span className="meta">{t.assignee ?? "—"}</span>
          </li>))}</ul>
      </>)}

      {d.comments.length > 0 && (<>
        <h4 className="sec">Comentários <span className="count">{d.comments.length}</span></h4>
        <ul className="cmts">{d.comments.map((c, i) => (
          <li key={i}><Picture name={c.user} src={c.photo} size={28} />
            <div><b>{c.user}</b> <span className="muted">{dt(c.date)}</span><p>{c.text}</p></div></li>))}</ul>
      </>)}

      {href && <p className="modal-foot"><a href={href} target="_blank" rel="noopener noreferrer">Abrir no Taiga ↗</a></p>}
    </>
  );
}

/** Texto clicável que abre o modal com os detalhes da story/task. */
export function ItemButton({ kind, id, project, href, children }: { kind: "us" | "task"; id: number; project: number; href: string | null; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="linkbtn" onClick={() => setOpen(true)}>{children}</button>
      {open && <Dialog kind={kind} id={id} project={project} href={href} onClose={() => setOpen(false)} />}
    </>
  );
}
