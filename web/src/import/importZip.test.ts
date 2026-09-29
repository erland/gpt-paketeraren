import { describe, expect, it } from "vitest";
import { buildChatZip } from "../distributions/chat";
import { buildClaudeZip } from "../distributions/claude";
import { buildOpenCodeZip } from "../distributions/opencode";
import { buildPluginZip } from "../distributions/plugin";
import { GptProject } from "../domain/project";
import { importRuntimeZip } from "./importZip";

const project: GptProject = {
  name: "Produktinformatören",
  description: "Visar produktinformation.",
  instructions: "# Instruktion\n\nBehåll exakt.\n",
  knowledge: [
    { path: "manual.md", content: new Blob(["manualinnehåll"]), size: 14 }
  ]
};

const cases = [
  ["chat", buildChatZip],
  ["plugin", buildPluginZip],
  ["claude", buildClaudeZip],
  ["opencode", buildOpenCodeZip]
] as const;

describe("importRuntimeZip", () => {
  for (const [runtime, builder] of cases) {
    it(`round-trips ${runtime}`, async () => {
      const blob = await builder(project);
      const imported = await importRuntimeZip(blob);

      expect(imported.runtime).toBe(runtime);
      expect(imported.project.name).toBe(project.name);
      expect(imported.project.description).toBe(project.description);
      expect(imported.project.instructions).toBe(project.instructions);
      expect(imported.project.knowledge.map((item) => item.path)).toEqual(["manual.md"]);
      expect(await imported.project.knowledge[0].content.text()).toBe("manualinnehåll");
    });
  }

  it("rejects unknown zip format", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("unknown.txt", "x");
    const blob = await zip.generateAsync({ type: "blob" });

    await expect(importRuntimeZip(blob)).rejects.toThrow(/känns inte igen/);
  });
});
