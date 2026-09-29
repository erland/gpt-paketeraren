import { describe, expect, it } from "vitest";
import { normalizeKnowledgePath, toProjectId, validateProject } from "./project";

describe("project domain", () => {
  it("creates a stable project id from Swedish characters", () => {
    expect(toProjectId("Produkt informatören")).toBe("produkt-informatoren");
  });

  it("rejects path traversal", () => {
    expect(() => normalizeKnowledgePath("../secret.txt")).toThrow(/Ogiltig/);
  });

  it("detects duplicate knowledge paths", () => {
    const content = new Blob(["x"]);
    const errors = validateProject({
      name: "Test",
      description: "Beskrivning",
      instructions: "Instruktion",
      knowledge: [
        { path: "a.md", content, size: 1 },
        { path: "a.md", content, size: 1 }
      ]
    });

    expect(errors.some((error) => error.includes("flera gånger"))).toBe(true);
  });
});
