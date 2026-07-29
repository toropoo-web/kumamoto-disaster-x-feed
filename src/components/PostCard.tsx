import type { OfficialPost } from "@/types/post";
import { CATEGORY_LABELS } from "@/types/post";
import { formatDateTimeJa } from "@/lib/datetime";
import styles from "./PostCard.module.css";

type PostCardProps = {
  post: OfficialPost;
  highlighted?: boolean;
};

export function PostCard({ post, highlighted = false }: PostCardProps) {
  return (
    <article
      className={`${styles.card} ${highlighted ? styles.highlighted : ""}`}
    >
      <div className={styles.header}>
        <span className={styles.category}>{CATEGORY_LABELS[post.category]}</span>
        {post.isDemo && <span className={styles.sampleBadge}>DEMO</span>}
      </div>

      <h3 className={styles.title}>{post.title}</h3>
      <p className={styles.summary}>{post.summary}</p>

      <dl className={styles.meta}>
        <div className={styles.metaRow}>
          <dt>対象地域</dt>
          <dd>{post.regions.join("、")}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>発信元</dt>
          <dd>{post.sourceName}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>投稿日時</dt>
          <dd>{formatDateTimeJa(post.postedAt)}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>取得日時</dt>
          <dd>{formatDateTimeJa(post.fetchedAt)}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>メディア</dt>
          <dd>
            {post.hasImage || post.hasVideo
              ? [post.hasImage && "画像", post.hasVideo && "動画"]
                  .filter(Boolean)
                  .join("・")
              : "なし"}
          </dd>
        </div>
      </dl>

      <a
        href={post.postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
      >
        公式Xで確認
      </a>
    </article>
  );
}
