import { stampFeedStatusCommit } from "../src/lib/feed-status";

const commitSha = process.argv[2];

if (!commitSha) {
  console.error("Usage: tsx scripts/stamp-feed-status-commit.ts <commit-sha>");
  process.exit(1);
}

const updated = stampFeedStatusCommit(commitSha);
console.log(
  JSON.stringify(
    {
      FEED_STATUS_COMMIT_STAMPED: true,
      last_commit: updated.last_commit,
      status: updated.status,
    },
    null,
    2
  )
);
