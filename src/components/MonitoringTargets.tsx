import Link from "next/link";
import type { Source } from "@/types/source";

type MonitoringTargetsProps = {
  sources: Source[];
};

export function MonitoringTargets({ sources }: MonitoringTargetsProps) {
  return (
    <section>
      <h2 className="section-title">現在の監視対象</h2>
      <ul className="source-list">
        {sources.map((source) => (
          <li key={source.sourceId}>
            <Link href={`/sources/${source.sourceId}`}>
              {source.displayName}
            </Link>
          </li>
        ))}
      </ul>
      <p style={{ marginTop: "12px", fontSize: "0.875rem" }}>
        <Link href="/sources">監視対象一覧を見る</Link>
      </p>
    </section>
  );
}
