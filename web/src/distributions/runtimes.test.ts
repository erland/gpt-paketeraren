import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildClaudeZip } from "./claude";
import { buildOpenCodeZip } from "./opencode";
import { buildPluginZip } from "./plugin";

const project = {
  name: "Produktinformatören",
  description: "Visar produktinformation.",
  instructions: "Behåll instruktionen exakt.\n",
  knowledge: [{ path: "manual.md", content: new Blob(["manual"]), size: 6 }]
};

describe("runtime distributions", () => {
  it("builds Plugin with skill and references", async () => {
    const zip = await JSZip.loadAsync(await (await buildPluginZip(project)).arrayBuffer());
    expect(zip.file("plugin.json")).not.toBeNull();
    expect(zip.file("skills/produktinformatoren/SKILL.md")).not.toBeNull();
    expect(await zip.file("skills/produktinformatoren/references/manual.md")!.async("string")).toBe("manual");
  });

  it("builds Claude with unchanged instructions", async () => {
    const zip = await JSZip.loadAsync(await (await buildClaudeZip(project)).arrayBuffer());
    expect(await zip.file("instructions.md")!.async("string")).toBe(project.instructions);
    expect(await zip.file("knowledge/manual.md")!.async("string")).toBe("manual");
  });

  it("builds OpenCode with AGENTS and knowledge", async () => {
    const zip = await JSZip.loadAsync(await (await buildOpenCodeZip(project)).arrayBuffer());
    expect((await zip.file("AGENTS.md")!.async("string")).startsWith(project.instructions)).toBe(true);
    expect(await zip.file("knowledge/manual.md")!.async("string")).toBe("manual");
  });
});
