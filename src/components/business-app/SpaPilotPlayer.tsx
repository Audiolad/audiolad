"use client";

import { parseSpaManifest, type SpaManifest } from "@/lib/business-app/spa-manifest";

type Props = { programId: string; programName: string; initialManifest: unknown; canLog: boolean };

function safeParse(raw: unknown): SpaManifest | null {
  try {
    return raw ? parseSpaManifest(raw) : null;
  } catch {
    return null;
  }
}

/** PR page: read-only program view. The player replaces this component in the next PR. */
export default function SpaPilotPlayer({ programName, initialManifest }: Props) {
  const manifest = safeParse(initialManifest);
  return (
    <section className="spa-pilot" data-testid="spa-pilot">
      <h1>{programName}</h1>
      <p className="spa-pilot__note">Пилот: страница видна только участникам пилота.</p>
      {!manifest || manifest.items.length === 0 ? (
        <p data-testid="spa-empty">В программе пока нет треков, разрешённых для Business.</p>
      ) : (
        <ol data-testid="spa-tracks">
          {manifest.items.map((i) => (
            <li key={i.audioItemId}>{i.title}</li>
          ))}
        </ol>
      )}
    </section>
  );
}
