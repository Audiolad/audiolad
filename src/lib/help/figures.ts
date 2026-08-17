import { existsSync } from "node:fs";
import path from "node:path";

import type { HelpArticle, HelpArticleFigure } from "@/lib/help/types";
import { getHelpStepFigure, isHelpStepRecord } from "@/lib/help/types";

/** Return the public src only when the file exists under /public. */
export function resolveHelpFigureSrc(src: string | undefined): string | undefined {
  if (!src?.trim()) return undefined;

  const trimmed = src.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return undefined;

  const relative = trimmed.slice(1);
  if (!relative || relative.includes("\0") || relative.includes("\\")) {
    return undefined;
  }

  const normalized = path.posix.normalize(relative);
  if (normalized.startsWith("..") || normalized.split("/").includes("..")) {
    return undefined;
  }

  const filePath = path.join(process.cwd(), "public", ...normalized.split("/"));
  if (!existsSync(filePath)) return undefined;

  return `/${normalized}`;
}

export function resolveHelpFigure(figure: HelpArticleFigure): HelpArticleFigure {
  return {
    ...figure,
    src: resolveHelpFigureSrc(figure.src),
  };
}

export function resolveHelpArticleFigures(article: HelpArticle): HelpArticle {
  return {
    ...article,
    sections: article.sections.map((section) => ({
      ...section,
      figures: section.figures?.map(resolveHelpFigure),
      steps: section.steps?.map((step) => {
        if (!isHelpStepRecord(step)) return step;
        const figure = getHelpStepFigure(step);
        if (!figure) return step;
        return {
          ...step,
          figure: resolveHelpFigure(figure),
        };
      }),
    })),
  };
}
