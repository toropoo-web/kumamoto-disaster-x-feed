import { notFound } from "next/navigation";
import { getAllSources, getSourceById } from "@/lib/sources";
import { getPostsBySource } from "@/lib/posts";
import { SiteNav } from "@/components/SiteNav";
import { PostList } from "@/components/PostList";

export const dynamic = "force-static";

type Props = {
  params: { sourceId: string };
};

export function generateStaticParams() {
  return getAllSources().map((source) => ({
    sourceId: source.sourceId,
  }));
}

export default function SourceDetailPage({ params }: Props) {
  const source = getSourceById(params.sourceId);
  if (!source) {
    notFound();
  }

  const posts = getPostsBySource(params.sourceId);

  return (
    <main>
      <SiteNav />
      <section>
        <h1>{source.displayName}</h1>
        <p className="site-description" style={{ marginTop: "8px" }}>
          {source.accountHandle
            ? `@${source.accountHandle} の公式投稿`
            : "アカウント未確定"}
        </p>
      </section>
      <PostList
        posts={posts}
        emptyMessage={`${source.displayName}の掲載投稿はまだありません。`}
      />
    </main>
  );
}
