import JSZip from "jszip";
import { PackageFile, PackageMetadata } from "../domain/package";

const TEXT_EXTENSIONS = new Set(["md","txt","json","yaml","yml","xml","csv","ts","tsx","js","jsx","py","java","kt","kts","properties","toml","ini","cfg","conf","html","css","scss","sh","sql","graphql"]);
const INSTRUCTION_FALLBACKS = ["assistant/instructions.md","runtime/canonical-instructions.md","runtime/instructions.md","instructions.md","gpt-instructions.md","gpt_instructions.md","instructions.txt"];

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

export function isAdvancedPackage(zip: JSZip): boolean {
  const names = Object.keys(zip.files);
  return Boolean(zip.file("MANIFEST.json") || zip.file("chat-runtime-manifest.yaml") || zip.file("runtime-manifest.yaml") || names.some((n) => n.startsWith("runtime/")) || names.some((n) => n.startsWith("assistant/policies/")) || names.some((n) => n.startsWith("schemas/")));
}

export async function detectPackageMetadata(zip: JSZip, files: PackageFile[]): Promise<PackageMetadata> {
  const jsonManifest = files.find((f) => f.path === "MANIFEST.json")?.textContent;
  const yamlManifest = files.find((f) => f.path === "chat-runtime-manifest.yaml")?.textContent ?? files.find((f) => f.path === "runtime-manifest.yaml")?.textContent ?? files.find((f) => f.path === "runtime/runtime-manifest.yaml")?.textContent;
  let name = ""; let version: string | undefined; let format: string | undefined; let instructionPath: string | undefined;
  if (jsonManifest) {
    try {
      const manifest = JSON.parse(jsonManifest) as Record<string, unknown>;
      name = asString(manifest.name) || asString(manifest.package) || asString(manifest.runtime_id);
      version = asString(manifest.version) || undefined;
      format = asString(manifest.format) || asString(manifest.distribution) || asString(manifest.runtime_id) || undefined;
      instructionPath = asString(manifest.instructions) || asString(manifest.instruction) || asString(manifest.project_instructions) || undefined;
    } catch { /* malformed manifest: viewer still works */ }
  }
  if (yamlManifest) {
    name ||= yamlValue(yamlManifest, "name") || yamlValue(yamlManifest, "id");
    version ||= yamlValue(yamlManifest, "version") || undefined;
    format ||= yamlValue(yamlManifest, "distribution") || undefined;
    instructionPath ||= yamlNestedValue(yamlManifest, "entrypoint", "instructions") || yamlValue(yamlManifest, "entrypoint") || undefined;
  }
  if (!instructionPath || !zip.file(instructionPath)) instructionPath = INSTRUCTION_FALLBACKS.find((path) => Boolean(zip.file(path)));
  if (!name) {
    const entry = files.find((f) => f.path === "START-HERE.md")?.textContent ?? files.find((f) => f.path === "README.md")?.textContent;
    name = markdownTitle(entry ?? "") || "Importerad GPT-distribution";
  }
  if (!version) version = files.find((f) => f.path === "VERSION")?.textContent?.trim() || undefined;
  return { name, version, format, instructionPath };
}

export function isTextFile(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  if (name === "VERSION" || name === "LICENSE" || name === "NOTICE") return true;
  const dot = name.lastIndexOf(".");
  return dot >= 0 && TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
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
function asString(value: unknown): string { return typeof value === "string" ? value : ""; }
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
    if (trimmed.startsWith(key + ":")) return trimmed.split(":").slice(1).join(":").trim().replace(/^["\']|["\']$/g, "");
  }
  return "";
}
