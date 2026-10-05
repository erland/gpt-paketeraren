import JSZip from "jszip";
import { GptProject, KnowledgeFile } from "../domain/project";
import { PackageFile, PackageMetadata } from "../domain/package";
import { detectPackageMetadata, isAdvancedPackage, readPackageFiles } from "./packageViewer";

const ADAPTER_BEGIN = "<!-- GPT-PACKAGER:RUNTIME-ADAPTER:BEGIN -->";
const ADAPTER_END = "<!-- GPT-PACKAGER:RUNTIME-ADAPTER:END -->";
export const MAX_ZIP_INPUT_BYTES = 50 * 1024 * 1024;

export type ImportedRuntime = "chat" | "plugin" | "claude" | "opencode" | "package";

export interface ImportResult {
  runtime: ImportedRuntime;
  mode: "editable" | "readonly";
  project?: GptProject;
  metadata: PackageMetadata;
  files: PackageFile[];
}

export function assertZipInputSize(size: number, maxBytes = MAX_ZIP_INPUT_BYTES): void {
  if (size > maxBytes) {
    throw new Error(`ZIP-filen är för stor (max ${formatLimit(maxBytes)}).`);
  }
}

export async function importRuntimeZip(file: Blob): Promise<ImportResult> {
  assertZipInputSize(file.size);
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(zip.files);
  const files = await readPackageFiles(zip);

  if (isAdvancedPackage(zip)) {
    const metadata = await detectPackageMetadata(zip, files);
    return {
      runtime: "package",
      mode: "readonly",
      metadata,
      files
    };
  }

  if (zip.file("assistant/instructions.md") && zip.file("START-HERE.md")) {
    return importChat(files);
  }

  if (zip.file("plugin.json") && names.some((name) => /^skills\/[^/]+\/SKILL\.md$/.test(name))) {
    return importPlugin(files);
  }

  if (zip.file("instructions.md") && zip.file("README.md")) {
    return importClaude(files);
  }

  if (zip.file("AGENTS.md") && zip.file("README.md")) {
    return importOpenCode(files);
  }

  throw new Error("ZIP-filen känns inte igen som en stödd GPT Paketeraren-distribution.");
}

async function importChat(files: PackageFile[]): Promise<ImportResult> {
  const instructions = text(files, "assistant/instructions.md");
  const start = text(files, "START-HERE.md");
  const [name, description] = parseTitleAndDescription(start);
  const knowledge = collectKnowledge(files, "knowledge/");

  const project = { name, description, instructions, knowledge };
  return {
    runtime: "chat",
    mode: "editable",
    project,
    metadata: { name, format: "chat", instructionPath: "assistant/instructions.md" },
    files
  };
}

async function importPlugin(files: PackageFile[]): Promise<ImportResult> {
  const plugin = JSON.parse(text(files, "plugin.json")) as {
    name?: string;
    description?: string;
  };
  const readme = text(files, "README.md");
  const [readmeName] = parseTitleAndDescription(readme);

  const skillPath = files.find((item) => /^skills\/[^/]+\/SKILL\.md$/.test(item.path))?.path;
  if (!skillPath) throw new Error("Plugin-distributionen saknar SKILL.md.");

  const skill = text(files, skillPath);
  const parsed = parseSkill(skill);
  const skillRoot = skillPath.replace(/\/SKILL\.md$/, "");
  const knowledge = collectKnowledge(files, `${skillRoot}/references/`);

  const project = {
    name: readmeName || parsed.name || plugin.name || "Importerad GPT",
    description: plugin.description || parsed.description || "",
    instructions: stripRuntimeAdapter(parsed.body),
    knowledge
  };
  return {
    runtime: "plugin",
    mode: "editable",
    project,
    metadata: { name: project.name, format: "plugin", instructionPath: skillPath },
    files
  };
}

async function importClaude(files: PackageFile[]): Promise<ImportResult> {
  const instructions = text(files, "instructions.md");
  const readme = text(files, "README.md");
  const [name, description] = parseTitleAndDescription(readme, " – Claude");
  const knowledge = collectKnowledge(files, "knowledge/");

  const project = { name, description, instructions, knowledge };
  return {
    runtime: "claude",
    mode: "editable",
    project,
    metadata: { name, format: "claude", instructionPath: "instructions.md" },
    files
  };
}

async function importOpenCode(files: PackageFile[]): Promise<ImportResult> {
  const agents = text(files, "AGENTS.md");
  const readme = text(files, "README.md");
  const [name, description] = parseTitleAndDescription(readme, " – OpenCode");
  const knowledge = collectKnowledge(files, "knowledge/");

  const project = {
    name,
    description,
    instructions: stripRuntimeAdapter(agents),
    knowledge
  };
  return {
    runtime: "opencode",
    mode: "editable",
    project,
    metadata: { name, format: "opencode", instructionPath: "AGENTS.md" },
    files
  };
}

function text(files: PackageFile[], path: string): string {
  const file = files.find((item) => item.path === path);
  if (!file) throw new Error(`ZIP-filen saknar ${path}.`);
  if (file.textContent === undefined) {
    throw new Error(`Filen ${path} är för stor eller har ett format som inte kan läsas som text.`);
  }
  return file.textContent;
}

function parseTitleAndDescription(markdown: string, suffix = ""): [string, string] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const titleIndex = lines.findIndex((line) => line.startsWith("# "));
  const rawTitle = titleIndex >= 0 ? lines[titleIndex].slice(2).trim() : "Importerad GPT";
  const name = suffix && rawTitle.endsWith(suffix) ? rawTitle.slice(0, -suffix.length) : rawTitle;

  const explicitDescription = lines
    .map((line) => line.trim())
    .find((line) => line.startsWith("Beskrivning:"));

  if (explicitDescription) {
    return [name, explicitDescription.slice("Beskrivning:".length).trim()];
  }

  const description = lines
    .slice(titleIndex + 1)
    .map((line) => line.trim())
    .find((line) =>
      line &&
      !line.startsWith("#") &&
      !line.startsWith("-") &&
      !/^\d+\./.test(line) &&
      !line.startsWith("Använd detta ZIP-arkiv") &&
      !line.startsWith("Använd innehållet i denna ZIP") &&
      !line.startsWith("Plugin-distribution genererad")
    ) ?? "";

  return [name, description];
}

function parseFrontmatterScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.replace(/^"|"$/g, "");
    }
  }
  return trimmed.replace(/^'|'$/g, "");
}

function parseSkill(markdown: string): { name: string; description: string; body: string } {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { name: "", description: "", body: normalized };
  }

  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) {
    return { name: "", description: "", body: normalized };
  }

  const frontmatter = normalized.slice(4, end).split("\n");
  const data: Record<string, string> = {};
  for (const line of frontmatter) {
    const index = line.indexOf(":");
    if (index > 0) {
      data[line.slice(0, index).trim()] = parseFrontmatterScalar(line.slice(index + 1));
    }
  }

  let body = normalized.slice(end + 5);
  if (body.startsWith("\n")) {
    body = body.slice(1);
  }

  return {
    name: data.name ?? "",
    description: data.description ?? "",
    body
  };
}

export function stripRuntimeAdapter(value: string): string {
  const start = value.indexOf(ADAPTER_BEGIN);
  const end = value.indexOf(ADAPTER_END);

  if (start === -1 || end === -1 || end < start) {
    return value;
  }

  const before = value.slice(0, start);
  const after = value.slice(end + ADAPTER_END.length);
  return (before + after).replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n");
}

function collectKnowledge(files: PackageFile[], prefix: string): KnowledgeFile[] {
  return files
    .filter((item) => item.path.startsWith(prefix))
    .map((item) => ({
      path: item.path.slice(prefix.length),
      content: item.content,
      size: item.size
    }))
    .filter((item) => Boolean(item.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function formatLimit(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${Math.ceil(bytes / 1024 / 1024)} MB`;
}
