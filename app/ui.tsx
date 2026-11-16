import type { ReactNode } from "react";

const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f43f5e"];
export const colorFor = (s: string) => PALETTE[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
export const initials = (n: string) => n.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: colorFor(name) }}>
      {initials(name)}
    </span>
  );
}

export function Ring({ value, size = 96, stroke = 10, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.min(Math.max(value, 0), 100);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${v}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-fg" strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-txt"><b style={{ fontSize: size < 70 ? size * 0.21 : size * 0.26 }}>{v}%</b>{label && <small>{label}</small>}</div>
    </div>
  );
}

export const Bar = ({ value, marker }: { value: number; marker?: number | null }) => (
  <div className="bar">
    <div className="fill" style={{ width: `${value}%` }} />
    {marker != null && <div className="mark" style={{ left: `${marker}%` }} title={`Esperado pelo calendário: ${marker}%`} />}
  </div>
);

export const Chip = ({ name, color }: { name: string; color: string }) => (
  <span className="chip" style={{ ["--c" as string]: color }}><i />{name}</span>
);

export const Kpi = ({ value, label, icon }: { value: ReactNode; label: string; icon: string }) => (
  <div className="kpi"><span className="kpi-ico">{icon}</span><div><b>{value}</b><span>{label}</span></div></div>
);

export const Logo = () => (
  <span className="logo"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg></span>
);

export function SprintPicker({ sprints, current }: { sprints: { id: number; name: string; closed: boolean }[]; current: number }) {
  return (
    <form method="get" className="picker">
      <select name="sprint" defaultValue={current}>
        {sprints.map((m) => <option key={m.id} value={m.id}>{m.name}{m.closed ? " (fechada)" : ""}</option>)}
      </select>
      <button type="submit">Ver</button>
    </form>
  );
}

export const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
