import { ReactNode } from "react";
import { isMarkdownFile, previewLanguage } from "../import/packageViewer";

interface FilePreviewProps {
  path: string;
  content: string;
}

export function FilePreview({ path, content }: FilePreviewProps) {
  const language = previewLanguage(path);

  if (isMarkdownFile(path)) {
    return (
      <div className="preview-body markdown-preview">
        <MarkdownPreview content={content} />
      </div>
    );
  }

  if (language && language !== "txt" && language !== "csv") {
    return (
      <div className="preview-body code-preview">
        <div className="preview-language">{language}</div>
        <CodeBlock content={content} language={language} />
      </div>
    );
  }

  return (
    <div className="preview-body text-preview">
      <pre>{content}</pre>
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```([^\s]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      const language = fence[1] || "text";
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <div className="markdown-code" key={blocks.length}>
          <div className="preview-language">{language}</div>
          <CodeBlock content={code.join("\n")} language={language} />
        </div>
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const children = renderInline(heading[2], `h-${blocks.length}`);
      if (level === 1) blocks.push(<h1 key={blocks.length}>{children}</h1>);
      else if (level === 2) blocks.push(<h2 key={blocks.length}>{children}</h2>);
      else if (level === 3) blocks.push(<h3 key={blocks.length}>{children}</h3>);
      else if (level === 4) blocks.push(<h4 key={blocks.length}>{children}</h4>);
      else if (level === 5) blocks.push(<h5 key={blocks.length}>{children}</h5>);
      else blocks.push(<h6 key={blocks.length}>{children}</h6>);
      index += 1;
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      blocks.push(<hr key={blocks.length} />);
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = tableCells(lines[index]);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="markdown-table-wrap" key={blocks.length}>
          <table>
            <thead><tr>{headers.map((cell, i) => <th key={i}>{renderInline(cell, `th-${i}`)}</th>)}</tr></thead>
            <tbody>{rows.map((row, r) => (
              <tr key={r}>{row.map((cell, c) => <td key={c}>{renderInline(cell, `td-${r}-${c}`)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ""));
        index += 1;
      }
      blocks.push(<ul key={blocks.length}>{items.map((item, i) => <li key={i}>{renderInline(item, `ul-${i}`)}</li>)}</ul>);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ""));
        index += 1;
      }
      blocks.push(<ol key={blocks.length}>{items.map((item, i) => <li key={i}>{renderInline(item, `ol-${i}`)}</li>)}</ol>);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={blocks.length}>{quote.map((item, i) => <p key={i}>{renderInline(item, `q-${i}`)}</p>)}</blockquote>);
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={blocks.length}>{renderInline(paragraph.join(" "), `p-${blocks.length}`)}</p>);
  }

  return <>{blocks}</>;
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index];
  return (
    /^\s*```/.test(line) ||
    /^(#{1,6})\s+/.test(line) ||
    /^\s*(---+|\*\*\*+)\s*$/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    isTableStart(lines, index)
  );
}

function isTableStart(lines: string[], index: number): boolean {
  if (index + 1 >= lines.length || !lines[index].includes("|")) return false;
  const separator = lines[index + 1].trim();
  if (!separator.includes("|")) return false;
  return tableCells(separator).every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const tokenPattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g;
  const parts = text.split(tokenPattern).filter(Boolean);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeHref(link[2]);
      return href
        ? <a key={key} href={href} target="_blank" rel="noreferrer">{link[1]}</a>
        : <span key={key}>{link[1]}</span>;
    }
    return part;
  });
}

function safeHref(value: string): string | undefined {
  const trimmed = value.trim();
  return /^(https?:|mailto:|#)/i.test(trimmed) ? trimmed : undefined;
}

function CodeBlock({ content, language }: { content: string; language: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  return (
    <pre className="highlighted-code">
      <code>
        {lines.map((line, index) => (
          <span className="code-line" key={index}>{highlightLine(line, language)}{"\n"}</span>
        ))}
      </code>
    </pre>
  );
}

function highlightLine(line: string, language: string): ReactNode {
  if (["yaml", "json", "toml", "properties", "ini", "cfg", "conf"].includes(language)) {
    const property = line.match(/^(\s*(?:-\s*)?)(["']?[A-Za-z0-9_.-]+["']?)(\s*[:=])(.*)$/);
    if (property) {
      return <>
        {property[1]}<span className="syntax-key">{property[2]}</span>{property[3]}
        {highlightValue(property[4], language)}
      </>;
    }
  }

  if (language === "xml" || language === "html") {
    return highlightByPattern(line, /(<\/?[A-Za-z][^>]*>|<!--[\s\S]*?-->|"[^"]*"|'[^']*')/g);
  }

  return highlightByPattern(
    line,
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*$|#.*$|\b(?:true|false|null|None|True|False|const|let|var|function|return|if|else|for|while|class|interface|type|import|from|export|def|async|await|public|private|protected|static|new|try|catch|throw|extends|implements|package|SELECT|FROM|WHERE|JOIN|INSERT|UPDATE|DELETE|CREATE|TABLE)\b|\b\d+(?:\.\d+)?\b)/g
  );
}

function highlightValue(value: string, language: string): ReactNode {
  return highlightByPattern(
    value,
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#.*$|\b(?:true|false|null|yes|no|on|off)\b|\b\d+(?:\.\d+)?\b)/gi,
    language
  );
}

function highlightByPattern(line: string, pattern: RegExp, language = ""): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(line.slice(lastIndex, index));
    const token = match[0];
    nodes.push(<span className={tokenClass(token, language)} key={`${index}-${token}`}>{token}</span>);
    lastIndex = index + token.length;
  }

  if (lastIndex < line.length) nodes.push(line.slice(lastIndex));
  return nodes;
}

function tokenClass(token: string, language: string): string {
  if (token.startsWith("//") || token.startsWith("#") || token.startsWith("<!--")) return "syntax-comment";
  if (token.startsWith("<") && (language === "xml" || language === "html")) return "syntax-tag";
  if (token.startsWith('"') || token.startsWith("'")) return "syntax-string";
  if (/^\d/.test(token)) return "syntax-number";
  if (/^(true|false|null|yes|no|on|off|None|True|False)$/i.test(token)) return "syntax-literal";
  return "syntax-keyword";
}
