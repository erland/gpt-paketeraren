import { ChangeEvent, useMemo, useState } from "react";
import { buildChatZip } from "./distributions/chat";
import { buildClaudeZip } from "./distributions/claude";
import { buildOpenCodeZip } from "./distributions/opencode";
import { buildPluginZip } from "./distributions/plugin";
import { downloadBlob } from "./download/download";
import { importRuntimeZip } from "./import/importZip";
import { GptProject, KnowledgeFile, toProjectId, validateProject } from "./domain/project";
import "./styles.css";

type Runtime = "chat" | "plugin" | "claude" | "opencode";

const builders: Record<Runtime, (project: GptProject) => Promise<Blob>> = {
  chat: buildChatZip,
  plugin: buildPluginZip,
  claude: buildClaudeZip,
  opencode: buildOpenCodeZip
};

const labels: Record<Runtime, string> = {
  chat: "Chat",
  plugin: "ChatGPT Plugin",
  claude: "Claude",
  opencode: "OpenCode"
};

export default function App() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [knowledge, setKnowledge] = useState<KnowledgeFile[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<Runtime | null>(null);
  const [importing, setImporting] = useState(false);

  const project: GptProject = useMemo(
    () => ({ name, description, instructions, knowledge }),
    [name, description, instructions, knowledge]
  );

  const errors = validateProject(project);

  function addKnowledge(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setKnowledge((current) => [
      ...current,
      ...files.map((file) => ({ path: file.name, content: file, size: file.size }))
    ]);
    event.target.value = "";
  }

  function removeKnowledge(index: number) {
    setKnowledge((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function importZip(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    setMessage("");
    try {
      const imported = await importRuntimeZip(file);
      setName(imported.project.name);
      setDescription(imported.project.description);
      setInstructions(imported.project.instructions);
      setKnowledge(imported.project.knowledge);
      setMessage(`Importerade ${labels[imported.runtime]}-distributionen.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunde inte importera ZIP-filen.");
    } finally {
      setImporting(false);
    }
  }

  async function downloadRuntime(runtime: Runtime) {
    setMessage("");
    const validationErrors = validateProject(project);
    if (validationErrors.length > 0) {
      setMessage(validationErrors[0]);
      return;
    }

    setBusy(runtime);
    try {
      const zip = await builders[runtime](project);
      downloadBlob(zip, `${toProjectId(project.name)}-${runtime}.zip`);
      setMessage(`${labels[runtime]} ZIP skapades lokalt i webbläsaren.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Kunde inte skapa ${labels[runtime]} ZIP.`);
    } finally {
      setBusy(null);
    }
  }

  const totalKnowledgeSize = knowledge.reduce((sum, item) => sum + item.size, 0);
  const runtimes: Runtime[] = ["chat", "plugin", "claude", "opencode"];

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">GPT Paketeraren</p>
        <h1>Skapa GPT-distributioner i webbläsaren</h1>
        <p>
          Innehållet stannar på din enhet. Instruktionen används som du skriver den och
          skickas inte till någon server.
        </p>
      </section>

      <section className="card import-card">
        <div>
          <h2>Öppna befintlig GPT ZIP</h2>
          <p>Importera en tidigare Chat-, ChatGPT Plugin-, Claude- eller OpenCode-distribution.</p>
        </div>
        <label className="file-button">
          {importing ? "Öppnar…" : "Öppna GPT ZIP"}
          <input type="file" accept=".zip,application/zip" onChange={importZip} disabled={importing} />
        </label>
      </section>

      <section className="card form-grid" aria-label="GPT-projekt">
        <label>
          <span>Namn på GPT</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Produktinformatören" />
        </label>

        <label>
          <span>Kort beskrivning</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Visar information om en produkt."
          />
        </label>

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

        <div className="full">
          <div className="section-heading">
            <div>
              <h2>Knowledge-filer</h2>
              <p>Valfria filer som följer med distributionerna.</p>
            </div>
            <label className="file-button">
              Lägg till filer
              <input type="file" multiple onChange={addKnowledge} />
            </label>
          </div>

          {knowledge.length === 0 ? (
            <p className="empty">Inga Knowledge-filer valda.</p>
          ) : (
            <ul className="files">
              {knowledge.map((item, index) => (
                <li key={`${item.path}-${index}`}>
                  <span>{item.path}</span>
                  <button type="button" onClick={() => removeKnowledge(index)}>Ta bort</button>
                </li>
              ))}
            </ul>
          )}
          <small>{knowledge.length} filer · {formatBytes(totalKnowledgeSize)}</small>
        </div>
      </section>

      <section className="card">
        <div className="download-heading">
          <h2>Hämta distribution</h2>
          <p>Varje ZIP skapas först när du klickar på motsvarande knapp.</p>
        </div>
        <div className="download-grid">
          {runtimes.map((runtime) => (
            <button
              key={runtime}
              className="primary"
              type="button"
              onClick={() => downloadRuntime(runtime)}
              disabled={errors.length > 0 || busy !== null || importing}
            >
              {busy === runtime ? "Skapar…" : `Hämta ${labels[runtime]} ZIP`}
            </button>
          ))}
        </div>
        {message && <p className="status" role="status">{message}</p>}
      </section>
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
