import JSZip from "jszip";
import { GptProject } from "../domain/project";
import { addKnowledge, generateZip, WEB_DISTRIBUTION_VERSION } from "./common";

export async function buildOpenCodeZip(project: GptProject): Promise<Blob> {
  const zip = new JSZip();

  await addKnowledge(zip, project, "knowledge");
  zip.file(
    "AGENTS.md",
    project.instructions +
      `
<!-- GPT-PACKAGER:RUNTIME-ADAPTER:BEGIN -->
## OpenCode runtime

Knowledge-filer som hör till assistenten finns under \`knowledge/\` när sådana finns. Använd dem när instruktionen eller uppgiften gör dem relevanta.
<!-- GPT-PACKAGER:RUNTIME-ADAPTER:END -->
`
  );
  zip.file(
    "README.md",
    `# ${project.name} – OpenCode

${project.description}

Packa upp innehållet i roten av det workspace där assistenten ska användas.
`
  );
  zip.file("VERSION", WEB_DISTRIBUTION_VERSION + "\n");

  return generateZip(zip);
}
