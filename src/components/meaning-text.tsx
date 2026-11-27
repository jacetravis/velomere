export function MeaningText({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\\n/g, "\n").split("\n");
  return (
    <div className={className}>
      {lines.map((line, index) => {
        const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
        if (bullet) {
          return (
            <p key={index} className="pl-4">
              <span className="mr-2 text-subtle" aria-hidden>
                •
              </span>
              {bullet[1]}
            </p>
          );
        }
        if (!line.trim()) return <div key={index} className="h-2" />;
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}
