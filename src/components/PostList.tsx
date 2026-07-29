import type { OfficialPost } from "@/types/post";
import { EMPTY_POSTS_MESSAGE } from "@/types/post";
import { PostCard } from "./PostCard";
import styles from "./PostList.module.css";

type PostListProps = {
  posts: OfficialPost[];
  emptyMessage?: string;
  highlighted?: boolean;
};

export function PostList({
  posts,
  emptyMessage = EMPTY_POSTS_MESSAGE,
  highlighted = false,
}: PostListProps) {
  if (posts.length === 0) {
    return (
      <p className="empty-state" style={{ whiteSpace: "pre-line" }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className={styles.list}>
      {posts.map((post) => (
        <PostCard key={post.postId} post={post} highlighted={highlighted} />
      ))}
    </div>
  );
}
