import JSZip from "jszip";
import { GptProject, toProjectId } from "../domain/project";
import { addKnowledge, generateZip, WEB_DISTRIBUTION_VERSION } from "./common";

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function pluginRuntimeContract(id: string) {
  return {
    schema_version: 1,
    runtime_id: "openai_plugin",
    adapter: {
      mode: "openai_plugin",
      skills_first: true,
      skills: [id],
      mcp_generated: false,
      ui_generated: false,
      hooks_generated: false,
      script_resources: {
        packaged: [],
        mcp_required_for_resource_use: false
      },
      canonical_scope: ["instructions", "knowledge"]
    }
  };
}

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
    "runtime-contract.json",
    JSON.stringify(pluginRuntimeContract(id), null, 2) + "\n"
  );

  zip.file(
    "README.md",
    `# ${project.name}\n\nOpenAI Plugin-distribution genererad från canonical GPT-innehåll.\n`
  );

  const skillMarkdown = [
    "---",
    `name: ${yamlScalar(id)}`,
    `description: ${yamlScalar(project.description)}`,
    "---",
    "",
    project.instructions.replace(/\n$/, ""),
    "<!-- GPT-PACKAGER:RUNTIME-ADAPTER:BEGIN -->",
    "## Knowledge",
    "",
    "Referensmaterial finns under `references/` när sådant finns.",
    "<!-- GPT-PACKAGER:RUNTIME-ADAPTER:END -->",
    ""
  ].join("\n");

  zip.file(`${skillRoot}/SKILL.md`, skillMarkdown);

  await addKnowledge(zip, project, `${skillRoot}/references`);
  zip.file("VERSION", WEB_DISTRIBUTION_VERSION + "\n");
  return generateZip(zip);
}
