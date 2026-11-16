export type ItemDetail = {
  kind: "us" | "task";
  id: number; ref: number; subject: string;
  status: { name: string; color: string } | null;
  closed: boolean;
  blocked: string | null; // motivo do bloqueio, se bloqueado
  assignees: { name: string; photo: string | null }[];
  owner: { name: string; photo: string | null } | null;
  points: number | null;
  dueDate: string | null;
  created: string | null; modified: string | null; finished: string | null;
  description: string;
  tags: { name: string; color: string | null }[];
  webUrl: string | null; // link para este item no Taiga (precisa de TAIGA_WEB_URL)
  parent: { ref: number; subject: string; webUrl: string | null } | null; // task -> story
  children: { ref: number; subject: string; status: string; color: string; closed: boolean; assignee: string | null; assigneePhoto: string | null; webUrl: string | null }[]; // story -> tasks
  baseUrl: string; // endereço do Taiga, para resolver URLs relativas de imagens
  attachments: { id: number; name: string; url: string; size: number; isImage: boolean; description: string }[];
  comments: { user: string; photo: string | null; date: string; text: string }[];
};
