import Link from "next/link";

export function Header({ name }: { name: string }) {
  return (
    <header className="top">
      <Link href="/projects"><strong>Taiga · Visão por Dev</strong></Link>
      <form method="post" action="/api/logout">
        <span className="muted">{name}</span>
        <button className="ghost" type="submit">Sair</button>
      </form>
    </header>
  );
}
