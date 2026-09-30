import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildChatZip } from "../src/distributions/chat";
import { buildClaudeZip } from "../src/distributions/claude";
import { buildOpenCodeZip } from "../src/distributions/opencode";
import { buildPluginZip } from "../src/distributions/plugin";
import { importRuntimeZip } from "../src/import/importZip";

const root = process.env.GPT_PACKAGER_COMPAT_DIR;
const compatDescribe = root ? describe : describe.skip;

const name = "Test GPT: ÅÄÖ";
const description = "Testar kompatibilitet mellan Python och PWA.";
const instructions = "# Roll\n\nBehåll exakt.\n\n## Knowledge\n\nAnvänd bifogat material.\n";
const knowledge = [
  { path: "a.md", content: new Blob(["Alpha\n"]), size: 6 },
  { path: "sub/b.txt", content: new Blob(["Beta\n"]), size: 5 }
];
const builders = {
  chat: buildChatZip,
  plugin: buildPluginZip,
  claude: buildClaudeZip,
  opencode: buildOpenCodeZip
};

compatDescribe("Python/PWA runtime compatibility", () => {
  for (const runtime of Object.keys(builders)) {
    it(`imports Python ${runtime} and exports PWA ${runtime}`, async () => {
      const pythonZip = await readFile(join(root, "python", `test-gpt-${runtime}-0.0.0-compat.zip`));
      const imported = await importRuntimeZip(new Blob([pythonZip]));

      expect(imported.runtime).toBe(runtime);
      expect(imported.mode).toBe("editable");
      expect(imported.project?.name).toBe(name);
      expect(imported.project?.description).toBe(description);
      expect(imported.project?.instructions).toBe(instructions);
      expect(imported.project?.knowledge.map((item) => item.path)).toEqual(["a.md", "sub/b.txt"]);
      expect(await imported.project?.knowledge[0].content.text()).toBe("Alpha\n");
      expect(await imported.project?.knowledge[1].content.text()).toBe("Beta\n");

      const webDir = join(root, "web");
      await mkdir(webDir, { recursive: true });
      const blob = await builders[runtime]({ name, description, instructions, knowledge });
      await writeFile(join(webDir, `${runtime}.zip`), Buffer.from(await blob.arrayBuffer()));
    });
  }
});
