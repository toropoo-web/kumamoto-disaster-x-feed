import Link from "next/link";
import type { Source } from "@/types/source";

type SourceLinksProps = {
  sources: Source[];
};

export function SourceLinks({ sources }: SourceLinksProps) {
  return (
    <section>
      <h2 className="section-title">発信元から探す</h2>
      <div className="chip-list">
        {sources.map((source) => (
          <Link
            key={source.sourceId}
            href={`/sources/${source.sourceId}`}
            className="chip"
          >
            {source.displayName}
          </Link>
        ))}
      </div>
    </section>
  );
}
