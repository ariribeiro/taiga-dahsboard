import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

const MSG: Record<string, string> = {
  "1": "Informe usuário e senha.",
  CRED: "Usuário ou senha inválidos (o Taiga recusou as credenciais).",
  CONFIG: "TAIGA_URL não está configurada. Defina no arquivo .env.local e reinicie o servidor.",
  REDE: "Não consegui conectar ao Taiga. Verifique a TAIGA_URL, a rede/VPN e veja o terminal do servidor.",
  CERT: "Erro de certificado HTTPS do Taiga. Veja a nota sobre NODE_EXTRA_CA_CERTS no README.",
};

export default function Home({ searchParams }: { searchParams: { erro?: string } }) {
  if (getSession()) redirect("/projects");
  return (
    <main className="center">
      <form className="card login" method="post" action="/api/login">
        <h1>Taiga · Visão por Dev</h1>
        <p className="muted">Entre com seu usuário do Taiga.</p>
        {searchParams.erro && <p className="err">{MSG[searchParams.erro] ?? MSG.REDE}</p>}
        <label>Usuário ou e-mail<input name="username" autoComplete="username" required autoFocus /></label>
        <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
