import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const howto = readFileSync("src/components/author-dashboard/business/SunoLinkHowTo.tsx", "utf8");
const form = readFileSync("src/components/author-dashboard/business/RightsholderVerificationForm.tsx", "utf8");

assert.match(howto, /Как взять ссылку на трек в Suno:/);
assert.match(howto, /<ol[^>]*list-decimal/);
for (const step of ["нажмите три точки справа от трека;", "выберите Share;", "нажмите Copy Link и вставьте ссылку сюда."]) {
  assert.ok(howto.includes(step), `missing step: ${step}`);
}
assert.match(howto, /Показать, где это/);
for (const img of ["suno-share-menu.webp", "suno-copy-link.webp"]) {
  assert.ok(howto.includes(`/images/help/${img}`), `missing image ref ${img}`);
  assert.ok(existsSync(`public/images/help/${img}`), `missing asset ${img}`);
}
const alts = [...howto.matchAll(/alt="([^"]+)"/g)].map((m) => m[1]);
assert.equal(alts.length, 2);
for (const alt of alts) assert.match(alt, /[А-Яа-яЁё]/, "alt must be Russian");
assert.match(form, /provider === "suno" \? <SunoLinkHowTo \/>/);
console.log("business-suno-link-howto-ui-unit: ok");

// 8d9cd0af (Sergey 16:27): intro copy — catalogue disclaimer wording.
{
  const { readFileSync } = await import('node:fs');
  const form = readFileSync(new URL('../src/components/author-dashboard/business/RightsholderVerificationForm.tsx', import.meta.url), 'utf8');
  if (!form.includes('Это не подтверждает права на весь каталог. При необходимости любой конкретный трек может быть проверен отдельно.')) throw new Error('new intro copy missing');
  if (form.includes('каждый трек проверяется отдельно')) throw new Error('old intro copy still present');
  console.log('business-suno-link-howto-ui-unit: intro copy ok');
}
