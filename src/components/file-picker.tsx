"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function FilePicker({
  id,
  accept,
  disabled,
  label = "Choose file",
  onFile,
}: {
  id: string;
  accept?: string;
  disabled?: boolean;
  label?: string;
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  return (
    <div className="flex min-w-0 items-center gap-3">
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          setName(file?.name ?? "");
          if (file) onFile(file);
        }}
      />
      <Button type="button" variant="secondary" disabled={disabled} onClick={() => input.current?.click()}>
        {label}
      </Button>
      <span className="min-w-0 flex-1 truncate text-sm text-muted">{name || "No file chosen"}</span>
    </div>
  );
}
