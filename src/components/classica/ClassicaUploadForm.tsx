"use client";

import { useActionState } from "react";

import { classicaIdleState } from "@/lib/classica/production/action-state";
import { uploadClassicaAssetAction } from "@/lib/classica/production/actions";

type ClassicaUploadFormProps = {
  jobId: string;
  kind: "source_file" | "source_render" | "final_audio" | "cover" | "slider";
  label: string;
  accept: string;
  showText?: boolean;
};

export default function ClassicaUploadForm({
  jobId,
  kind,
  label,
  accept,
  showText = false,
}: ClassicaUploadFormProps) {
  const [state, action] = useActionState(uploadClassicaAssetAction, classicaIdleState);

  return (
    <form action={action} className="rounded-2xl border border-[#e4d7f4] bg-white p-4">
      <h3 className="text-sm font-semibold">{label}</h3>
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="kind" value={kind} />
      <input
        className="mt-3 block w-full text-sm"
        type="file"
        name="file"
        accept={accept}
        required
      />
      {showText ? (
        <div className="mt-3 grid gap-2">
          <input
            className="rounded-xl border border-[#e4d7f4] px-3 py-2 text-sm"
            name="alt_text"
            placeholder="Alt"
          />
          <input
            className="rounded-xl border border-[#e4d7f4] px-3 py-2 text-sm"
            name="title_text"
            placeholder="Title"
          />
        </div>
      ) : null}
      <button
        type="submit"
        className="mt-3 rounded-xl bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
      >
        Загрузить
      </button>
      {state.error ? <p className="mt-2 text-sm text-[#9b2c4a]">{state.error}</p> : null}
    </form>
  );
}
