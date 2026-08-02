import fs from "fs";

export const X_API_FETCH_DISABLED_SUMMARY_TITLE = "X API取得停止中";

export function isXApiFetchEnabled(): boolean {
  const value = process.env.X_API_FETCH_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

export function writeXApiFetchDisabledStepSummary(
  workflow: "official" | "cross-search"
): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  const label =
    workflow === "cross-search"
      ? "Fetch X Cross Search Posts"
      : "Fetch X Posts";

  const lines = [
    `## ${X_API_FETCH_DISABLED_SUMMARY_TITLE}`,
    "",
    `Workflow: **${label}**`,
    "",
    "`X_API_FETCH_ENABLED=false` のため X API へのリクエストは行いません。",
    "既存データ・state は変更しません。",
    "",
    "復旧時は `X_API_FETCH_ENABLED=true` を設定して workflow_dispatch から実行してください。",
    "",
  ];

  fs.appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}
