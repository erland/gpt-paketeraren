import JSZip from "jszip";
import { GptProject, toProjectId } from "../domain/project";
import { addKnowledge, generateZip, WEB_DISTRIBUTION_VERSION } from "./common";

export async function buildPluginZip(project: GptProject): Promise<Blob> {
  const zip = new JSZip();
  const id = toProjectId(project.name);
  const skillRoot = `skills/${id}`;

  zip.file(
    "plugin.json",
    JSON.stringify(
      {
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        name: id,
        version: WEB_DISTRIBUTION_VERSION,
        description: project.description
      },
      null,
      2
    ) + "\n"
  );

  zip.file(
    "README.md",
    `# ${project.name}\n\nPlugin-distribution genererad från canonical GPT-innehåll.\n`
  );

  zip.file(
    `${skillRoot}/SKILL.md`,
    `---
name: ${id}
description: ${project.description}
---

${project.instructions}
<!-- GPT-PACKAGER:RUNTIME-ADAPTER:BEGIN -->
## Knowledge

Referensmaterial finns under \`references/\` när sådant finns.
<!-- GPT-PACKAGER:RUNTIME-ADAPTER:END -->
`
  );

  await addKnowledge(zip, project, `${skillRoot}/references`);
  zip.file("VERSION", WEB_DISTRIBUTION_VERSION + "\n");
  return generateZip(zip);
}
