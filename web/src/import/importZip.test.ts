import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildChatZip } from "../distributions/chat";
import { buildClaudeZip } from "../distributions/claude";
import { buildOpenCodeZip } from "../distributions/opencode";
import { buildPluginZip } from "../distributions/plugin";
import { GptProject } from "../domain/project";
import { assertZipInputSize, importRuntimeZip } from "./importZip";
import { readPackageFiles } from "./packageViewer";

const project: GptProject = {
  name: "Produktinformatören",
  description: "Visar produktinformation.",
  instructions: "# Instruktion\n\nBehåll exakt.\n",
  knowledge: [{ path: "manual.md", content: new Blob(["manualinnehåll"]), size: 14 }]
};

const cases = [["chat", buildChatZip],["plugin", buildPluginZip],["claude", buildClaudeZip],["opencode", buildOpenCodeZip]] as const;

describe("importRuntimeZip", () => {
  for (const [runtime, builder] of cases) {
    it(`round-trips ${runtime} as editable`, async () => {
      const imported = await importRuntimeZip(await builder(project));
      expect(imported.runtime).toBe(runtime);
      expect(imported.mode).toBe("editable");
      expect(imported.project).toBeDefined();
      expect(imported.project?.name).toBe(project.name);
      expect(imported.project?.description).toBe(project.description);
      expect(imported.project?.instructions).toBe(project.instructions);
      expect(imported.project?.knowledge.map((item) => item.path)).toEqual(["manual.md"]);
      expect(await imported.project?.knowledge[0].content.text()).toBe("manualinnehåll");
    });
  }

  it("opens manifest-based portable Chat packages read-only", async () => {
    const zip = new JSZip();
    zip.file("START-HERE.md", "# Presentationsbyggaren\n");
    zip.file("VERSION", "1.2.2\n");
    zip.file("MANIFEST.json", JSON.stringify({ name: "Presentationsbyggaren", format: "portable-chat-assistant", version: "1.2.2", instructions: "assistant/instructions.md" }));
    zip.file("assistant/instructions.md", "# Canonical instruction\n");
    zip.file("knowledge/method.md", "# Method\n");
    const imported = await importRuntimeZip(await zip.generateAsync({ type: "blob" }));
    expect(imported.mode).toBe("readonly");
    expect(imported.metadata.name).toBe("Presentationsbyggaren");
    expect(imported.metadata.instructionPath).toBe("assistant/instructions.md");
    expect(imported.files.find((item) => item.path === "knowledge/method.md")?.textContent).toBe("# Method\n");
  });

  it("detects System Builder instruction from YAML manifest", async () => {
    const zip = new JSZip();
    zip.file("README.md", "# System Builder – Chat ZIP Runtime\n");
    zip.file("chat-runtime-manifest.yaml", "name: System Builder\ndistribution: chat_zip\nversion: 1.3.2\nentrypoint: runtime/canonical-instructions.md\n");
    zip.file("runtime/canonical-instructions.md", "# System Builder instruction\n");
    const imported = await importRuntimeZip(await zip.generateAsync({ type: "blob" }));
    expect(imported.mode).toBe("readonly");
    expect(imported.metadata.name).toBe("System Builder");
    expect(imported.metadata.instructionPath).toBe("runtime/canonical-instructions.md");
  });

  it("falls back to runtime/instructions.md for runtime-contract packages", async () => {
    const zip = new JSZip();
    zip.file("START-HERE.md", "# Säkerhetsgranskaren för IT-stöd\n");
    zip.file("VERSION", "1.5.0\n");
    zip.file("MANIFEST.json", JSON.stringify({ name: "Säkerhetsgranskaren för IT-stöd", distribution: "chat", version: "1.5.0" }));
    zip.file("runtime/instructions.md", "# Runtime contract\n");
    zip.file("schemas/report.schema.json", "{}");
    const imported = await importRuntimeZip(await zip.generateAsync({ type: "blob" }));
    expect(imported.mode).toBe("readonly");
    expect(imported.metadata.instructionPath).toBe("runtime/instructions.md");
  });

  it("rejects unknown zip format", async () => {
    const zip = new JSZip(); zip.file("unknown.txt", "x");
    await expect(importRuntimeZip(await zip.generateAsync({ type: "blob" }))).rejects.toThrow(/känns inte igen/);
  });

  it("rejects an oversized ZIP before parsing it", () => {
    expect(() => assertZipInputSize(11, 10)).toThrow(/ZIP-filen är för stor/);
    expect(() => assertZipInputSize(10, 10)).not.toThrow();
  });

  it("rejects packages with too many files", async () => {
    const zip = new JSZip();
    zip.file("a.txt", "a");
    zip.file("b.txt", "b");
    zip.file("c.txt", "c");

    await expect(readPackageFiles(zip, {
      maxFiles: 2,
      maxSingleFileBytes: 100,
      maxTotalBytes: 100,
      maxTextPreviewBytes: 100
    })).rejects.toThrow(/för många filer/);
  });

  it("rejects a file that is too large after decompression", async () => {
    const zip = new JSZip();
    zip.file("large.txt", "12345");

    await expect(readPackageFiles(zip, {
      maxFiles: 10,
      maxSingleFileBytes: 4,
      maxTotalBytes: 100,
      maxTextPreviewBytes: 100
    })).rejects.toThrow(/large\.txt.*för stor/);
  });

  it("rejects excessive total decompressed size", async () => {
    const zip = new JSZip();
    zip.file("a.txt", "123");
    zip.file("b.txt", "456");

    await expect(readPackageFiles(zip, {
      maxFiles: 10,
      maxSingleFileBytes: 10,
      maxTotalBytes: 5,
      maxTextPreviewBytes: 100
    })).rejects.toThrow(/för stort efter dekomprimering/);
  });
});
