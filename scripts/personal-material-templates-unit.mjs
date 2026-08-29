#!/usr/bin/env node
/**
 * Static unit checks: personal material templates + author audio preview.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PERSONAL_MATERIAL_TEMPLATE_DISPLAY_ORDER,
  sortPersonalMaterialTemplatesForDisplay,
} from "../src/lib/personal-materials/template-display-order.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_TEMPLATE_DISPLAY_ORDER = [
  "Диагностика МАКС",
  "Диагностика Телеграм",
  "Диагностика ПДФ МАКС",
  "Диагностика ПДФ Телеграм",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testMigration() {
  const sql = read("supabase/migrations/20260721153000_personal_material_templates.sql");
  assert(sql.includes("CREATE TABLE IF NOT EXISTS public.personal_material_templates"), "table");
  assert(sql.includes("internal_name"), "internal_name");
  assert(sql.includes("return_button_label"), "return_button_label");
  assert(sql.includes("ENABLE ROW LEVEL SECURITY"), "rls");
  assert(sql.includes("author_members"), "membership auth");
  assert(!sql.includes("access_token"), "no access token on templates");
  assert(!sql.includes("guest_access"), "no guest access on templates");
  assert(!sql.includes("REFERENCES public.personal_materials"), "no cascade to materials");
}

function testTemplateApi() {
  const list = read("src/app/api/author/personal-material-templates/route.ts");
  const item = read("src/app/api/author/personal-material-templates/[id]/route.ts");
  const dup = read(
    "src/app/api/author/personal-material-templates/[id]/duplicate/route.ts",
  );
  const inst = read(
    "src/app/api/author/personal-material-templates/[id]/instantiate/route.ts",
  );
  const server = read("src/lib/personal-materials/server/templates.ts");

  assert(list.includes("requireAuthorMaterialListAccess"), "list auth");
  assert(item.includes("requireAuthorMaterialListAccess"), "item auth");
  assert(dup.includes("requireAuthorMaterialListAccess"), "duplicate auth");
  assert(inst.includes("requireAuthorMaterialListAccess"), "instantiate auth");
  assert(inst.includes("createPersonalMaterialDraft"), "instantiate creates draft");
  assert(inst.includes("template.title"), "copies title");
  assert(inst.includes("template.description"), "copies description");
  assert(inst.includes("template.personal_recommendation"), "copies recommendation");
  assert(inst.includes("template.return_url"), "copies return url");
  assert(inst.includes("template.return_button_label"), "copies button label");
  assert(inst.includes("clientFirstName: null"), "empty first name from template");
  assert(inst.includes("clientLastName: null"), "no last name copy");
  assert(!inst.includes('"Клиент"'), "no technical Клиент placeholder");
  assert(!inst.includes("audio"), "instantiate does not touch audio");
  assert(!inst.includes("access_token"), "instantiate no token");
  assert(server.includes("parseTemplateBody"), "parse body");
  assert(server.includes("toSafePersonalMaterialTemplateDto"), "safe dto");
  assert(
    server.includes("sortPersonalMaterialTemplatesForDisplay"),
    "list applies stable display order",
  );
}

function testAuthorPlayer() {
  const audioRoute = read("src/app/api/author/personal-materials/[id]/audio/route.ts");
  const delivery = read("src/lib/personal-materials/server/delivery.ts");
  const player = read(
    "src/components/personal-materials/guest/PersonalMaterialAudioPlayer.tsx",
  );
  const editor = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsEditorClient.tsx",
  );

  assert(audioRoute.includes("export async function GET"), "author audio GET");
  assert(audioRoute.includes("createAuthorAudioSignedUrl"), "author signed url");
  assert(audioRoute.includes("requirePersonalMaterialAccess"), "author ownership");
  assert(delivery.includes("createAuthorAudioSignedUrl"), "delivery helper");
  assert(
    delivery.includes("Author preview: signed URL without guest_access requirement"),
    "no guest_access gate",
  );
  assert(player.includes('progressMode?: "local" | "server" | "none"'), "progressMode none");
  assert(player.includes("PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2]"), "five speeds");
  assert(editor.includes("PersonalMaterialAudioPlayer"), "editor embeds player");
  assert(editor.includes('progressMode="none"'), "author preview mode");
  assert(editor.includes("key={`${material.id}:"), "remount on audio replace");
  assert(editor.includes("Аудиофайл ещё не загружен"), "empty audio message");
}

function testUiWiring() {
  const list = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsClient.tsx",
  );
  const create = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsCreateClient.tsx",
  );
  const panel = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsTemplatesPanel.tsx",
  );
  const templateEditor = read(
    "src/components/author-dashboard/personal-materials/AuthorDiagnosticsTemplateEditorClient.tsx",
  );
  const newPage = read(
    "src/app/(platform)/author-dashboard/diagnostics/templates/new/page.tsx",
  );
  const editPage = read(
    "src/app/(platform)/author-dashboard/diagnostics/templates/[id]/page.tsx",
  );

  assert(list.includes("Шаблоны"), "templates tab");
  assert(list.includes("AuthorDiagnosticsTemplatesPanel"), "templates panel");
  assert(create.includes("Создать с нуля"), "create blank");
  assert(create.includes("Создать из шаблона"), "create from template");
  assert(create.includes("instantiateAuthorPersonalMaterialTemplate"), "create instantiate");
  assert(create.includes("value={template.id}"), "dropdown option keeps template id");
  assert(create.includes("{template.internalName}"), "dropdown label keeps existing title");
  assert(
    create.includes("instantiateAuthorPersonalMaterialTemplate(selectedTemplateId)"),
    "instantiate still uses selected id",
  );
  assert(panel.includes("Создать из шаблона"), "panel primary action");
  assert(panel.includes("Дублировать"), "panel duplicate");
  assert(panel.includes("Удалить"), "panel delete");
  assert(templateEditor.includes("Сохранить шаблон"), "save template");
  assert(templateEditor.includes("Создать материал из шаблона"), "instantiate from editor");
  assert(!templateEditor.includes("clientFirstName"), "template form no client name");
  assert(!templateEditor.includes("Активировать"), "template form no activate");
  assert(newPage.includes("AuthorDiagnosticsTemplateEditorClient"), "new template page");
  assert(editPage.includes("getPersonalMaterialTemplateById"), "edit loads template");
}

function testTemplateDisplayOrder() {
  const actualOrder = [...PERSONAL_MATERIAL_TEMPLATE_DISPLAY_ORDER];
  assert(
    actualOrder.length === REQUIRED_TEMPLATE_DISPLAY_ORDER.length &&
      actualOrder.every((title, index) => title === REQUIRED_TEMPLATE_DISPLAY_ORDER[index]),
    "display-order constant matches required titles",
  );

  const shuffled = [
    { id: "d", internalName: "Диагностика ПДФ Телеграм" },
    { id: "b", internal_name: "Диагностика Телеграм" },
    { id: "c", internalName: "Диагностика ПДФ МАКС" },
    { id: "a", internal_name: "Диагностика МАКС" },
  ];
  const sortedKnown = sortPersonalMaterialTemplatesForDisplay(shuffled);

  assert(
    sortedKnown.map((item) => item.internalName ?? item.internal_name).join("|") ===
      REQUIRED_TEMPLATE_DISPLAY_ORDER.join("|"),
    "known titles sort to required order regardless of updated_at/id",
  );
  assert(
    sortedKnown.map((item) => item.id).join("|") === "a|b|c|d",
    "known-title sort keeps original template ids",
  );

  const mixed = [
    { id: "z", internalName: "Якорь" },
    { id: "m2", internalName: "Другой шаблон" },
    { id: "tg", internalName: "Диагностика Телеграм" },
    { id: "m1", internalName: "Другой шаблон" },
    { id: "max", internalName: "Диагностика МАКС" },
    { id: "pdf-tg", internalName: "Диагностика ПДФ Телеграм" },
    { id: "pdf-max", internalName: "Диагностика ПДФ МАКС" },
    { id: "a-extra", internalName: "Альфа" },
  ];
  const sortedMixed = sortPersonalMaterialTemplatesForDisplay(mixed);

  assert(
    sortedMixed.map((item) => item.id).join("|") ===
      "max|tg|pdf-max|pdf-tg|a-extra|m1|m2|z",
    "known titles first; remaining titles localeCompare then id",
  );

  const reversed = sortPersonalMaterialTemplatesForDisplay([...mixed].reverse());
  assert(
    reversed.map((item) => item.id).join("|") ===
      sortedMixed.map((item) => item.id).join("|"),
    "display order is stable for the same set",
  );

  const helper = read("src/lib/personal-materials/template-display-order.ts");
  assert(
    !helper.includes("created_at") && !helper.includes("updated_at"),
    "display order is not created_at/updated_at",
  );
}

function main() {
  testMigration();
  testTemplateApi();
  testAuthorPlayer();
  testUiWiring();
  testTemplateDisplayOrder();
  console.log("personal-material-templates-unit: PASS");
}

main();
