import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildChatZip } from "./chat";

describe("buildChatZip", () => {
  it("preserves instructions and knowledge contents", async () => {
    const instructions = "# Roll\n\nBehåll <detta> exakt.\n\n\`\`\`text\näöå\n\`\`\`";
    const blob = await buildChatZip({
      name: "Produktinformatören",
      description: "Visar produktinformation.",
      instructions,
      knowledge: [
        { path: "manual.md", content: new Blob(["manualinnehåll"]), size: 14 }
      ]
    });

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file("assistant/instructions.md")!.async("string")).toBe(instructions);
    expect(await zip.file("knowledge/manual.md")!.async("string")).toBe("manualinnehåll");
    expect(zip.file("START-HERE.md")).not.toBeNull();
  });
});
