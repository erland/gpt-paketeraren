import JSZip from "jszip";
import { GptProject, normalizeKnowledgePath, toProjectId } from "../domain/project";

export async function buildChatZip(project: GptProject): Promise<Blob> {
  const zip = new JSZip();

  zip.file(
    "START-HERE.md",
    `# ${project.name}

Använd detta ZIP-arkiv som GPT-kontext i en ChatGPT-konversation.

- Instruktionen finns i \`assistant/instructions.md\`.
- Eventuella Knowledge-filer finns under \`knowledge/\`.
- Bevara GPT-instruktionen som den är skriven.

Beskrivning: ${project.description}
`
  );

  zip.file("assistant/instructions.md", project.instructions);

  for (const item of project.knowledge) {
    const path = normalizeKnowledgePath(item.path);
    zip.file(`knowledge/${path}`, await item.content.arrayBuffer());
  }

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/zip",
    comment: `GPT Paketeraren: ${toProjectId(project.name)}`
  });
}
