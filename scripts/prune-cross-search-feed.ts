import { evaluateCrossSearchPost } from "@/lib/cross-search-filters";
import { readJsonFile, writeJsonAtomically } from "@/lib/json-io";
import path from "path";
import type { CrossSearchPost } from "@/types/cross-search-post";

const postsFile = path.join(process.cwd(), "data", "posts-cross-search.json");

const posts = readJsonFile<CrossSearchPost[]>(postsFile, []);
const before = posts.length;
const pruned = posts.filter(function (post) {
  const evaluation = evaluateCrossSearchPost({
    text: post.content || post.summary || post.title || "",
    postedAt: post.postedAt,
    accountHandle: post.accountHandle,
  });
  return evaluation.pass;
});

writeJsonAtomically(postsFile, pruned);
console.log(
  JSON.stringify(
    {
      PRUNE_CROSS_SEARCH_FEED: "COMPLETE",
      before_count: before,
      after_count: pruned.length,
      removed_count: before - pruned.length,
    },
    null,
    2
  )
);
