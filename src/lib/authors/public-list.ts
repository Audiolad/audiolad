export function formatAuthorProductCount(count: number): string {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  let word = "продуктов";

  if (mod10 === 1 && mod100 !== 11) {
    word = "продукт";
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    word = "продукта";
  }

  return `${count} ${word}`;
}

export function formatAuthorPublishedCount(count: number): string {
  if (count === 1) {
    return "1 опубликованный продукт";
  }

  if (count >= 2 && count <= 4) {
    return `${count} опубликованных продукта`;
  }

  return `${count} опубликованных продуктов`;
}

export type PublicAuthorSort = "products" | "name" | "newest";

export function sortPublicAuthors<T extends {
  name: string;
  publishedCount: number;
  createdAt: string | null;
}>(
  authors: T[],
  sort: PublicAuthorSort = "products",
): T[] {
  const sorted = [...authors];

  sorted.sort((left, right) => {
    if (sort === "name") {
      return left.name.localeCompare(right.name, "ru");
    }

    if (sort === "newest") {
      const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
      const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;

      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return left.name.localeCompare(right.name, "ru");
    }

    if (right.publishedCount !== left.publishedCount) {
      return right.publishedCount - left.publishedCount;
    }

    return left.name.localeCompare(right.name, "ru");
  });

  return sorted;
}

export const PUBLIC_AUTHORS_SORT_LABELS: Record<PublicAuthorSort, string> = {
  products: "По количеству продуктов",
  name: "По имени",
  newest: "Сначала новые",
};
