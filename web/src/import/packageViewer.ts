import JSZip from "jszip";
import { PackageFile, PackageMetadata } from "../domain/package";

const TEXT_EXTENSIONS = new Set(["md","txt","json","yaml","yml","xml","csv","ts","tsx","js","jsx","py","java","kt","kts","properties","toml","ini","cfg","conf","html","css","scss","sh","sql","graphql","mmd","mermaid"]);
const INSTRUCTION_FALLBACKS = [
  "assistant/instructions.md",
  "runtime/canonical-instructions.md",
  "runtime/instructions.md",
  "instructions/chat-runtime.md",
  "instructions/instructions.md",
  "instructions.md",
  "gpt-instructions.md",
  "gpt_instructions.md",
  "instructions.txt"
];

export interface PackageLimits {
  maxFiles: number;
  maxSingleFileBytes: number;
  maxTotalBytes: number;
  maxTextPreviewBytes: number;
}

export const DEFAULT_PACKAGE_LIMITS: PackageLimits = {
  maxFiles: 500,
  maxSingleFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxTextPreviewBytes: 2 * 1024 * 1024
};

export function assertPackageWithinLimits(
  zip: JSZip,
  limits: PackageLimits = DEFAULT_PACKAGE_LIMITS
): void {
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);

  if (entries.length > limits.maxFiles) {
    throw new Error(`ZIP-paketet innehåller för många filer (max ${limits.maxFiles}).`);
  }

  let totalBytes = 0;
  for (const entry of entries) {
    const declaredSize = declaredUncompressedSize(entry);
    if (declaredSize === undefined) continue;

    if (declaredSize > limits.maxSingleFileBytes) {
      throw new Error(
        `Filen ${entry.name} är för stor efter dekomprimering (max ${formatLimit(limits.maxSingleFileBytes)}).`
      );
    }

    totalBytes += declaredSize;
    if (totalBytes > limits.maxTotalBytes) {
      throw new Error(
        `ZIP-paketet är för stort efter dekomprimering (max ${formatLimit(limits.maxTotalBytes)}).`
      );
    }
  }
}

export async function readPackageFiles(
  zip: JSZip,
  limits: PackageLimits = DEFAULT_PACKAGE_LIMITS
): Promise<PackageFile[]> {
  assertPackageWithinLimits(zip, limits);

  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter((entry) => !entry.name.startsWith("__MACOSX/"))
    .sort((a,b) => a.name.localeCompare(b.name));

  const files: PackageFile[] = [];
  let totalBytes = 0;

  for (const entry of entries) {
    const bytes = await entry.async("arraybuffer");
    const size = bytes.byteLength;

    if (size > limits.maxSingleFileBytes) {
      throw new Error(
        `Filen ${entry.name} är för stor efter dekomprimering (max ${formatLimit(limits.maxSingleFileBytes)}).`
      );
    }

    totalBytes += size;
    if (totalBytes > limits.maxTotalBytes) {
      throw new Error(
        `ZIP-paketet är för stort efter dekomprimering (max ${formatLimit(limits.maxTotalBytes)}).`
      );
    }

    const content = new Blob([bytes]);
    const result: PackageFile = { path: entry.name, size, content };
    if (isTextFile(entry.name) && size <= limits.maxTextPreviewBytes) {
      result.textContent = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }
    files.push(result);
  }

  return files;
}

/**
 * Treat one common ZIP wrapper directory as packaging noise when doing so makes
 * the package structure more recognizable. The underlying Blob contents are
 * unchanged; only the logical paths shown to import/detection code are rebased.
 */
export function normalizePackageRoot(files: PackageFile[]): PackageFile[] {
  if (files.length === 0) return files;

  const firstParts = files.map((file) => file.path.split("/"));
  if (firstParts.some((parts) => parts.length < 2)) return files;

  const commonRoot = firstParts[0][0];
  if (!commonRoot || firstParts.some((parts) => parts[0] !== commonRoot)) return files;

  const prefix = commonRoot + "/";
  const rebased = files
    .map((file) => ({ ...file, path: file.path.slice(prefix.length) }))
    .filter((file) => Boolean(file.path));

  return packageRecognitionScore(rebased) > packageRecognitionScore(files) ? rebased : files;
}

export function isAdvancedPackage(files: PackageFile[]): boolean {
  const names = files.map((file) => file.path);
  const has = (path: string) => names.includes(path);
  const hasPrefix = (prefix: string) => names.some((name) => name.startsWith(prefix));

  if (
    has("MANIFEST.json") ||
    has("chat-runtime-manifest.yaml") ||
    has("runtime-manifest.yaml") ||
    hasPrefix("runtime/") ||
    hasPrefix("assistant/policies/") ||
    hasPrefix("schemas/") ||
    hasPrefix("metamodel/")
  ) {
    return true;
  }

  const hasInstruction = INSTRUCTION_FALLBACKS.some((path) => has(path));
  const hasAdvancedContent = ["scripts/","templates/","docs/","examples/"].some((prefix) => hasPrefix(prefix));
  return hasInstruction && hasAdvancedContent;
}

export function detectPackageMetadata(files: PackageFile[]): PackageMetadata {
  const jsonManifest = files.find((f) => f.path === "MANIFEST.json")?.textContent;
  const yamlManifest =
    files.find((f) => f.path === "chat-runtime-manifest.yaml")?.textContent ??
    files.find((f) => f.path === "runtime-manifest.yaml")?.textContent ??
    files.find((f) => f.path === "runtime/runtime-manifest.yaml")?.textContent;

  let name = "";
  let version: string | undefined;
  let format: string | undefined;
  let instructionPath: string | undefined;

  if (jsonManifest) {
    try {
      const manifest = JSON.parse(jsonManifest) as Record<string, unknown>;
      name = asString(manifest.name) || asString(manifest.package) || asString(manifest.runtime_id);
      version = asString(manifest.version) || undefined;
      format = asString(manifest.format) || asString(manifest.distribution) || asString(manifest.runtime_id) || undefined;
      instructionPath = asString(manifest.instructions) || asString(manifest.instruction) || asString(manifest.project_instructions) || undefined;
    } catch {
      // A malformed manifest must not prevent read-only inspection.
    }
  }

  if (yamlManifest) {
    name ||= yamlValue(yamlManifest, "name") || yamlValue(yamlManifest, "id");
    version ||= yamlValue(yamlManifest, "version") || undefined;
    format ||= yamlValue(yamlManifest, "distribution") || undefined;
    instructionPath ||= yamlNestedValue(yamlManifest, "entrypoint", "instructions") || yamlValue(yamlManifest, "entrypoint") || undefined;
  }

  if (!instructionPath || !hasFile(files, instructionPath)) {
    instructionPath = INSTRUCTION_FALLBACKS.find((path) => hasFile(files, path));
  }

  if (!name) {
    const entry =
      files.find((f) => f.path === "START-HERE.md")?.textContent ??
      files.find((f) => f.path === "README.md")?.textContent ??
      files.find((f) => /(?:^|\/)SYSTEM-[^/]+-CHAT\.md$/i.test(f.path))?.textContent;
    name = markdownTitle(entry ?? "") || "Importerad GPT-distribution";
  }

  if (!version) {
    version = files.find((f) => f.path === "VERSION")?.textContent?.trim() || undefined;
  }

  return { name, version, format, instructionPath };
}

export function isMarkdownFile(path: string): boolean {
  const name = (path.split("/").pop() ?? path).toLowerCase();
  return name.endsWith(".md") || name.includes(".md.");
}

export function isTextFile(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  if (name === "VERSION" || name === "LICENSE" || name === "NOTICE") return true;
  if (isMarkdownFile(path)) return true;
  const dot = name.lastIndexOf(".");
  return dot >= 0 && TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export function previewLanguage(path: string): string | undefined {
  if (isMarkdownFile(path)) return "markdown";
  const name = (path.split("/").pop() ?? path).toLowerCase();
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  const aliases: Record<string, string> = {
    yml: "yaml",
    tsx: "typescript",
    ts: "typescript",
    jsx: "javascript",
    js: "javascript",
    py: "python",
    sh: "shell",
    mmd: "mermaid"
  };
  return aliases[extension] ?? (TEXT_EXTENSIONS.has(extension) ? extension : undefined);
}

function packageRecognitionScore(files: PackageFile[]): number {
  const names = files.map((file) => file.path);
  const has = (path: string) => names.includes(path);
  const hasPrefix = (prefix: string) => names.some((name) => name.startsWith(prefix));

  let score = 0;
  if (has("README.md") || has("START-HERE.md")) score += 2;
  if (has("VERSION")) score += 1;
  if (has("MANIFEST.json") || has("chat-runtime-manifest.yaml") || has("runtime-manifest.yaml")) score += 5;
  if (has("assistant/instructions.md") || has("instructions.md") || has("AGENTS.md")) score += 4;
  if (INSTRUCTION_FALLBACKS.some((path) => has(path))) score += 4;
  if (has("plugin.json")) score += 4;
  if (hasPrefix("skills/")) score += 2;
  if (hasPrefix("runtime/")) score += 3;
  if (hasPrefix("schemas/")) score += 3;
  if (hasPrefix("metamodel/")) score += 3;
  if (hasPrefix("scripts/")) score += 1;
  if (hasPrefix("docs/")) score += 1;
  return score;
}

function hasFile(files: PackageFile[], path: string): boolean {
  return files.some((file) => file.path === path);
}

function declaredUncompressedSize(entry: unknown): number | undefined {
  const data = (entry as { _data?: { uncompressedSize?: unknown } })._data;
  return typeof data?.uncompressedSize === "number" ? data.uncompressedSize : undefined;
}

function formatLimit(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${Math.ceil(bytes / 1024 / 1024)} MB`;
}

function markdownTitle(value: string): string {
  const line = value.replace(/\r\n/g, "\n").split("\n").find((item) => item.startsWith("# "));
  return line?.slice(2).trim() ?? "";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function yamlValue(text: string, key: string): string {
  const line = text.split(/\r?\n/).find((item) => item.trimStart().startsWith(key + ":"));
  return line ? line.split(":").slice(1).join(":").trim().replace(/^["\']|["\']$/g, "") : "";
}

function yamlNestedValue(text: string, section: string, key: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === section + ":");
  if (start < 0) return "";
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i] && !/^\s/.test(lines[i])) break;
    const trimmed = lines[i].trim();
    if (trimmed.startsWith(key + ":")) {
      return trimmed.split(":").slice(1).join(":").trim().replace(/^["\']|["\']$/g, "");
    }
  }
  return "";
}
