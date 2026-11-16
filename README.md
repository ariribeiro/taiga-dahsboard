# Taiga · Visão por Dev

Next.js (App Router) que autentica com o login do Taiga, lista os projetos do usuário e mostra a visão da sprint por desenvolvedor.

## Rodar
```bash
cp .env.example .env.local   # ajuste TAIGA_URL
npm install
npm run dev
```
Teste sem Taiga real: `npm run mock` (porta 9000) e `TAIGA_URL=http://localhost:9000 npm run dev` (senha do mock: `senha`).

## Estrutura
- `lib/taiga.ts` – cliente da API (auth, refresh automático, endpoints)
- `lib/metrics.ts` – cálculo da visão geral e por dev
- `lib/session.ts` – sessão no servidor (memória; trocar por Redis em produção)

## Problemas de login
O terminal onde roda `npm run dev` mostra a causa real (`[login] ...`).
- `CONFIG`: `.env.local` ausente/sem `TAIGA_URL` (o arquivo precisa se chamar exatamente `.env.local`; reinicie após criar).
- `CERT`: certificado interno → `NODE_EXTRA_CA_CERTS=caminho\\cert.pem` (CMD: `set NODE_EXTRA_CA_CERTS=...` antes do `npm run dev`).
- `CRED`: o Taiga recusou usuário/senha (contas via GitHub/Google/LDAP precisam de senha própria ou tipo de login diferente).
