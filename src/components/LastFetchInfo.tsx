import { DISCLAIMER_TEXT } from "@/lib/config";
import { formatDateTimeJa } from "@/lib/datetime";

type LastFetchInfoProps = {
  lastSuccessfulFetchAt: string | null;
};

export function LastFetchInfo({ lastSuccessfulFetchAt }: LastFetchInfoProps) {
  return (
    <section>
      {lastSuccessfulFetchAt ? (
        <p className="meta-text">
          公式X最終取得：{formatDateTimeJa(lastSuccessfulFetchAt)}
        </p>
      ) : (
        <p className="meta-text">公式Xからの取得は現在準備中です</p>
      )}
      <p className="meta-text disclaimer" style={{ marginTop: "8px" }}>
        {DISCLAIMER_TEXT}
      </p>
    </section>
  );
}
