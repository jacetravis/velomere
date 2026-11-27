"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import labels from "@/lib/cards/d3-labels.json";

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function blocks(markdown: string) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const out: Array<{ kind: "h1" | "h2" | "h3" | "quote" | "p"; text: string }> = [];
  let para: string[] = [];
  const flush = () => {
    if (!para.length) return;
    out.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      out.push({ kind: "h3", text: line.slice(4).trim() });
      continue;
    }
    if (line.startsWith("## ")) {
      flush();
      out.push({ kind: "h2", text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith("# ")) {
      flush();
      out.push({ kind: "h1", text: line.slice(2).trim() });
      continue;
    }
    if (line.startsWith("> ")) {
      flush();
      out.push({ kind: "quote", text: line.slice(2).trim() });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out;
}

export function VelomereGuide({ focus = "" }: { focus?: string }) {
  const [markdown, setMarkdown] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancel = false;
    void fetch("/guides/velomere-living-meanings-v9.md")
      .then((response) => {
        if (!response.ok) throw new Error("missing");
        return response.text();
      })
      .then((text) => {
        if (!cancel) setMarkdown(text);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, []);
  const rendered = useMemo(() => blocks(markdown), [markdown]);
  useEffect(() => {
    if (!focus || !rendered.length) return;
    document.getElementById(`card-${slug(focus)}`)?.scrollIntoView({ block: "start" });
  }, [focus, rendered]);
  const names = new Set(labels.map((row) => row.name));
  return (
    <AppShell>
      <header className="flex flex-col gap-3">
        <p className="text-xs tracking-[0.18em] text-subtle uppercase">Companion · v9</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">Living Meanings</h1>
        <p className="text-sm leading-relaxed text-subtle">
          The original word canon, named with Solace, is the lexical foundation. The seventy-eight card readings stay the authority for upright and shadow. This edition is the open field. Empty space may fall anywhere the relation places it. It does not replace either canon.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <a className="underline decoration-border underline-offset-4" href="/guides/velomere-living-meanings-v9.md" download>
            Markdown
          </a>
          <a className="underline decoration-border underline-offset-4" href="/guides/velomere-living-meanings-v8.md" download>
            Earlier v8 edition
          </a>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-subtle">Jump to a card</span>
          <select
            className="rounded-md bg-surface px-3 py-2 text-fg"
            value={focus}
            onChange={(event) => {
              const name = event.target.value;
              if (!name) return;
              document.getElementById(`card-${slug(name)}`)?.scrollIntoView({ block: "start" });
            }}
          >
            <option value="">Choose</option>
            {labels.map((row, index) => (
              <option key={row.name} value={row.name}>{index + 1} · {row.name}</option>
            ))}
          </select>
        </label>
      </header>
      {failed ? <p className="mt-8 text-sm text-fg">The companion could not be opened.</p> : null}
      {!markdown && !failed ? <p className="mt-8 text-sm text-subtle">Opening the book…</p> : null}
      <article className="mt-8 flex flex-col gap-4 pb-16">
        {rendered.map((block, index) => {
          if (block.kind === "h1") return <h2 key={index} className="font-display text-3xl font-medium tracking-tight">{block.text}</h2>;
          if (block.kind === "h2") return <h3 key={index} className="mt-6 font-display text-2xl font-medium tracking-tight">{block.text}</h3>;
          if (block.kind === "h3") {
            const title = block.text.split("·")[0]?.trim() ?? block.text;
            const id = names.has(title) ? `card-${slug(title)}` : undefined;
            return <h4 key={index} id={id} className="mt-6 scroll-mt-24 font-display text-xl font-medium">{block.text}</h4>;
          }
          if (block.kind === "quote") return <blockquote key={index} className="border-l border-border pl-4 text-sm leading-relaxed text-subtle">{block.text}</blockquote>;
          return <p key={index} className="text-sm leading-relaxed text-fg">{block.text}</p>;
        })}
      </article>
    </AppShell>
  );
}
