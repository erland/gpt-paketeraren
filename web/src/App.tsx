import { ChangeEvent, useMemo, useState } from "react";
import { buildChatZip } from "./distributions/chat";
import { downloadBlob } from "./download/download";
import { GptProject, KnowledgeFile, toProjectId, validateProject } from "./domain/project";
import "./styles.css";

export default function App() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [knowledge, setKnowledge] = useState<KnowledgeFile[]>([]);
  const [message, setMessage] = useState("");

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

  async function downloadChat() {
    setMessage("");
    const validationErrors = validateProject(project);
    if (validationErrors.length > 0) {
      setMessage(validationErrors[0]);
      return;
    }

    try {
      const zip = await buildChatZip(project);
      downloadBlob(zip, `${toProjectId(project.name)}-chat.zip`);
      setMessage("Chat ZIP skapades lokalt i webbläsaren.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunde inte skapa Chat ZIP.");
    }
  }

  const totalKnowledgeSize = knowledge.reduce((sum, item) => sum + item.size, 0);

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
              <p>Valfria filer som följer med distributionen.</p>
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

      <section className="card downloads">
        <div>
          <h2>Hämta distribution</h2>
          <p>Distributionen skapas först när du klickar på Hämta.</p>
        </div>
        <button className="primary" type="button" onClick={downloadChat} disabled={errors.length > 0}>
          Hämta Chat ZIP
        </button>
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
