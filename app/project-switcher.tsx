"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Picture } from "./picture";

type P = { id: number; name: string; logo: string | null };

/** Dropdown no topo para trocar de projeto (com busca quando há muitos). */
export function ProjectSwitcher({ projects }: { projects: P[] }) {
  const router = useRouter();
  const path = usePathname();
  const currentId = Number(/^\/projects\/(\d+)/.exec(path)?.[1]) || null;
  const current = projects.find((p) => p.id === currentId) ?? null;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const searchable = projects.length > 7;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    if (searchable) search.current?.focus();
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open, searchable]);

  // fecha ao navegar
  useEffect(() => { setOpen(false); setQ(""); }, [path]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? projects.filter((p) => p.name.toLowerCase().includes(t)) : projects;
  }, [projects, q]);

  const go = (p: P) => { setOpen(false); if (p.id !== currentId) router.push(`/projects/${p.id}`); };

  return (
    <div className="psw" ref={box}>
      <button type="button" className="psw-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} title={current ? `${current.name} — trocar de projeto` : "Trocar de projeto"}>
        {current ? <Picture name={current.name} src={current.logo} size={22} square /> : <span className="psw-ico" aria-hidden="true">▦</span>}
        <span className="psw-name">{current ? current.name : "Selecionar projeto"}</span>
        <span className="psw-chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="psw-menu" role="listbox" aria-label="Projetos">
          {searchable && <input ref={search} className="psw-search" placeholder="Buscar projeto…" value={q} onChange={(e) => setQ(e.target.value)} />}
          <div className="psw-list">
            {list.map((p) => (
              <button key={p.id} type="button" role="option" aria-selected={p.id === currentId} className={`psw-item${p.id === currentId ? " on" : ""}`} title={p.name} onClick={() => go(p)}>
                <Picture name={p.name} src={p.logo} size={24} square />
                <span className="psw-label">{p.name}</span>
                {p.id === currentId && <span className="psw-check" aria-hidden="true">✓</span>}
              </button>
            ))}
            {!list.length && <p className="muted psw-empty">Nenhum projeto encontrado.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
