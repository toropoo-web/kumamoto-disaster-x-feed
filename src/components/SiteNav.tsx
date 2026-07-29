import Link from "next/link";

export function SiteNav() {
  return (
    <nav className="nav-links" aria-label="サイト内ナビゲーション">
      <Link href="/">トップ</Link>
      <Link href="/posts">全投稿</Link>
      <Link href="/sources">監視対象</Link>
    </nav>
  );
}
