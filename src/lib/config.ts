export const SITE_TITLE = "熊本地震 公式X情報まとめ";
export const SITE_DESCRIPTION =
  "熊本地震に関する公的機関・自治体等の公式X投稿を、発信元・地域・情報種別ごとに整理しています。";
export const DISCLAIMER_TEXT =
  "本サイトは行政機関が運営する公式サイトではありません。緊急時は、各機関の公式Xおよび公式Webサイトを直接確認してください。";

export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    "http://localhost:3000"
  );
}
