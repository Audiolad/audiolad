"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import type { PublicCatalogSection } from "@/lib/catalog/catalog-sections";
import type {
  CatalogAccessFilter,
  CatalogClassFilter,
} from "@/lib/catalog/listing-contract";
import { CATALOG_SEARCH_MAX_LENGTH, normalizeCatalogSearchQuery } from "@/lib/catalog/search";
import { serializeCatalogTopicParam } from "@/lib/catalog/topic-filter";
import { readMaxInitData } from "@/lib/max/bridge";
import { MAX_CATALOG_PATH } from "@/lib/max/host";
import MaxCatalogSections from "@/components/max/MaxCatalogSections";
import MaxCatalogTopicsSheet from "@/components/max/MaxCatalogTopicsSheet";

/** Matches ordinary catalog URL debounce without importing catalog routing. */
const MAX_CATALOG_SEARCH_DEBOUNCE_MS = 300;

export type MaxCatalogProduct = {
  authorSlug: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  authorName: string | null;
  formatLabel: string;
  priceLabel: string;
  isFree: boolean;
};

type DefaultCatalogState =
  | { status: "loading" }
  | { status: "ready"; items: MaxCatalogProduct[] }
  | { status: "error" };

type SectionListingState =
  | { status: "idle" }
  | { status: "loading"; section: PublicCatalogSection }
  | { status: "ready"; section: PublicCatalogSection; items: MaxCatalogProduct[] }
  | { status: "error"; section: PublicCatalogSection };

type FilterListingState =
  | { status: "idle" }
  | {
      status: "loading";
      section: PublicCatalogSection | null;
      topic: string | null;
      access: CatalogAccessFilter;
      publicationClass: CatalogClassFilter;
    }
  | {
      status: "ready";
      section: PublicCatalogSection | null;
      topic: string | null;
      access: CatalogAccessFilter;
      publicationClass: CatalogClassFilter;
      items: MaxCatalogProduct[];
    }
  | {
      status: "error";
      section: PublicCatalogSection | null;
      topic: string | null;
      access: CatalogAccessFilter;
      publicationClass: CatalogClassFilter;
    };

type SearchStatus = "idle" | "searching" | "ready" | "error";

export type MaxCatalogTopicNavigationRequest = {
  key: string;
  requestId: number;
};

type MaxCatalogSearchProps = {
  onSelectProduct: (product: MaxCatalogProduct) => void;
  topicNavigationRequest?: MaxCatalogTopicNavigationRequest | null;
};

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function readCatalogPayload(payload: unknown): MaxCatalogProduct[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return null;
  }

  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const product = item as Partial<MaxCatalogProduct>;
    if (
      typeof product.slug !== "string" ||
      typeof product.authorSlug !== "string" ||
      typeof product.title !== "string" ||
      typeof product.formatLabel !== "string" ||
      typeof product.priceLabel !== "string" ||
      typeof product.isFree !== "boolean"
    ) {
      return [];
    }

    return [
      {
        authorSlug: product.authorSlug,
        slug: product.slug,
        title: product.title,
        subtitle: typeof product.subtitle === "string" ? product.subtitle : null,
        coverUrl: typeof product.coverUrl === "string" ? product.coverUrl : null,
        authorName:
          typeof product.authorName === "string" ? product.authorName : null,
        formatLabel: product.formatLabel,
        priceLabel: product.priceLabel,
        isFree: product.isFree,
      },
    ];
  });
}

function hasActiveCatalogFilters(
  topicParam: string | null,
  access: CatalogAccessFilter,
  publicationClass: CatalogClassFilter,
): boolean {
  return Boolean(topicParam) || access !== "all" || publicationClass !== "all";
}

function buildMaxCatalogRequestBody(input: {
  initData: string;
  query?: string;
  section?: PublicCatalogSection | null;
  topicParam?: string | null;
  access?: CatalogAccessFilter;
  publicationClass?: CatalogClassFilter;
}): string {
  const body: {
    initData: string;
    query?: string;
    section?: PublicCatalogSection;
    topic?: string;
    access?: CatalogAccessFilter;
    class?: CatalogClassFilter;
  } = { initData: input.initData };

  if (input.query) body.query = input.query;
  if (input.section) body.section = input.section;
  if (input.topicParam) body.topic = input.topicParam;
  if (input.access && input.access !== "all") body.access = input.access;
  if (input.publicationClass && input.publicationClass !== "all") {
    body.class = input.publicationClass;
  }

  return JSON.stringify(body);
}

export default function MaxCatalogSearch({
  onSelectProduct,
  topicNavigationRequest = null,
}: MaxCatalogSearchProps) {
  const inputId = useId();
  const [defaultCatalog, setDefaultCatalog] = useState<DefaultCatalogState>(() =>
    readMaxInitData() ? { status: "loading" } : { status: "error" },
  );
  const [activeSection, setActiveSection] = useState<PublicCatalogSection | null>(null);
  const [sectionListing, setSectionListing] = useState<SectionListingState>({
    status: "idle",
  });
  const [searchInput, setSearchInput] = useState("");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchItems, setSearchItems] = useState<MaxCatalogProduct[] | null>(null);
  const [resultQuery, setResultQuery] = useState("");
  const [resultSection, setResultSection] = useState<PublicCatalogSection | null>(null);
  const [resultTopic, setResultTopic] = useState<string | null>(null);
  const [resultAccess, setResultAccess] = useState<CatalogAccessFilter>("all");
  const [resultClass, setResultClass] = useState<CatalogClassFilter>("all");
  const [activeTopicKeys, setActiveTopicKeys] = useState<string[]>([]);
  const [activeAccess, setActiveAccess] = useState<CatalogAccessFilter>("all");
  const [activeClass, setActiveClass] = useState<CatalogClassFilter>("all");
  const [filterListing, setFilterListing] = useState<FilterListingState>({ status: "idle" });
  const searchInputRef = useRef("");
  const activeSectionRef = useRef<PublicCatalogSection | null>(null);
  const activeTopicParamRef = useRef<string | null>(null);
  const activeAccessRef = useRef<CatalogAccessFilter>("all");
  const activeClassRef = useRef<CatalogClassFilter>("all");
  const defaultCatalogRef = useRef(defaultCatalog);
  const sectionCacheRef = useRef(new Map<PublicCatalogSection, MaxCatalogProduct[]>());
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef(0);

  function cancelPendingSearch() {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    requestGenerationRef.current += 1;
  }

  function restoreDefaultCatalog() {
    cancelPendingSearch();
    setResultQuery("");
    setResultSection(null);
    setResultTopic(null);
    setResultAccess("all");
    setResultClass("all");
    setSearchStatus("idle");
    setSearchItems(null);
  }

  function beginSearch(
    normalized: string,
    section: PublicCatalogSection | null = activeSectionRef.current,
    topicParam: string | null = activeTopicParamRef.current,
    access: CatalogAccessFilter = activeAccessRef.current,
    publicationClass: CatalogClassFilter = activeClassRef.current,
  ) {
    const requestId = ++requestGenerationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearchStatus("searching");

    void (async () => {
      try {
        const initData = readMaxInitData();
        if (!initData) {
          if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
            return;
          }
          setSearchStatus("error");
          return;
        }

        const response = await fetch(MAX_CATALOG_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: buildMaxCatalogRequestBody({
            initData,
            query: normalized,
            section,
            topicParam,
            access,
            publicationClass,
          }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }
        const items = response.ok ? readCatalogPayload(payload) : null;
        if (!items) {
          setSearchStatus("error");
          return;
        }
        setSearchItems(items);
        setResultQuery(normalized);
        setResultSection(section);
        setResultTopic(topicParam);
        setResultAccess(access);
        setResultClass(publicationClass);
        setSearchStatus("ready");
      } catch {
        if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }
        setSearchStatus("error");
      }
    })();
  }

  function scheduleSearch(rawQuery: string) {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const normalized = normalizeCatalogSearchQuery(rawQuery);
    if (!normalized) {
      const section = activeSectionRef.current;
      const topicParam = activeTopicParamRef.current;
      const access = activeAccessRef.current;
      const publicationClass = activeClassRef.current;
      if (hasActiveCatalogFilters(topicParam, access, publicationClass)) {
        loadFilteredCatalog(section, topicParam, access, publicationClass);
        return;
      }
      if (section && !sectionCacheRef.current.has(section)) {
        loadSectionCatalog(section);
        return;
      }
      if (!section && defaultCatalogRef.current.status !== "ready") {
        loadRootCatalog();
        return;
      }
      restoreDefaultCatalog();
      if (section) {
        const cached = sectionCacheRef.current.get(section);
        if (cached) {
          setSectionListing({ status: "ready", section, items: cached });
        }
      }
      return;
    }

    abortRef.current?.abort();
    abortRef.current = null;
    requestGenerationRef.current += 1;
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      beginSearch(normalized);
    }, MAX_CATALOG_SEARCH_DEBOUNCE_MS);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const normalized = normalizeCatalogSearchQuery(searchInputRef.current);
    if (!normalized) {
      const section = activeSectionRef.current;
      const topicParam = activeTopicParamRef.current;
      const access = activeAccessRef.current;
      const publicationClass = activeClassRef.current;
      if (hasActiveCatalogFilters(topicParam, access, publicationClass)) {
        loadFilteredCatalog(section, topicParam, access, publicationClass);
        return;
      }
      if (section && !sectionCacheRef.current.has(section)) {
        loadSectionCatalog(section);
        return;
      }
      if (!section && defaultCatalogRef.current.status !== "ready") {
        loadRootCatalog();
        return;
      }
      restoreDefaultCatalog();
      if (section) {
        const cached = sectionCacheRef.current.get(section);
        if (cached) {
          setSectionListing({ status: "ready", section, items: cached });
        }
      }
      return;
    }

    beginSearch(normalized);
  }

  function clearSearch() {
    searchInputRef.current = "";
    setSearchInput("");
    const section = activeSectionRef.current;
    const topicParam = activeTopicParamRef.current;
    const access = activeAccessRef.current;
    const publicationClass = activeClassRef.current;
    if (hasActiveCatalogFilters(topicParam, access, publicationClass)) {
      loadFilteredCatalog(section, topicParam, access, publicationClass);
      return;
    }
    if (section && !sectionCacheRef.current.has(section)) {
      loadSectionCatalog(section);
      return;
    }
    restoreDefaultCatalog();
    if (section) {
      const cached = sectionCacheRef.current.get(section);
      if (cached) {
        setSectionListing({ status: "ready", section, items: cached });
      }
    }
  }

  function handleInputChange(nextValue: string) {
    searchInputRef.current = nextValue;
    setSearchInput(nextValue);
    scheduleSearch(nextValue);
  }

  function selectSection(section: PublicCatalogSection | null) {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    activeSectionRef.current = section;
    setActiveSection(section);

    const normalized = normalizeCatalogSearchQuery(searchInputRef.current);
    const topicParam = activeTopicParamRef.current;
    const access = activeAccessRef.current;
    const publicationClass = activeClassRef.current;
    if (normalized) {
      if (section) {
        const cached = sectionCacheRef.current.get(section);
        setSectionListing(
          cached
            ? { status: "ready", section, items: cached }
            : { status: "idle" },
        );
      }
      beginSearch(normalized, section, topicParam, access, publicationClass);
      return;
    }

    if (hasActiveCatalogFilters(topicParam, access, publicationClass)) {
      loadFilteredCatalog(section, topicParam, access, publicationClass);
      return;
    }

    if (section === null && defaultCatalogRef.current.status === "ready") {
      restoreDefaultCatalog();
      return;
    }

    if (section === null) {
      loadRootCatalog();
      return;
    }

    const cached = sectionCacheRef.current.get(section);
    if (cached) {
      cancelPendingSearch();
      setResultQuery("");
      setResultSection(null);
      setResultTopic(null);
      setResultAccess("all");
      setResultClass("all");
      setSearchStatus("idle");
      setSearchItems(null);
      setSectionListing({ status: "ready", section, items: cached });
      return;
    }

    loadSectionCatalog(section);
  }

  function loadRootCatalog() {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const requestId = ++requestGenerationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setResultQuery("");
    setResultSection(null);
    setResultTopic(null);
    setResultAccess("all");
    setResultClass("all");
    setSearchStatus("idle");
    setSearchItems(null);
    if (defaultCatalogRef.current.status !== "ready") {
      setDefaultCatalog({ status: "loading" });
    }

    void (async () => {
      try {
        const initData = readMaxInitData();
        if (!initData) {
          if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
            return;
          }
          setDefaultCatalog({ status: "error" });
          return;
        }

        const response = await fetch(MAX_CATALOG_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }
        const items = response.ok ? readCatalogPayload(payload) : null;
        setDefaultCatalog(items ? { status: "ready", items } : { status: "error" });
      } catch {
        if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }
        setDefaultCatalog({ status: "error" });
      }
    })();
  }

  function loadSectionCatalog(section: PublicCatalogSection) {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const requestId = ++requestGenerationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setResultQuery("");
    setResultSection(null);
    setResultTopic(null);
    setResultAccess("all");
    setResultClass("all");
    setSearchStatus("idle");
    setSearchItems(null);
    setSectionListing({ status: "loading", section });

    void (async () => {
      try {
        const initData = readMaxInitData();
        if (!initData) {
          if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
            return;
          }
          setSectionListing({ status: "error", section });
          return;
        }

        const response = await fetch(MAX_CATALOG_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData, section }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }
        const items = response.ok ? readCatalogPayload(payload) : null;
        if (!items) {
          setSectionListing({ status: "error", section });
          return;
        }
        sectionCacheRef.current.set(section, items);
        setSectionListing({ status: "ready", section, items });
      } catch {
        if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }
        setSectionListing({ status: "error", section });
      }
    })();
  }

  function loadFilteredCatalog(
    section: PublicCatalogSection | null,
    topicParam: string | null,
    access: CatalogAccessFilter,
    publicationClass: CatalogClassFilter,
  ) {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const requestId = ++requestGenerationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setResultQuery("");
    setResultSection(null);
    setResultTopic(null);
    setResultAccess("all");
    setResultClass("all");
    setSearchStatus("idle");
    setSearchItems(null);
    setFilterListing({
      status: "loading",
      section,
      topic: topicParam,
      access,
      publicationClass,
    });

    void (async () => {
      try {
        const initData = readMaxInitData();
        if (!initData) {
          if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
            return;
          }
          setFilterListing({
            status: "error",
            section,
            topic: topicParam,
            access,
            publicationClass,
          });
          return;
        }

        const response = await fetch(MAX_CATALOG_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: buildMaxCatalogRequestBody({
            initData,
            section,
            topicParam,
            access,
            publicationClass,
          }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }
        const items = response.ok ? readCatalogPayload(payload) : null;
        if (!items) {
          setFilterListing({
            status: "error",
            section,
            topic: topicParam,
            access,
            publicationClass,
          });
          return;
        }
        setFilterListing({
          status: "ready",
          section,
          topic: topicParam,
          access,
          publicationClass,
          items,
        });
      } catch {
        if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }
        setFilterListing({
          status: "error",
          section,
          topic: topicParam,
          access,
          publicationClass,
        });
      }
    })();
  }

  function reloadUnfilteredScope(section: PublicCatalogSection | null) {
    if (section && !sectionCacheRef.current.has(section)) {
      loadSectionCatalog(section);
      return;
    }
    if (!section && defaultCatalogRef.current.status !== "ready") {
      loadRootCatalog();
      return;
    }
    restoreDefaultCatalog();
    if (section) {
      const cached = sectionCacheRef.current.get(section);
      if (cached) {
        setSectionListing({ status: "ready", section, items: cached });
      }
    }
  }

  function applyFilters(
    keys: string[],
    access: CatalogAccessFilter,
    publicationClass: CatalogClassFilter,
  ) {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const topicParam = serializeCatalogTopicParam(keys);
    activeTopicParamRef.current = topicParam;
    activeAccessRef.current = access;
    activeClassRef.current = publicationClass;
    setActiveTopicKeys(keys);
    setActiveAccess(access);
    setActiveClass(publicationClass);
    const section = activeSectionRef.current;
    const normalized = normalizeCatalogSearchQuery(searchInputRef.current);
    if (normalized) {
      beginSearch(normalized, section, topicParam, access, publicationClass);
      return;
    }
    if (!hasActiveCatalogFilters(topicParam, access, publicationClass)) {
      reloadUnfilteredScope(section);
      return;
    }
    loadFilteredCatalog(section, topicParam, access, publicationClass);
  }

  function resetFilters() {
    applyFilters([], "all", "all");
  }

  useEffect(() => {
    const topicKey = topicNavigationRequest?.key.trim();
    if (!topicKey) return;

    setSearchInput("");
    searchInputRef.current = "";
    setActiveSection(null);
    activeSectionRef.current = null;
    applyFilters([topicKey], "all", "all");
  }, [topicNavigationRequest?.requestId]);

  useEffect(() => {
    defaultCatalogRef.current = defaultCatalog;
  }, [defaultCatalog]);

  useEffect(() => {
    activeTopicParamRef.current = serializeCatalogTopicParam(activeTopicKeys);
  }, [activeTopicKeys]);

  useEffect(() => {
    activeAccessRef.current = activeAccess;
  }, [activeAccess]);

  useEffect(() => {
    activeClassRef.current = activeClass;
  }, [activeClass]);

  useEffect(() => {
    const initData = readMaxInitData();
    if (!initData) {
      return;
    }

    const requestId = ++requestGenerationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const response = await fetch(MAX_CATALOG_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }
        const items = response.ok ? readCatalogPayload(payload) : null;
        setDefaultCatalog(items ? { status: "ready", items } : { status: "error" });
      } catch {
        if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }
        setDefaultCatalog({ status: "error" });
      }
    })();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      abortRef.current?.abort();
    };
  }, []);

  const normalizedInput = normalizeCatalogSearchQuery(searchInput);
  const activeTopicParam = serializeCatalogTopicParam(activeTopicKeys);
  const hasActiveFilters = hasActiveCatalogFilters(
    activeTopicParam,
    activeAccess,
    activeClass,
  );
  const usingSearchResults =
    searchItems !== null &&
    searchStatus !== "idle" &&
    resultSection === activeSection &&
    resultTopic === activeTopicParam &&
    resultAccess === activeAccess &&
    resultClass === activeClass;
  const rootOrSearchItems =
    usingSearchResults
      ? searchItems
      : defaultCatalog.status === "ready"
        ? defaultCatalog.items
        : [];
  const sectionScopeItems =
    sectionListing.status === "ready" && sectionListing.section === activeSection
      ? sectionListing.items
      : [];
  const filteredScopeItems =
    filterListing.status === "ready" &&
    filterListing.section === activeSection &&
    filterListing.topic === activeTopicParam &&
    filterListing.access === activeAccess &&
    filterListing.publicationClass === activeClass
      ? filterListing.items
      : [];
  const gridItems = hasActiveFilters
    ? usingSearchResults
      ? searchItems
      : filteredScopeItems
    : activeSection
      ? usingSearchResults
        ? searchItems
        : sectionScopeItems
      : rootOrSearchItems;
  const showSearchEmpty =
    usingSearchResults &&
    searchItems !== null &&
    searchItems.length === 0 &&
    resultQuery.length > 0;
  const showRootLoading =
    !hasActiveFilters &&
    !activeSection &&
    searchStatus === "idle" &&
    defaultCatalog.status === "loading";
  const showSectionLoading =
    !hasActiveFilters &&
    Boolean(activeSection) &&
    searchStatus === "idle" &&
    sectionListing.status === "loading" &&
    sectionListing.section === activeSection;
  const showFilterLoading =
    hasActiveFilters &&
    searchStatus === "idle" &&
    filterListing.status === "loading" &&
    filterListing.section === activeSection &&
    filterListing.topic === activeTopicParam &&
    filterListing.access === activeAccess &&
    filterListing.publicationClass === activeClass;
  const showRootError =
    !hasActiveFilters &&
    !activeSection &&
    searchStatus === "idle" &&
    defaultCatalog.status === "error";
  const showSectionError =
    !hasActiveFilters &&
    Boolean(activeSection) &&
    searchStatus === "idle" &&
    sectionListing.status === "error" &&
    sectionListing.section === activeSection;
  const showFilterError =
    hasActiveFilters &&
    searchStatus === "idle" &&
    filterListing.status === "error" &&
    filterListing.section === activeSection &&
    filterListing.topic === activeTopicParam &&
    filterListing.access === activeAccess &&
    filterListing.publicationClass === activeClass;
  const showRootEmpty =
    !hasActiveFilters &&
    !activeSection &&
    searchStatus === "idle" &&
    defaultCatalog.status === "ready" &&
    defaultCatalog.items.length === 0;
  const showSectionEmpty =
    !hasActiveFilters &&
    Boolean(activeSection) &&
    searchStatus === "idle" &&
    sectionListing.status === "ready" &&
    sectionListing.section === activeSection &&
    sectionListing.items.length === 0;
  const showFilterEmpty =
    hasActiveFilters &&
    searchStatus === "idle" &&
    filterListing.status === "ready" &&
    filterListing.section === activeSection &&
    filterListing.topic === activeTopicParam &&
    filterListing.access === activeAccess &&
    filterListing.publicationClass === activeClass &&
    filterListing.items.length === 0;

  return (
    <>
      <div
        data-max-catalog-search-row
        className="mt-4 flex items-start gap-2"
      >
        <form
          role="search"
          onSubmit={submitSearch}
          className="relative flex h-[52px] min-h-[52px] max-h-[56px] min-w-0 flex-1 items-center gap-2 rounded-[18px] border border-[#ded1f1] bg-white px-3 shadow-[0_2px_10px_rgba(90,60,145,0.04)] focus-within:border-[#dcc9f2] focus-within:shadow-[0_4px_14px_rgba(90,60,145,0.07)]"
        >
          <label htmlFor={inputId} className="sr-only">
            Поиск аудиопродуктов в каталоге
          </label>
          <button
            type="submit"
            tabIndex={-1}
            aria-hidden="true"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[#7042c5]"
          >
            <SearchIcon />
          </button>
          <input
            id={inputId}
            type="search"
            value={searchInput}
            onChange={(event) => handleInputChange(event.target.value)}
            placeholder="Поиск по каталогу"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={CATALOG_SEARCH_MAX_LENGTH}
            aria-label="Поиск аудиопродуктов в каталоге"
            className="min-w-0 flex-1 border-0 bg-transparent py-0 text-base leading-normal text-[#25135c] placeholder:text-[#9485b4] focus:outline-none"
          />
          {normalizedInput.length > 0 ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Очистить поиск"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-[#9485b4] transition hover:bg-[#faf6ff] hover:text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <ClearIcon />
            </button>
          ) : null}
        </form>
        <MaxCatalogTopicsSheet
          activeTopicKeys={activeTopicKeys}
          activeAccess={activeAccess}
          activeClass={activeClass}
          onApply={applyFilters}
          onReset={resetFilters}
        />
      </div>

      <MaxCatalogSections
        activeSection={activeSection}
        onSelectSection={selectSection}
      />

      {searchStatus === "searching" ? (
        <p className="mt-3 text-sm text-[#6c5d94]">Ищем…</p>
      ) : null}
      {searchStatus === "error" ? (
        <p className="mt-3 text-sm text-[#6c5d94]">Не удалось выполнить поиск.</p>
      ) : null}

      {showRootLoading || showSectionLoading || showFilterLoading ? (
        <p className="py-10 text-center text-sm text-[#6c5d94]">
          Загружаем каталог…
        </p>
      ) : null}
      {showRootError || showSectionError || showFilterError ? (
        <div className="mt-6 rounded-2xl border border-[#eadce7] bg-white px-5 py-6 text-center">
          <p className="text-sm font-medium text-[#5f3f9d]">
            Не удалось загрузить каталог
          </p>
          <p className="mt-2 text-sm leading-5 text-[#6c5d94]">
            Закройте и снова откройте АудиоЛад в MAX.
          </p>
        </div>
      ) : null}
      {showRootEmpty ? (
        <div className="mt-6 rounded-2xl border border-[#e8def5] bg-white px-5 py-6 text-center">
          <p className="text-sm font-medium text-[#5f3f9d]">
            В каталоге пока нет опубликованных аудиопродуктов.
          </p>
        </div>
      ) : null}
      {showSectionEmpty ? (
        <div className="mt-6 rounded-2xl border border-[#e8def5] bg-white px-5 py-6 text-center">
          <p className="text-sm font-medium text-[#5f3f9d]">
            В разделе пока нет аудиопродуктов.
          </p>
        </div>
      ) : null}
      {showFilterEmpty ? (
        <div className="mt-6 rounded-2xl border border-[#e8def5] bg-white px-5 py-6 text-center">
          <p className="text-sm font-medium text-[#5f3f9d]">
            По выбранным фильтрам пока нет аудиопродуктов.
          </p>
        </div>
      ) : null}

      {showSearchEmpty ? (
        <div className="mt-6 rounded-2xl border border-[#e8def5] bg-white px-5 py-6 text-center">
          <p className="text-sm font-medium text-[#5f3f9d]">
            По запросу „{resultQuery}“ ничего не найдено.
          </p>
          <button
            type="button"
            onClick={clearSearch}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-4 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Очистить поиск
          </button>
        </div>
      ) : null}

      {gridItems.length > 0 ? (
        <CatalogGrid items={gridItems} onSelectProduct={onSelectProduct} />
      ) : null}
    </>
  );
}

function CatalogGrid({
  items,
  onSelectProduct,
}: {
  items: MaxCatalogProduct[];
  onSelectProduct: (product: MaxCatalogProduct) => void;
}) {
  return (
    <ul className="mt-5 -mx-4 grid grid-cols-2 gap-[6px] px-[6px]">
      {items.map((product) => (
        <li key={`${product.authorSlug}/${product.slug}`} className="min-w-0">
          <button
            type="button"
            onClick={() => onSelectProduct(product)}
            className="flex w-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-white text-left shadow-[0_6px_16px_rgba(91,62,145,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            <div className="aspect-square w-full bg-[#ede6f8]">
              {product.coverUrl ? (
                <img
                  src={product.coverUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="px-2.5 pb-2.5 pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
                {product.formatLabel}
              </p>
              <p className="line-clamp-2 min-h-10 text-[14px] font-semibold leading-5 text-[#25135c]">
                {product.title}
              </p>
              <p className="mt-1 line-clamp-1 min-h-5 text-sm text-[#7d70a2]">
                {product.authorName || "\u00a0"}
              </p>
              {!product.isFree ? (
                <p className="mt-1 whitespace-nowrap text-xs font-semibold leading-4 text-[#7042c5]">
                  {product.priceLabel}
                </p>
              ) : null}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
