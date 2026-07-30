#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canCreateOwnedAuthorProject,
  getAuthorProjectLimitReachedMessage,
  resolveEffectiveAuthorProjectLimit,
  shouldShowPremiumProjectUpsell,
} from "../src/lib/author-projects/limits.ts";
import {
  buildAuthorProjectCookie,
  readAuthorProjectCookieValue,
  resolveSelectedAuthorWorkspace,
} from "../src/lib/author-projects/selection.ts";
import {
  slugifyAuthorProjectName,
  validateAuthorProjectName,
  validateAuthorProjectSlug,
} from "../src/lib/author-projects/slug.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

const projects = [
  { id: "1", name: "Сергей Петров", slug: "sergey-petrov", role: "owner", accessStatus: "free" },
  { id: "2", name: "Зоя Петрова", slug: "zoya-petrova", role: "owner", accessStatus: "free" },
  { id: "3", name: "Сергей и Зоя", slug: "sergey-and-zoya", role: "owner", accessStatus: "free" },
];

function main() {
  // 1. Base account limit = 1
  const basic = resolveEffectiveAuthorProjectLimit({
    override: null,
    premiumEnabled: false,
  });
  assert.equal(basic.limit, 1);
  assert.equal(basic.source, "default");
  assert.equal(canCreateOwnedAuthorProject(1, 1), false);

  // 2. Second project blocked at limit 1
  assert.equal(
    shouldShowPremiumProjectUpsell({ used: 1, limit: 1, source: "default" }),
    true,
  );
  assert.match(
    getAuthorProjectLimitReachedMessage({ used: 1, limit: 1, source: "default" }),
    /базовом кабинете/,
  );

  // 3. Premium allows 3
  const premium = resolveEffectiveAuthorProjectLimit({
    override: null,
    premiumEnabled: true,
  });
  assert.equal(premium.limit, 3);
  assert.equal(canCreateOwnedAuthorProject(2, 3), true);
  assert.equal(canCreateOwnedAuthorProject(3, 3), false);

  // 4. Individual override 5
  const override = resolveEffectiveAuthorProjectLimit({
    override: 5,
    premiumEnabled: false,
  });
  assert.equal(override.limit, 5);
  assert.equal(override.source, "override");

  // 5. Sergey's three projects count toward limit
  const sergeyUsed = projects.filter((p) => p.role === "owner").length;
  assert.equal(sergeyUsed, 3);
  assert.equal(canCreateOwnedAuthorProject(sergeyUsed, 5), true);
  assert.equal(
    shouldShowPremiumProjectUpsell({
      used: sergeyUsed,
      limit: 5,
      source: "override",
    }),
    false,
  );

  // 6. Selection isolation + cookie
  const selected = resolveSelectedAuthorWorkspace(projects, {
    querySlug: "zoya-petrova",
    cookieSlug: "sergey-petrov",
  });
  assert.equal(selected?.slug, "zoya-petrova");

  const fromCookie = resolveSelectedAuthorWorkspace(projects, {
    querySlug: null,
    cookieSlug: "sergey-and-zoya",
  });
  assert.equal(fromCookie?.slug, "sergey-and-zoya");

  const cookie = buildAuthorProjectCookie("aurafon");
  assert.match(cookie, /audiolad_author_project=aurafon/);
  assert.equal(
    readAuthorProjectCookieValue(`a=1; ${cookie}; b=2`),
    "aurafon",
  );

  // Slug helpers
  assert.equal(slugifyAuthorProjectName("Аурафон"), "aurafon");
  assert.equal(validateAuthorProjectName("А"), "Название проекта: от 2 до 80 символов.");
  assert.equal(validateAuthorProjectSlug("Bad Slug"), "Slug может содержать только латинские буквы, цифры и дефисы.");

  // Source files / migration contracts
  const migration = read(
    "supabase/migrations/20260730120000_author_multi_project_limits.sql",
  );
  assert.match(migration, /create_author_project/);
  assert.match(migration, /author_project_limit_override/);
  assert.match(migration, /e5d273d0-9b4d-4e0e-836a-bdcf0332b9bb/);
  assert.match(migration, /author_project_limit_override = 5/);
  assert.match(migration, /protect_profiles_author_project_limit_columns/);
  assert.match(migration, /pg_advisory_xact_lock/);

  const route = read("src/app/api/author/projects/route.ts");
  assert.match(route, /createAuthorProjectViaRpc/);
  assert.match(route, /getAuthorProjectsSummary/);
  assert.doesNotMatch(route, /createServiceRole|SERVICE_ROLE/);

  const productsRoute = read("src/app/api/author/products/route.ts");
  assert.match(productsRoute, /requireAuthorMutationMembership\(authorId\)/);

  const nav = read("src/components/author-dashboard/AuthorDashboardNav.tsx");
  assert.match(nav, /AuthorProjectSwitcher/);

  const switcher = read(
    "src/components/author-dashboard/AuthorProjectSwitcher.tsx",
  );
  assert.match(switcher, /Текущий проект/);
  assert.match(switcher, /Создать проект/);
  assert.match(switcher, /Лимит проектов/);

  const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
  assert.match(form, /Продукт будет опубликован от проекта/);

  const createPage = read("src/app/author-dashboard/projects/new/page.tsx");
  assert.match(createPage, /AuthorCreateProjectForm/);

  // Sale-lock still present
  const saleLock = read("src/lib/author-products/sale-lock.ts");
  assert.match(saleLock, /PRODUCT_CONTENT_LOCKED_AFTER_SALE|sale.?lock/i);

  // Music + practice product kinds still present
  const productKind = read("src/lib/author-products/product-kind.ts");
  assert.match(productKind, /MUSIC/);
  assert.match(productKind, /PRACTICE/);

  console.log("author-multi-project-unit: ok");
}

main();
