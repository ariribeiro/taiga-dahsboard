/**
 * Os endereços de exemplo do .env.example (…suaempresa.com) são só modelos. Se alguém copiar o arquivo
 * e esquecer de editar, tratamos como "não configurado" em vez de usar um site que não existe.
 */
export const isExampleUrl = (u: string | undefined | null): boolean =>
  !!u && /(^|[/.@])suaempresa\.com(\.br)?([/:?#]|$)/i.test(u.trim());
