import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Logo } from "./ui";

const MSG: Record<string, string> = {
  "1": "Informe usuário e senha.",
  CRED: "Usuário ou senha inválidos (o Taiga recusou as credenciais).",
  CONFIG: "TAIGA_URL não está configurada. Defina no arquivo .env.local e reinicie o servidor.",
  REDE: "Não consegui conectar ao Taiga. Verifique a TAIGA_URL, a rede/VPN e veja o terminal do servidor.",
  LIMITE: "Muitas tentativas de login. Aguarde alguns minutos e tente de novo.",
  CERT: "Erro de certificado HTTPS do Taiga. Veja a nota sobre NODE_EXTRA_CA_CERTS no README.",
};

export default function Home({ searchParams }: { searchParams: { erro?: string; m?: string } }) {
  if (getSession()) redirect("/projects");
  return (
    <main className="login-page">
      <section className="hero">
        <Logo />
        <h1>Enxergue o seu time,<br />sprint a sprint.</h1>
        <p>Progresso por desenvolvedor, visão geral da sprint e o que cada pessoa está fazendo — direto do seu Taiga.</p>
        <ul>
          <li>✓ Usa as suas permissões do Taiga</li>
          <li>✓ Sua senha não é armazenada</li>
          <li>✓ Dados sempre atualizados</li>
        </ul>
      </section>
      <form className="card login" method="post" action="/api/login">
        <h2>Entrar</h2>
        <p className="muted">Use seu usuário e senha do Taiga.</p>
        {searchParams.erro && <p className="alert">{searchParams.erro === "LIMITE" ? `Muitas tentativas de login. Tente novamente em ${Math.min(60, Math.max(1, Math.trunc(Number(searchParams.m)) || 1))} min.` : MSG[searchParams.erro] ?? MSG.REDE}</p>}
        <label>Usuário ou e-mail<input name="username" autoComplete="username" required autoFocus /></label>
        <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
