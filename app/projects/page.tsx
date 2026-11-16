import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getProjects, TaigaError } from "@/lib/taiga";
import { Header } from "../header";

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
        <h2>Seus projetos</h2>
        <div className="grid">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card proj">
              <strong>{p.name}</strong>
              <span className="muted">{p.description?.slice(0, 100)}</span>
            </Link>
          ))}
          {!projects.length && <p className="muted">Você não participa de nenhum projeto.</p>}
        </div>
      </main>
    </>
  );
}
