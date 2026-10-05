import { ChangeEvent, useMemo, useState } from "react";
import { buildChatZip } from "./distributions/chat";
import { buildClaudeZip } from "./distributions/claude";
import { buildOpenCodeZip } from "./distributions/opencode";
import { buildPluginZip } from "./distributions/plugin";
import { downloadBlob } from "./download/download";
import { importRuntimeZip } from "./import/importZip";
import { isTextFile } from "./import/packageViewer";
import { PackageFile, PackageMetadata } from "./domain/package";
import { GptProject, KnowledgeFile, toProjectId, validateProject } from "./domain/project";
import { FilePreview } from "./preview/FilePreview";
import "./styles.css";

type Runtime = "chat" | "plugin" | "claude" | "opencode";
type ViewMode = "editable" | "readonly";

const builders: Record<Runtime, (project: GptProject) => Promise<Blob>> = {
  chat: buildChatZip, plugin: buildPluginZip, claude: buildClaudeZip, opencode: buildOpenCodeZip
};
const labels: Record<Runtime, string> = { chat: "Chat", plugin: "OpenAI Plugin", claude: "Claude", opencode: "OpenCode" };

export default function App() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [knowledge, setKnowledge] = useState<KnowledgeFile[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<Runtime | null>(null);
  const [importing, setImporting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("editable");
  const [packageFiles, setPackageFiles] = useState<PackageFile[]>([]);
  const [packageMetadata, setPackageMetadata] = useState<PackageMetadata | null>(null);
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);

  const project: GptProject = useMemo(() => ({ name, description, instructions, knowledge }), [name, description, instructions, knowledge]);
  const errors = validateProject(project);
  const readOnly = viewMode === "readonly";

  function addKnowledge(event: ChangeEvent<HTMLInputElement>) {
    if (readOnly) return;
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setKnowledge((current) => [...current, ...files.map((file) => ({ path: file.name, content: file, size: file.size }))]);
    event.target.value = "";
  }

  function removeKnowledge(index: number) {
    if (!readOnly) setKnowledge((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function importZip(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true); setMessage(""); setPreview(null);
    try {
      const imported = await importRuntimeZip(file);
      setViewMode(imported.mode);
      setPackageFiles(imported.files);
      setPackageMetadata(imported.metadata);
      if (imported.mode === "readonly") {
        const instruction = imported.metadata.instructionPath
          ? imported.files.find((item) => item.path === imported.metadata.instructionPath)?.textContent ?? ""
          : "";
        setName(imported.metadata.name);
        setDescription(formatPackageDescription(imported.metadata));
        setInstructions(instruction);
        setKnowledge([]);
        setMessage("Importerade en avancerad GPT-distribution i read-only-läge.");
      } else if (imported.project) {
        setName(imported.project.name);
        setDescription(imported.project.description);
        setInstructions(imported.project.instructions);
        setKnowledge(imported.project.knowledge);
        const runtime = imported.runtime as Runtime;
        setMessage(`Importerade ${labels[runtime]}-distributionen.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunde inte importera ZIP-filen.");
    } finally { setImporting(false); }
  }

  async function openKnowledge(item: KnowledgeFile) {
    if (!isTextFile(item.path)) { setMessage("Den här filtypen kan inte förhandsvisas som text."); return; }
    setPreview({ title: item.path, content: await item.content.text() });
  }

  function openPackageFile(item: PackageFile) {
    if (item.textContent === undefined) { setMessage("Den här filtypen kan inte förhandsvisas som text."); return; }
    setPreview({ title: item.path, content: item.textContent });
  }

  async function downloadRuntime(runtime: Runtime) {
    if (readOnly) return;
    setMessage("");
    const validationErrors = validateProject(project);
    if (validationErrors.length > 0) { setMessage(validationErrors[0]); return; }
    setBusy(runtime);
    try {
      const zip = await builders[runtime](project);
      downloadBlob(zip, `${toProjectId(project.name)}-${runtime}.zip`);
      setMessage(`${labels[runtime]} ZIP skapades lokalt i webbläsaren.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Kunde inte skapa ${labels[runtime]} ZIP.`);
    } finally { setBusy(null); }
  }

  const totalKnowledgeSize = knowledge.reduce((sum, item) => sum + item.size, 0);
  const runtimes: Runtime[] = ["chat", "plugin", "claude", "opencode"];

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">GPT Paketeraren</p>
        <h1>Skapa och visa GPT-distributioner i webbläsaren</h1>
        <p>Innehållet stannar på din enhet. Vanliga GPT Paketeraren-distributioner kan redigeras; avancerade GPT-paket visas read-only.</p>
      </section>

      <section className="card import-card">
        <div><h2>Öppna befintlig GPT ZIP</h2><p>Importera GPT Paketeraren- eller avancerade GPT-distributioner.</p></div>
        <label className="file-button">{importing ? "Öppnar…" : "Öppna GPT ZIP"}<input type="file" accept=".zip,application/zip" onChange={importZip} disabled={importing} /></label>
      </section>

      {readOnly && (
        <section className="card readonly-banner">
          <div><strong>Read only</strong><p>Detta är en avancerad GPT-distribution. Innehållet kan visas men inte ändras eller konverteras.</p></div>
          <div className="package-meta">{packageMetadata?.version && <span>Version {packageMetadata.version}</span>}{packageMetadata?.format && <span>{packageMetadata.format}</span>}</div>
        </section>
      )}

      <section className="card form-grid" aria-label="GPT-projekt">
        <label><span>Namn på GPT</span><input value={name} readOnly={readOnly} onChange={(event) => setName(event.target.value)} placeholder="Produktinformatören" /></label>
        <label><span>Kort beskrivning</span><input value={description} readOnly={readOnly} onChange={(event) => setDescription(event.target.value)} placeholder="Visar information om en produkt." /></label>
        {readOnly ? (
          <div className="full instruction-readonly">
            <span className="field-label">GPT-instruktion</span>
            <div className="instruction-preview">
              <FilePreview
                path={packageMetadata?.instructionPath ?? "instructions.md"}
                content={instructions}
              />
            </div>
            <small>Visas från {packageMetadata?.instructionPath ?? "identifierad instruction-fil"}.</small>
          </div>
        ) : (
          <label className="full">
            <span>GPT-instruktion</span>
            <textarea
              rows={14}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Skriv eller klistra in instruktionen här."
            />
            <small>Instruktionen skrivs inte om eller förbättras av PWA:n.</small>
          </label>
        )}

        {!readOnly && (
          <div className="full">
            <div className="section-heading"><div><h2>Knowledge-filer</h2><p>Klicka på en textfil för att visa innehållet.</p></div><label className="file-button">Lägg till filer<input type="file" multiple onChange={addKnowledge} /></label></div>
            {knowledge.length === 0 ? <p className="empty">Inga Knowledge-filer valda.</p> : (
              <ul className="files">{knowledge.map((item, index) => (
                <li key={`${item.path}-${index}`}><button className="file-link" type="button" onClick={() => openKnowledge(item)}>{item.path}</button><button type="button" onClick={() => removeKnowledge(index)}>Ta bort</button></li>
              ))}</ul>
            )}
            <small>{knowledge.length} filer · {formatBytes(totalKnowledgeSize)}</small>
          </div>
        )}

        {readOnly && (
          <div className="full">
            <div className="section-heading"><div><h2>Paketfiler</h2><p>Markdown renderas som dokument. YAML, JSON, XML och källkod visas med syntaxmarkering.</p></div></div>
            <ul className="files package-files">{packageFiles.map((item) => (
              <li key={item.path}><button className="file-link" type="button" disabled={item.textContent === undefined} onClick={() => openPackageFile(item)}>{item.path}</button><span>{formatBytes(item.size)}</span></li>
            ))}</ul>
            <small>{packageFiles.length} filer</small>
          </div>
        )}
      </section>

      <section className="card">
        <div className="download-heading"><h2>Hämta distribution</h2><p>{readOnly ? "Distributioner kan inte skapas från ett read-only-paket." : "Varje ZIP skapas först när du klickar på motsvarande knapp."}</p></div>
        <div className="download-grid">{runtimes.map((runtime) => (
          <button key={runtime} className="primary" type="button" onClick={() => downloadRuntime(runtime)} disabled={readOnly || errors.length > 0 || busy !== null || importing}>{busy === runtime ? "Skapar…" : `Hämta ${labels[runtime]} ZIP`}</button>
        ))}</div>
        {message && <p className="status" role="status">{message}</p>}
      </section>

      {preview && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPreview(null)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><h2 id="preview-title">{preview.title}</h2><button className="modal-close" type="button" onClick={() => setPreview(null)} aria-label="Stäng">×</button></header>
            <FilePreview path={preview.title} content={preview.content} />
          </section>
        </div>
      )}
    </main>
  );
}

function formatPackageDescription(metadata: PackageMetadata): string {
  const parts = ["Avancerad GPT-distribution"];
  if (metadata.format) parts.push(metadata.format);
  if (metadata.version) parts.push(`version ${metadata.version}`);
  return parts.join(" · ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
