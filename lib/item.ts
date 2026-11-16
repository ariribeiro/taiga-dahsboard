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
  parent: { ref: number; subject: string } | null; // task -> story
  children: { ref: number; subject: string; status: string; color: string; closed: boolean; assignee: string | null }[]; // story -> tasks
  comments: { user: string; photo: string | null; date: string; text: string }[];
};
