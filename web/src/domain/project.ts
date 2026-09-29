export interface KnowledgeFile {
  path: string;
  content: Blob;
  size: number;
}

export interface GptProject {
  name: string;
  description: string;
  instructions: string;
  knowledge: KnowledgeFile[];
}

export function toProjectId(name: string): string {
  const id = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return id || "gpt";
}

export function normalizeKnowledgePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);

  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error(`Ogiltig Knowledge-sökväg: ${path}`);
  }

  if (parts.length === 0) {
    throw new Error("Knowledge-filen måste ha ett filnamn.");
  }

  return parts.join("/");
}

export function validateProject(project: GptProject): string[] {
  const errors: string[] = [];

  if (!project.name.trim()) errors.push("Ange namn på GPT:n.");
  if (!project.description.trim()) errors.push("Ange en kort beskrivning.");
  if (!project.instructions.trim()) errors.push("Ange GPT-instruktionen.");

  const seen = new Set<string>();
  for (const item of project.knowledge) {
    try {
      const path = normalizeKnowledgePath(item.path);
      if (seen.has(path)) errors.push(`Knowledge-filen finns flera gånger: ${path}`);
      seen.add(path);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Ogiltig Knowledge-fil.");
    }
  }

  return errors;
}
