function parts(text: string) {
  const chunks: { kind: "text" | "bold"; value: string }[] = [];
  const source = text.replace(/\r\n/g, "\n");
  const pattern = /\*\*([^*]+)\*\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    if (match.index > cursor) chunks.push({ kind: "text", value: source.slice(cursor, match.index) });
    chunks.push({ kind: "bold", value: match[1] || "" });
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) chunks.push({ kind: "text", value: source.slice(cursor) });
  return chunks;
}

function inline(text: string) {
  return parts(text).map((chunk, index) => (
    chunk.kind === "bold" ? <strong key={index}>{chunk.value}</strong> : <span key={index}>{chunk.value}</span>
  ));
}

function sentencesOf(text: string) {
  const found = text.match(/[^.!?]+[.!?]+(?:["”']+)?(?:\s|$)|[^.!?]+$/g) || [text];
  return found.map((item) => item.trim()).filter(Boolean);
}

export function prepareSolaceText(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  if (/\n{2,}/.test(normalized)) return normalized;
  if (normalized.includes("\n")) {
    const lines = normalized.split("\n");
    const list = lines.every((line) => /^[-*]\s+/.test(line.trim()) || /^\d+\.\s+/.test(line.trim()));
    return list ? normalized : lines.map((line) => line.trim()).filter(Boolean).join("\n\n");
  }
  if (normalized.length < 280) return normalized;
  const sentences = sentencesOf(normalized);
  if (sentences.length < 2) return normalized;
  const paragraphs: string[] = [];
  let bucket = "";
  const flush = () => {
    if (bucket.trim()) paragraphs.push(bucket.trim());
    bucket = "";
  };
  for (const sentence of sentences) {
    const question = /\?\s*$/.test(sentence);
    if (question) {
      flush();
      paragraphs.push(sentence);
      continue;
    }
    const next = bucket ? `${bucket} ${sentence}` : sentence;
    if (bucket && (next.length > 260 || sentences.length > 3 && next.split(/(?<=[.!?])\s/).length > 2)) {
      flush();
      bucket = sentence;
    } else {
      bucket = next;
    }
  }
  flush();
  return paragraphs.join("\n\n");
}

export function SolaceMarkdown({ text }: { text: string }) {
  const blocks = prepareSolaceText(text).split(/\n{2,}/);
  return (
    <div className="grid gap-3">
      {blocks.map((block, index) => {
        const lines = block.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim().length > 0);
        if (!lines.length) return null;
        const heading = lines.length === 1 ? lines[0]?.match(/^(#{1,3})\s+(.+)$/) : null;
        if (heading) {
          return <p key={index} className="font-display text-base tracking-tight">{inline(heading[2] || "")}</p>;
        }
        const list = lines.every((line) => /^[-*]\s+/.test(line.trim()) || /^\d+\.\s+/.test(line.trim()));
        if (list && lines.length) {
          return (
            <ul key={index} className="grid list-disc gap-1 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{inline(line.replace(/^([-*]|\d+\.)\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {inline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
