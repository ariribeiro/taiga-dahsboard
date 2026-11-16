import Link from "next/link";
import { getSession } from "@/lib/session";
import { getProjectsCached } from "@/lib/taiga";
import { Avatar, Logo } from "./ui";
import { ProjectSwitcher } from "./project-switcher";

export async function Header({ name }: { name: string }) {
  const cur = getSession();
  const photo = cur?.session.photo ?? null;
  // Se a lista falhar, o cabeçalho continua funcionando, só sem o seletor.
  const projects = cur ? await getProjectsCached(cur.session.userId).catch(() => []) : [];
  return (
    <header className="top">
      <div className="top-l">
        <Link href="/projects" className="brand"><Logo /><strong>Visão por Dev</strong></Link>
        {projects.length > 0 && <ProjectSwitcher projects={projects.map((p) => ({ id: p.id, name: p.name, logo: p.logo_small_url ?? null }))} />}
      </div>
      <form method="post" action="/api/logout" className="user">
        <Avatar name={name} src={photo} size={30} />
        <span>{name}</span>
        <button className="ghost" type="submit">Sair</button>
      </form>
    </header>
  );
}
