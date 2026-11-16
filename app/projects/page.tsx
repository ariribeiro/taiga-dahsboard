import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getProjects, TaigaError } from "@/lib/taiga";
import { Header } from "../header";
import { colorFor, initials } from "../ui";

export const dynamic = "force-dynamic";

export default async function Projects() {
  const cur = getSession();
  if (!cur) redirect("/");
  let projects;
  try {
    projects = await getProjects(cur.session.userId);
  } catch (e) {
    if (e instanceof TaigaError && e.status === 401) redirect("/");
    throw e;
  }
  return (
    <>
      <Header name={cur.session.fullName} />
      <main className="wrap">
        <div className="page-title"><h2>Seus projetos</h2><span className="muted">{projects.length} projeto(s)</span></div>
        <div className="grid">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card proj">
              <span className="proj-ico" style={{ background: colorFor(p.name) }}>{initials(p.name)}</span>
              <strong>{p.name}</strong>
              <span className="muted">{p.description?.slice(0, 110) || "Sem descrição"}</span>
              <span className="proj-go">Ver sprint →</span>
            </Link>
          ))}
          {!projects.length && <p className="muted">Você não participa de nenhum projeto.</p>}
        </div>
      </main>
    </>
  );
}
