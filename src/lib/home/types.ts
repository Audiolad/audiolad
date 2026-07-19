import type { CatalogProduct } from "@/lib/products/catalog";

export type HomeProduct = CatalogProduct & {
  audioCount: number;
  listenHref: string | null;
};

export type HomeAuthor = {
  id: string;
  name: string;
  slug: string;
  positioningText: string | null;
  avatarUrl: string | null;
  publishedCount: number;
  href: string;
};

export type ContinueListeningItem = {
  product: HomeProduct;
  listenHref: string;
  isProgram: boolean;
  trackIndex: number;
  trackCount: number;
  currentTrackTitle: string | null;
  progressPercent: number;
  progressLabel: string;
  stepLabel: string | null;
};

export type ActiveProgramItem = {
  product: HomeProduct;
  listenHref: string;
  trackIndex: number;
  trackCount: number;
  progressPercent: number;
  stepLabel: string;
};

export type GuestHomeData = {
  featuredFreeProduct: HomeProduct | null;
  freeProducts: HomeProduct[];
  newProducts: HomeProduct[];
  programProducts: HomeProduct[];
  authors: HomeAuthor[];
};

export type PersonalHomeData = {
  greetingFirstName: string | null;
  continueListening: ContinueListeningItem | null;
  startSuggestions: HomeProduct[];
  forYouProducts: HomeProduct[];
  recentlyListened: HomeProduct[];
  activePrograms: ActiveProgramItem[];
  newProducts: HomeProduct[];
  authors: HomeAuthor[];
  showBecomeAuthorPromo: boolean;
};
