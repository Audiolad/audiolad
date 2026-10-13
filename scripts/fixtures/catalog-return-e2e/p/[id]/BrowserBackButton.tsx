"use client";

import { useRouter } from "next/navigation";

export default function BrowserBackButton() {
  const router = useRouter();
  return (
    <button data-testid="router-back" type="button" onClick={() => router.back()} className="ml-4 text-sm">
      ← Назад (router.back)
    </button>
  );
}
