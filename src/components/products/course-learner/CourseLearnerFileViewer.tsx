import {
  COURSE_LEARNER_FILE_VIEWER_BACK_LABEL,
  buildCourseLearnerFilePath,
  buildCourseLearnerFileReturnHref,
} from "@/lib/course-content/learner-file-http";

export type CourseLearnerFileViewerProps = {
  authorSlug: string;
  productSlug: string;
  fileId: string;
  filename: string;
  embedSrc: string;
};

export function CourseLearnerFileViewerDenied({
  authorSlug,
  productSlug,
  message,
}: {
  authorSlug: string;
  productSlug: string;
  message: string;
}) {
  const returnHref = buildCourseLearnerFileReturnHref(authorSlug, productSlug);

  return (
    <section
      data-course-learner-file-viewer="denied"
      className="mx-auto min-w-0 max-w-3xl pb-8 pt-6"
    >
      <CourseLearnerFileViewerBack href={returnHref} />
      <div className="mt-8 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-8 text-center">
        <h1 className="text-[22px] font-semibold text-[#25135c]">
          Документ недоступен
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#7d70a2]">{message}</p>
      </div>
    </section>
  );
}

export default function CourseLearnerFileViewer({
  authorSlug,
  productSlug,
  fileId,
  filename,
  embedSrc,
}: CourseLearnerFileViewerProps) {
  const returnHref = buildCourseLearnerFileReturnHref(authorSlug, productSlug);

  return (
    <section
      data-course-learner-file-viewer="ready"
      data-file-id={fileId}
      className="mx-auto flex min-h-[70vh] min-w-0 max-w-5xl flex-col pb-8 pt-4"
    >
      <div className="sticky top-0 z-20 -mx-1 border-b border-[#eadff8] bg-[#f7f4fb]/95 px-1 py-3 backdrop-blur">
        <CourseLearnerFileViewerBack href={returnHref} />
        <h1 className="mt-3 min-w-0 break-all text-[18px] font-semibold leading-6 text-[#25135c] [overflow-wrap:anywhere]">
          {filename}
        </h1>
      </div>

      <div className="mt-4 min-h-0 min-w-0 flex-1 overflow-hidden rounded-[20px] border border-[#eadff8] bg-white">
        <iframe
          src={embedSrc}
          title={filename}
          className="h-[70vh] w-full border-0 bg-white"
        />
      </div>
    </section>
  );
}

function CourseLearnerFileViewerBack({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-11 items-center text-sm font-semibold text-[#7042c5]"
    >
      {COURSE_LEARNER_FILE_VIEWER_BACK_LABEL}
    </a>
  );
}

export function buildCourseLearnerFileViewerViewModel(input: {
  authorSlug: string;
  productSlug: string;
  fileId: string;
  filename: string;
}): CourseLearnerFileViewerProps {
  return {
    authorSlug: input.authorSlug,
    productSlug: input.productSlug,
    fileId: input.fileId,
    filename: input.filename,
    embedSrc: buildCourseLearnerFilePath(
      input.authorSlug,
      input.productSlug,
      input.fileId,
    ),
  };
}
