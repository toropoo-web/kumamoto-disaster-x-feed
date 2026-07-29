import { notFound } from "next/navigation";
import { getPostsByRegion } from "@/lib/posts";
import { REGION_OPTIONS } from "@/types/post";
import { SiteNav } from "@/components/SiteNav";
import { PostList } from "@/components/PostList";

export const dynamic = "force-static";

type Props = {
  params: { region: string };
};

export function generateStaticParams() {
  return REGION_OPTIONS.map((region) => ({
    region,
  }));
}

export default function RegionPage({ params }: Props) {
  const region = decodeURIComponent(params.region);
  if (!REGION_OPTIONS.includes(region as (typeof REGION_OPTIONS)[number])) {
    notFound();
  }

  const posts = getPostsByRegion(region);

  return (
    <main>
      <SiteNav />
      <section>
        <h1>{region}の投稿</h1>
        <p className="site-description" style={{ marginTop: "8px" }}>
          対象地域に関連する公式X投稿です。
        </p>
      </section>
      <PostList
        posts={posts}
        emptyMessage={`${region}に関連する掲載投稿はまだありません。`}
      />
    </main>
  );
}
