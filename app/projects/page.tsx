import { redirect } from "next/navigation";
import { ApiError, getMe, getProjects } from "@/lib/api";
import { Header } from "../header";
import { ProjectList } from "../project-list";

export const dynamic = "force-dynamic";

export default async function Projects() {
  const me = await getMe();
  if (!me) redirect("/");
  let projects;
  try {
    projects = await getProjects(true);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/");
    throw e;
  }
  return (
    <>
      <Header name={me.fullName} />
      <main className="wrap">
        <div className="page-title"><h2>Seus projetos</h2><span className="muted">{projects.length} projeto(s)</span></div>
        <ProjectList userId={me.userId}
          projects={projects.map((p) => ({ id: p.id, name: p.name, description: p.description ?? "", logo: p.logo_small_url ?? null }))} />
      </main>
    </>
  );
}
