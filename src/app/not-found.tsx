import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <h1>ページが見つかりません</h1>
      <p className="site-description">
        <Link href="/">トップページへ戻る</Link>
      </p>
    </main>
  );
}
