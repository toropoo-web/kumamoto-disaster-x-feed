import { getPublishedPosts } from "@/lib/posts";
import { SiteNav } from "@/components/SiteNav";
import { PostList } from "@/components/PostList";

export const dynamic = "force-static";

export default function PostsPage() {
  const posts = getPublishedPosts();

  return (
    <main>
      <SiteNav />
      <section>
        <h1>全投稿タイムライン</h1>
        <p className="site-description" style={{ marginTop: "8px" }}>
          掲載対象の公式X投稿を時系列で表示しています。
        </p>
      </section>
      <PostList posts={posts} />
    </main>
  );
}
