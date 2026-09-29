import JSZip from "jszip";
import { GptProject, KnowledgeFile } from "../domain/project";
import { PackageFile, PackageMetadata } from "../domain/package";
import { detectPackageMetadata, isAdvancedPackage, readPackageFiles } from "./packageViewer";

const ADAPTER_BEGIN = "<!-- GPT-PACKAGER:RUNTIME-ADAPTER:BEGIN -->";
const ADAPTER_END = "<!-- GPT-PACKAGER:RUNTIME-ADAPTER:END -->";

export type ImportedRuntime = "chat" | "plugin" | "claude" | "opencode" | "package";

export interface ImportResult {
  runtime: ImportedRuntime;
  mode: "editable" | "readonly";
  project?: GptProject;
  metadata: PackageMetadata;
  files: PackageFile[];
}

export async function importRuntimeZip(file: Blob): Promise<ImportResult> {
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
    return importChat(zip);
  }

  if (zip.file("plugin.json") && names.some((name) => /^skills\/[^/]+\/SKILL\.md$/.test(name))) {
    return importPlugin(zip);
  }

  if (zip.file("instructions.md") && zip.file("README.md")) {
    return importClaude(zip);
  }

  if (zip.file("AGENTS.md") && zip.file("README.md")) {
    return importOpenCode(zip);
  }

  throw new Error("ZIP-filen känns inte igen som en stödd GPT Paketeraren-distribution.");
}

async function importChat(zip: JSZip): Promise<ImportResult> {
  const instructions = await text(zip, "assistant/instructions.md");
  const start = await text(zip, "START-HERE.md");
  const [name, description] = parseTitleAndDescription(start);
  const knowledge = await collectKnowledge(zip, "knowledge/");

  const project = { name, description, instructions, knowledge };
  return {
    runtime: "chat",
    mode: "editable",
    project,
    metadata: { name, format: "chat", instructionPath: "assistant/instructions.md" },
    files: await readPackageFiles(zip)
  };
}

async function importPlugin(zip: JSZip): Promise<ImportResult> {
  const plugin = JSON.parse(await text(zip, "plugin.json")) as {
    name?: string;
    description?: string;
  };
  const readme = await text(zip, "README.md");
  const [readmeName] = parseTitleAndDescription(readme);

  const skillPath = Object.keys(zip.files).find((name) => /^skills\/[^/]+\/SKILL\.md$/.test(name));
  if (!skillPath) throw new Error("Plugin-distributionen saknar SKILL.md.");

  const skill = await text(zip, skillPath);
  const parsed = parseSkill(skill);
  const skillRoot = skillPath.replace(/\/SKILL\.md$/, "");
  const knowledge = await collectKnowledge(zip, `${skillRoot}/references/`);

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
    files: await readPackageFiles(zip)
  };
}

async function importClaude(zip: JSZip): Promise<ImportResult> {
  const instructions = await text(zip, "instructions.md");
  const readme = await text(zip, "README.md");
  const [name, description] = parseTitleAndDescription(readme, " – Claude");
  const knowledge = await collectKnowledge(zip, "knowledge/");

  const project = { name, description, instructions, knowledge };
  return {
    runtime: "claude",
    mode: "editable",
    project,
    metadata: { name, format: "claude", instructionPath: "instructions.md" },
    files: await readPackageFiles(zip)
  };
}

async function importOpenCode(zip: JSZip): Promise<ImportResult> {
  const agents = await text(zip, "AGENTS.md");
  const readme = await text(zip, "README.md");
  const [name, description] = parseTitleAndDescription(readme, " – OpenCode");
  const knowledge = await collectKnowledge(zip, "knowledge/");

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
    files: await readPackageFiles(zip)
  };
}

async function text(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new Error(`ZIP-filen saknar ${path}.`);
  return file.async("string");
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
      data[line.slice(0, index).trim()] = line.slice(index + 1).trim();
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

async function collectKnowledge(zip: JSZip, prefix: string): Promise<KnowledgeFile[]> {
  const files = Object.values(zip.files)
    .filter((entry) => !entry.dir && entry.name.startsWith(prefix))
    .sort((a, b) => a.name.localeCompare(b.name));

  return Promise.all(
    files.map(async (entry) => {
      const path = entry.name.slice(prefix.length);
      const content = new Blob([await entry.async("arraybuffer")]);
      return { path, content, size: content.size };
    })
  );
}
