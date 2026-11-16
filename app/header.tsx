import Link from "next/link";
import { Avatar, Logo } from "./ui";

export function Header({ name }: { name: string }) {
  return (
    <header className="top">
      <Link href="/projects" className="brand"><Logo /><strong>Visão por Dev</strong><span className="muted">Taiga</span></Link>
      <form method="post" action="/api/logout" className="user">
        <Avatar name={name} size={30} />
        <span>{name}</span>
        <button className="ghost" type="submit">Sair</button>
      </form>
    </header>
  );
}
