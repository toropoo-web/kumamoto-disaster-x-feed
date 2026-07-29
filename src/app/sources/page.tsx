import Link from "next/link";
import { formatDateTimeJa } from "@/lib/datetime";
import {
  countActiveMonitoringSources,
  countRegisteredSources,
  getSourceRegistryEntries,
} from "@/lib/source-registry";
import { SiteNav } from "@/components/SiteNav";

const SOURCE_TYPE_LABELS: Record<string, string> = {
  GOVERNMENT: "政府機関",
  PREFECTURE: "都道府県",
  MUNICIPALITY: "市区町村",
  LOCAL_GOVERNMENT: "自治体公式",
  DEFENSE: "防衛",
  PUBLIC_OFFICIAL: "公人",
};

export const dynamic = "force-static";

export default function SourcesPage() {
  const entries = getSourceRegistryEntries();
  const activeCount = countActiveMonitoringSources();
  const registeredCount = countRegisteredSources();

  return (
    <main>
      <SiteNav />
      <section>
        <h1>監視対象一覧</h1>
        <p className="site-description" style={{ marginTop: "8px" }}>
          公開監視対象: {activeCount}件 / 登録Source総数: {registeredCount}件
        </p>
      </section>

      <section>
        {entries.map(({ source, monitoringStatus, lastSuccessfulFetchAt, xProfileUrl }) => (
          <article
            key={source.sourceId}
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius)",
              padding: "16px",
              marginBottom: "12px",
            }}
          >
            <h2 style={{ fontSize: "1rem", marginBottom: "8px" }}>
              {source.displayName}
            </h2>
            <dl style={{ fontSize: "0.8125rem" }}>
              <div style={{ display: "flex", gap: "8px", padding: "2px 0" }}>
                <dt style={{ width: "10em", color: "var(--color-text-muted)" }}>
                  Xアカウント
                </dt>
                <dd>
                  {source.accountHandle ? (
                    xProfileUrl ? (
                      <a
                        href={xProfileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        @{source.accountHandle}
                      </a>
                    ) : (
                      `@${source.accountHandle}`
                    )
                  ) : (
                    "未確定"
                  )}
                </dd>
              </div>
              <div style={{ display: "flex", gap: "8px", padding: "2px 0" }}>
                <dt style={{ width: "10em", color: "var(--color-text-muted)" }}>
                  発信元種別
                </dt>
                <dd>
                  {SOURCE_TYPE_LABELS[source.sourceType] ?? source.sourceType}
                </dd>
              </div>
              <div style={{ display: "flex", gap: "8px", padding: "2px 0" }}>
                <dt style={{ width: "10em", color: "var(--color-text-muted)" }}>
                  対象地域
                </dt>
                <dd>{source.region}</dd>
              </div>
              <div style={{ display: "flex", gap: "8px", padding: "2px 0" }}>
                <dt style={{ width: "10em", color: "var(--color-text-muted)" }}>
                  監視状態
                </dt>
                <dd>
                  {monitoringStatus === "ACTIVE" ? "監視中" : "監視準備中"}
                </dd>
              </div>
              <div style={{ display: "flex", gap: "8px", padding: "2px 0" }}>
                <dt style={{ width: "10em", color: "var(--color-text-muted)" }}>
                  最終取得成功
                </dt>
                <dd>
                  {lastSuccessfulFetchAt
                    ? formatDateTimeJa(lastSuccessfulFetchAt)
                    : "未取得"}
                </dd>
              </div>
            </dl>
            {monitoringStatus === "ACTIVE" && (
              <p style={{ marginTop: "8px", fontSize: "0.875rem" }}>
                <Link href={`/sources/${source.sourceId}`}>
                  投稿一覧を見る
                </Link>
              </p>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
