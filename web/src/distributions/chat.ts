import JSZip from "jszip";
import { GptProject, normalizeKnowledgePath, toProjectId } from "../domain/project";

export async function buildChatZip(project: GptProject): Promise<Blob> {
  const zip = new JSZip();
  const projectId = toProjectId(project.name);

  zip.file(
    "START-HERE.md",
    `# ${project.name}

${project.description}

Använd innehållet i denna ZIP som GPT-kontext i den här konversationen.

Läs först \`assistant/instructions.md\`. Knowledge-filer finns under \`knowledge/\` när sådana finns.
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
    comment: `GPT Paketeraren: ${projectId}`
  });
}
