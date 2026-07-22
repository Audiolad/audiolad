import type { Metadata } from "next";

/** Default robots policy for authenticated and internal HTML pages. */
export const PRIVATE_PAGE_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
};
