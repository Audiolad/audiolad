"use client";

import {
  PUBLICATION_MODE,
  authorPublicationScheduleLine,
  type PublicationMode,
} from "@/lib/products/scheduled-publication";

type AuthorPublicationScheduleSectionProps = {
  publicationMode: PublicationMode;
  publishDate: string;
  publishTime: string;
  status: string;
  moderationStatus: string;
  scheduledPublishAt: string | null;
  publishedAt: string | null;
  disabled: boolean;
  onChange: (patch: {
    publicationMode?: PublicationMode;
    publishDate?: string;
    publishTime?: string;
  }) => void;
};

export default function AuthorPublicationScheduleSection({
  publicationMode,
  publishDate,
  publishTime,
  status,
  moderationStatus,
  scheduledPublishAt,
  publishedAt,
  disabled,
  onChange,
}: AuthorPublicationScheduleSectionProps) {
  const statusLine = authorPublicationScheduleLine({
    status,
    moderationStatus,
    scheduledPublishAt,
    publishedAt,
  });

  return (
    <fieldset className="block">
      <legend className="mb-2 block text-sm font-medium">Публикация</legend>
      <div className="grid gap-3">
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 ${
            publicationMode === PUBLICATION_MODE.AFTER_APPROVAL
              ? "border-[#9a74d8] bg-[#f8f4ff]"
              : "border-[#e4d7f4] bg-white"
          }`}
        >
          <input
            type="radio"
            name="publication_mode"
            className="mt-1"
            checked={publicationMode === PUBLICATION_MODE.AFTER_APPROVAL}
            disabled={disabled}
            onChange={() =>
              onChange({ publicationMode: PUBLICATION_MODE.AFTER_APPROVAL })
            }
          />
          <span className="block text-sm font-medium text-[#3f3560]">
            После одобрения модератором
          </span>
        </label>
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 ${
            publicationMode === PUBLICATION_MODE.SCHEDULED
              ? "border-[#9a74d8] bg-[#f8f4ff]"
              : "border-[#e4d7f4] bg-white"
          }`}
        >
          <input
            type="radio"
            name="publication_mode"
            className="mt-1"
            checked={publicationMode === PUBLICATION_MODE.SCHEDULED}
            disabled={disabled}
            onChange={() =>
              onChange({ publicationMode: PUBLICATION_MODE.SCHEDULED })
            }
          />
          <span className="block text-sm font-medium text-[#3f3560]">
            По расписанию
          </span>
        </label>
      </div>
      {publicationMode === PUBLICATION_MODE.SCHEDULED ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-[#3f3560]">
            Дата публикации
            <input
              type="date"
              value={publishDate}
              disabled={disabled}
              onChange={(event) => onChange({ publishDate: event.target.value })}
              className="mt-1 w-full rounded-[16px] border border-[#e4d7f4] px-3 py-2"
            />
          </label>
          <label className="block text-sm text-[#3f3560]">
            Время
            <input
              type="time"
              value={publishTime}
              disabled={disabled}
              onChange={(event) => onChange({ publishTime: event.target.value })}
              className="mt-1 w-full rounded-[16px] border border-[#e4d7f4] px-3 py-2"
            />
          </label>
          <p className="sm:col-span-2 text-sm leading-5 text-[#7d70a2]">
            Дата и время публикации — по московскому времени (МСК).
          </p>
          <p className="sm:col-span-2 text-sm leading-5 text-[#7d70a2]">
            Московское время (МСК)
          </p>
        </div>
      ) : null}
      {statusLine ? (
        <p className="mt-3 text-sm font-medium text-[#3f3560]">{statusLine}</p>
      ) : null}
    </fieldset>
  );
}
