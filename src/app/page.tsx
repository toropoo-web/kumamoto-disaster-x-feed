import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/config";
import {
  getImportantPosts,
  getLatestPosts,
  getLastSuccessfulFetchAt,
  getPublishedPosts,
} from "@/lib/posts";
import {
  EMPTY_HOME_POSTS_MESSAGE,
  EMPTY_IMPORTANT_POSTS_MESSAGE,
} from "@/types/post";
import { getPublicMonitoringSourceList } from "@/lib/sources";
import { SiteNav } from "@/components/SiteNav";
import { LastFetchInfo } from "@/components/LastFetchInfo";
import { MonitoringTargets } from "@/components/MonitoringTargets";
import { PostList } from "@/components/PostList";
import { RegionLinks, CategoryLinks } from "@/components/BrowseLinks";
import { SourceLinks } from "@/components/SourceLinks";

export const dynamic = "force-static";

export default function HomePage() {
  const monitoringSources = getPublicMonitoringSourceList();
  const importantPosts = getImportantPosts();
  const latestPosts = getLatestPosts(10);
  const hasPublishedPosts = getPublishedPosts().length > 0;
  const lastSuccessfulFetchAt = getLastSuccessfulFetchAt();

  return (
    <main>
      <SiteNav />

      <section>
        <h1>{SITE_TITLE}</h1>
        <p className="site-description">{SITE_DESCRIPTION}</p>
      </section>

      <LastFetchInfo lastSuccessfulFetchAt={lastSuccessfulFetchAt} />
      <MonitoringTargets sources={monitoringSources} />

      {!hasPublishedPosts ? (
        <p className="empty-state" style={{ whiteSpace: "pre-line" }}>
          {EMPTY_HOME_POSTS_MESSAGE}
        </p>
      ) : null}

      <section>
        <h2 className="section-title">重要情報</h2>
        <PostList
          posts={importantPosts}
          emptyMessage={EMPTY_IMPORTANT_POSTS_MESSAGE}
          highlighted
        />
      </section>

      <section>
        <h2 className="section-title">最新の公式投稿</h2>
        <PostList posts={latestPosts} />
      </section>

      <RegionLinks />
      <CategoryLinks />
      <SourceLinks sources={monitoringSources} />
    </main>
  );
}
