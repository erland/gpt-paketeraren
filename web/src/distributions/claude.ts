import JSZip from "jszip";
import { GptProject } from "../domain/project";
import { addKnowledge, generateZip, WEB_DISTRIBUTION_VERSION } from "./common";

export async function buildClaudeZip(project: GptProject): Promise<Blob> {
  const zip = new JSZip();

  zip.file("instructions.md", project.instructions);
  await addKnowledge(zip, project, "knowledge");
  zip.file(
    "README.md",
    `# ${project.name} – Claude

${project.description}

1. Skapa ett Claude Project.
2. Använd \`instructions.md\` som Project Instructions.
3. Lägg till filerna under \`knowledge/\` som Project Files när sådana finns.
`
  );
  zip.file("VERSION", WEB_DISTRIBUTION_VERSION + "\n");

  return generateZip(zip);
}
