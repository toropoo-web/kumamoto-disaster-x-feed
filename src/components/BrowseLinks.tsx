import Link from "next/link";
import { ALL_CATEGORIES, CATEGORY_LABELS, REGION_OPTIONS } from "@/types/post";

export function RegionLinks() {
  return (
    <section>
      <h2 className="section-title">地域から探す</h2>
      <div className="chip-list">
        {REGION_OPTIONS.map((region) => (
          <Link
            key={region}
            href={`/regions/${encodeURIComponent(region)}`}
            className="chip"
          >
            {region}
          </Link>
        ))}
      </div>
    </section>
  );
}

export function CategoryLinks() {
  return (
    <section>
      <h2 className="section-title">情報種別から探す</h2>
      <div className="chip-list">
        {ALL_CATEGORIES.map((category) => (
          <Link
            key={category}
            href={`/categories/${category}`}
            className="chip"
          >
            {CATEGORY_LABELS[category]}
          </Link>
        ))}
      </div>
    </section>
  );
}
