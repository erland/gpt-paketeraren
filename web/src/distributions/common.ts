import JSZip from "jszip";
import { GptProject, normalizeKnowledgePath } from "../domain/project";

export const WEB_DISTRIBUTION_VERSION = "0.0.0-web";

export async function addKnowledge(
  zip: JSZip,
  project: GptProject,
  basePath: string
): Promise<void> {
  for (const item of project.knowledge) {
    const path = normalizeKnowledgePath(item.path);
    zip.file(`${basePath}/${path}`, await item.content.arrayBuffer());
  }
}

export async function generateZip(zip: JSZip): Promise<Blob> {
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/zip"
  });
}
