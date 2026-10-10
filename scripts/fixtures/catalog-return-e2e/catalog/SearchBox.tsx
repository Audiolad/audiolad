"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const p = new URLSearchParams(window.location.search);
        if (value) p.set("q", value);
        else p.delete("q");
        const s = p.toString();
        router.replace(s ? `/catalog?${s}` : "/catalog", { scroll: false });
      }}
    >
      <input data-testid="search" value={value} onChange={(e) => setValue(e.target.value)} className="border px-2" />
    </form>
  );
}
