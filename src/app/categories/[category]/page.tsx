import { notFound } from "next/navigation";
import { CATEGORY_LABELS, ALL_CATEGORIES } from "@/types/post";
import type { PostCategory } from "@/types/post";
import { getPostsByCategory } from "@/lib/posts";
import { SiteNav } from "@/components/SiteNav";
import { PostList } from "@/components/PostList";

export const dynamic = "force-static";

type Props = {
  params: { category: string };
};

export function generateStaticParams() {
  return ALL_CATEGORIES.map((category) => ({
    category,
  }));
}

export default function CategoryPage({ params }: Props) {
  const category = params.category as PostCategory;
  if (!ALL_CATEGORIES.includes(category)) {
    notFound();
  }

  const posts = getPostsByCategory(category);
  const label = CATEGORY_LABELS[category];

  return (
    <main>
      <SiteNav />
      <section>
        <h1>{label}</h1>
        <p className="site-description" style={{ marginTop: "8px" }}>
          情報種別「{label}」の公式X投稿です。
        </p>
      </section>
      <PostList
        posts={posts}
        emptyMessage={`${label}に該当する掲載投稿はまだありません。`}
      />
    </main>
  );
}
