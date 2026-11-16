import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getProjects, TaigaError } from "@/lib/taiga";
import { Header } from "../header";
import { ProjectList } from "../project-list";

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
        <ProjectList userId={cur.session.userId}
          projects={projects.map((p) => ({ id: p.id, name: p.name, description: p.description ?? "", logo: p.logo_small_url ?? null }))} />
      </main>
    </>
  );
}
