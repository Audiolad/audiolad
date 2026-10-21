import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRightsholderProposal as build,
  normalizeRightsholderName,
  rightsholderProposalKey,
  type RightsholderProposalInput,
} from "../src/lib/admin/business-rightsholder-proposal";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const holder = { id: "holder", display_name: "Семён Тестов", entity_type: "person", status: "active" };
const payout = { workspaceId: "source", workspaceName: "Ясень", name: "Имя из анкеты" };
const input: RightsholderProposalInput = {
  accountBinding: holder,
  verifiedPayoutNames: [payout],
  profileName: "Имя из профиля",
  activeRightsholders: [holder],
};
assert.equal(normalizeRightsholderName("  СЕМЁН \n Тестов  "), "семен тестов");
const declared = build({ ...input, declared: { name: "Заявлено автором", entityType: "organization" } });
assert.equal(declared.source, "declared");
assert.equal(declared.needsCheck, false);
assert.equal(declared.sourceLabel, "Указано автором в заявке");
assert.deepEqual(declared.selection, { kind: "new", displayName: "Заявлено автором", entityType: "organization" });
const self = build({ ...input, declared: { name: "  Семён Тестов  ", entityType: "person", isSelf: true } });
assert.equal(self.source, "declared", "declared wins over account binding, payout and profile");
assert.equal(self.sourceLabel, "Указано автором в заявке – сам автор – найден существующий правообладатель");
assert.deepEqual(self.selection, { kind: "existing", id: holder.id });
const other = build({ ...input, declared: { name: "Лейбл", entityType: "organization", isSelf: false } });
assert.equal(other.source, "declared");
assert.equal(other.sourceLabel, "Указано автором в заявке – другое лицо (лейбл, соавтор)");
assert.deepEqual(other.selection, { kind: "new", displayName: "Лейбл", entityType: "organization" });
assert.equal(other.needsCheck, false);
const coauthor = build({ ...input, declared: { name: "Соавтор", entityType: "person", isSelf: false } });
assert.equal(coauthor.sourceLabel, "Указано автором в заявке – другое лицо (лейбл, соавтор)");
assert.deepEqual(coauthor.selection, { kind: "new", displayName: "Соавтор", entityType: "person" });
assert.equal(build({ ...input, declared: null }).source, "account_binding");
assert.equal(build({ ...input, declared: { name: " ", entityType: "person", isSelf: true } }).source, "account_binding");
const whitespaceDeclaration = { name: "\t\n ", entityType: "person" as const, isSelf: true };
assert.deepEqual(build({ ...input, declared: whitespaceDeclaration }), build(input), "whitespace-only declaration falls back to account binding");
assert.deepEqual(build({ declared: whitespaceDeclaration, profileName: input.profileName }), build({ profileName: input.profileName }), "whitespace-only declaration falls back to profile");
assert.deepEqual(build({ declared: whitespaceDeclaration }), build({}), "whitespace-only declaration without fallback is missing");
assert.deepEqual(build(input).selection, { kind: "existing", id: holder.id });
assert.equal(build(input).source, "account_binding");
assert.equal(build(input).sourceLabel, "Уже привязан к аккаунту – не указано автором – проверьте");
assert.equal(build(input).needsCheck, true);
const fromPayout = build({ ...input, accountBinding: null });
assert.equal(fromPayout.source, "payout_profile");
assert.equal(fromPayout.name, payout.name);
assert.equal(fromPayout.needsCheck, true);
assert.deepEqual(fromPayout.selection, { kind: "new", displayName: payout.name, entityType: "person" });
// Without permission the loader passes no payout names at all.
const fromProfile = build({ profileName: input.profileName });
assert.equal(fromProfile.source, "profile");
assert.equal(fromProfile.name, input.profileName);
assert.equal(fromProfile.needsCheck, true);
for (const proposal of [fromPayout, fromProfile]) assert.ok(proposal.sourceLabel.includes("не указано автором"));
const match = build({ profileName: "  СЕМЕН  ТЕСТОВ ", activeRightsholders: [holder] });
assert.deepEqual(match.selection, { kind: "existing", id: holder.id });
assert.ok(match.sourceLabel.endsWith(" – найден существующий правообладатель"));
for (const source of [
  { declared: { name: "семен тестов", entityType: "person" as const } },
  { verifiedPayoutNames: [{ ...payout, name: "семен тестов" }] },
]) assert.deepEqual(build({ ...source, activeRightsholders: [holder] }).selection, { kind: "existing", id: holder.id });
assert.equal(build({ declared: { name: holder.display_name, entityType: "organization" }, activeRightsholders: [holder] }).selection.kind, "new");
assert.equal(build({ profileName: holder.display_name, activeRightsholders: [{ ...holder, status: "inactive" }] }).selection.kind, "new");
assert.equal(build({ ...input, accountBinding: { ...holder, status: "inactive" } }).source, "payout_profile");
const missing = build({ profileName: " \n ", verifiedPayoutNames: [{ ...payout, name: " " }] });
assert.deepEqual(missing.selection, { kind: "none" });
assert.equal(missing.name, null);
assert.equal(missing.entityType, null);
assert.equal(missing.source, null);
assert.equal(missing.needsCheck, true);
assert.equal(missing.sourceLabel, "Имя правообладателя не указано – выберите или введите вручную");
const payouts = [payout, { workspaceId: "other", workspaceName: "Альфа", name: "Другое имя" }];
const preferred = build({ verifiedPayoutNames: payouts, sourceWorkspaceId: "source" });
assert.equal(preferred.name, payout.name);
assert.deepEqual(preferred.warnings, ["В анкетах выплат аккаунта разные имена – проверьте"]);
assert.equal(build({ verifiedPayoutNames: payouts }).name, "Другое имя");
assert.equal(build({ verifiedPayoutNames: payouts, sourceWorkspaceId: "missing" }).name, "Другое имя");
assert.deepEqual(build({ verifiedPayoutNames: [{ ...payout, name: "Семён Тестов" }, { ...payout, workspaceId: "other", name: " СЕМЕН  ТЕСТОВ " }] }).warnings, []);
assert.deepEqual(payouts.map((p) => p.workspaceId), ["source", "other"], "input order is preserved");

const newPerson = build({ profileName: holder.display_name });
const existing = build(input);
assert.notEqual(rightsholderProposalKey(newPerson), rightsholderProposalKey(existing));
assert.notEqual(rightsholderProposalKey(newPerson), rightsholderProposalKey(build({ profileName: "Другое имя" })));
assert.notEqual(rightsholderProposalKey(newPerson), rightsholderProposalKey(build({ declared: { name: holder.display_name, entityType: "organization" } })));
assert.notEqual(rightsholderProposalKey(existing), rightsholderProposalKey(build({ accountBinding: { ...holder, id: "other" } })));
assert.notEqual(rightsholderProposalKey(existing), rightsholderProposalKey(build({ accountBinding: { ...holder, display_name: "Другое имя" } })));
assert.notEqual(rightsholderProposalKey(existing), rightsholderProposalKey(build({ accountBinding: { ...holder, entity_type: "organization" } })));
assert.notEqual(rightsholderProposalKey(missing), rightsholderProposalKey(newPerson));
assert.equal(rightsholderProposalKey(newPerson), rightsholderProposalKey(build({ profileName: holder.display_name })));

const loader = read("src/lib/admin/business-verification-applicant.ts");
const registry = loader.slice(loader.indexOf("async function loadAllActiveRightsholders("), loader.indexOf("async function loadAllOwnerMemberships("));
assert.match(registry, /const pageSize = 1000/);
assert.match(registry, /for \(let offset = 0; ; offset \+= pageSize\)/);
assert.match(registry, /service\.from\("music_rightsholders"\)/);
assert.match(registry, /\.select\("id, display_name, entity_type, status"\)/);
assert.match(registry, /\.eq\("status", "active"\)\.order\("id"\)\.range\(offset, offset \+ pageSize - 1\)/);
assert.match(registry, /if \(response\.error\) \{\s+console\.error\("admin_business_rightsholder_lookup_failed", \{ code: response\.error\.code \}\);\s+throw new Error\("admin_business_rightsholder_lookup_failed"\);/);
assert.match(registry, /rightsholders\.push\(\.\.\.page\)/);
assert.match(registry, /if \(page\.length < pageSize\) return rightsholders/);
assert.doesNotMatch(registry, /\.limit\(|\.message|\.details|\.hint/);
assert.match(loader, /const \[profiles, memberships, bindings, activeRightsholders\] = await Promise\.all\(/);
assert.match(loader, /loadAllActiveRightsholders\(service\),/);
assert.match(loader, /declared: c\.declared/);
assert.match(loader, /loadBusinessVerificationApplicants\(cases: BusinessApplicantCase\[\]\)/);
const page = read("src/app/(platform)/admin/business-verification/page.tsx");
assert.match(page, /import \{ rightsholderProposalKey \} from "@\/lib\/admin\/business-rightsholder-proposal"/);
assert.ok(page.includes('key={`${c.id}:${actions.join(",")}:${rightsholderProposalKey(applicant.proposal)}`}'));
assert.match(page, /sourceWorkspace: productById\.get\(c\.product_id\)\?\.author \?\? null,\s+\}\)\)\);/);
assert.match(page, /catch \{\s+return <p role="alert">Не удалось загрузить данные заявителей/);
const permissionCheck = loader.indexOf('if (snapshotHasPermission(session.access, "authors.payout_profiles.review"))');
assert.ok(permissionCheck > 0);
assert.ok(permissionCheck < loader.indexOf('service.from("author_payout_profiles")'));
assert.match(loader, /\.eq\("role", "owner"\)/);
assert.match(loader, /\.eq\("status", "verified"\)/);
assert.match(loader, /decryptPayoutProfilePersonName\(row\)/);
assert.doesNotMatch(loader, /getAdminPayoutProfileDetail|select\("\*"\)|last_name|first_name|middle_name/);
const service = read("src/lib/author-payout-profiles/service.ts");
const projection = service.slice(service.indexOf("export function decryptPayoutProfilePersonName("), service.indexOf("function encryptFields("));
assert.match(projection, /isAuthorPayoutRecipientType\(row.recipient_type\)/);
assert.match(projection, /decryptRowFields\(row\)/);
assert.match(projection, /\[fields.last_name, fields.first_name, fields.middle_name\]/);
assert.doesNotMatch(projection, /return fields|email|phone|inn|bank|account/);
const fields = read("src/app/(platform)/admin/business-verification/BusinessDecisionFields.tsx");
const props = fields.slice(fields.indexOf("export function BusinessDecisionFields"), fields.indexOf("  const [action"));
assert.doesNotMatch(props, /payout|encrypted|recipient|last_name|first_name|middle_name|email|phone|\binn\b|bank|account/i);
assert.match(fields, /useState\(initialBinding\)/);
assert.match(fields, /useState\(initialName\)/);
assert.match(fields, /useState<string>\(initialType\)/);
assert.match(fields, /const \[action, setAction\] = useState<string>\(""\)/);
assert.match(fields, /const \[confirmed, setConfirmed\] = useState\(false\)/);
assert.match(fields, /Предзаполнено: \{proposal.sourceLabel\}/);
assert.match(fields, /Изменено вручную/);
assert.match(fields, /options.push\(\{ id: selection.id/, "bound holder outside the 200-row list remains selectable");
const actions = read("src/app/(platform)/admin/business-verification/actions.ts");
assert.match(actions, /validateBusinessDecisionInput\(/);
assert.match(actions, /p_new_display_name: newDisplayName/);
assert.match(actions, /p_new_entity_type: newEntityType/);
assert.match(actions, /revalidatePath\(BUSINESS_VERIFICATION_ADMIN_PATH\)/);
for (const source of [loader, page, fields, projection, read("src/lib/admin/business-rightsholder-proposal.ts")]) assert.doesNotMatch(source, /\u2014/);
for (const proposal of [declared, fromPayout, fromProfile, preferred, missing]) assert.doesNotMatch(JSON.stringify(proposal), /\u2014/);
console.log("admin-business-rightsholder-proposal-unit: OK");
