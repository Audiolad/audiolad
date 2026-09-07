import { buildCourseLearnerFileViewerPath } from "@/lib/course-content/learner-file-http";
import type { LearnerCourseFileBlock } from "@/lib/course-content/learner-types";

type CourseLearnerFileDownloadProps = {
  block: LearnerCourseFileBlock;
  authorSlug: string;
  productSlug: string;
};

export default function CourseLearnerFileDownload({
  block,
  authorSlug,
  productSlug,
}: CourseLearnerFileDownloadProps) {
  const href = buildCourseLearnerFileViewerPath(
    authorSlug,
    productSlug,
    block.fileId,
  );

  return (
    <div className="min-w-0 max-w-full">
      <a
        href={href}
        className="inline-flex min-h-11 w-full max-w-full min-w-0 items-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
      >
        <span className="min-w-0 break-all [overflow-wrap:anywhere]">
          {block.filename}
        </span>
      </a>
    </div>
  );
}
