import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { MAX_HOSTNAME, MAX_ORIGIN, MAX_PRODUCT_PATH } from "../src/lib/max/host.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POST, setGetMaxPublishedProductForTests, setResolveMaxNativeUserForTests } from "../src/app/api/max/product/route.ts";

const token = "test-max-bot-token-not-real-0001";
function init(extra = {}) {
  const fields = { auth_date: String(Math.floor(Date.now()/1000)), user: '{"id":101}', ...extra };
  const data = Object.entries(fields).sort(([a],[b]) => a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
  const key = createHmac("sha256","WebAppData").update(token).digest();
  const hash = createHmac("sha256",key).update(data).digest("hex");
  return Object.entries(fields).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join("&")+`&hash=${hash}`;
}
function request(body, headers={}) {
  return new Request(`${MAX_ORIGIN}${MAX_PRODUCT_PATH}`, { method:"POST", headers:{host:MAX_HOSTNAME,origin:MAX_ORIGIN,"sec-fetch-site":"same-origin","content-type":"application/json",...headers}, body:typeof body==="string"?body:JSON.stringify(body) });
}
const productSource = readFileSync(join(process.cwd(), "src/lib/max/product.ts"), "utf8");
assert.match(productSource, /loadPublicPracticeTopicsSafe/);
assert.match(productSource, /loadPublicPracticeSeoContent/);
assert.match(productSource, /mapCuratedMaxRecommendations/);
assert.match(productSource, /isPublicPracticeAppreciationVisible/);
assert.match(productSource, /getPracticeRatingAggregate/);
assert.match(productSource, /MAX_AUTHOR_RECOMMENDATIONS_LIMIT = MAX_AUTHOR_RECOMMENDATIONS/);
assert.doesNotMatch(productSource, /description:\s*product\.description/);
assert.doesNotMatch(
  productSource.slice(productSource.indexOf("const recommendations = mapCuratedMaxRecommendations")),
  /authorSlug === normalizedAuthor/,
);
const recommendationSource = readFileSync(join(process.cwd(), "src/lib/max/product-recommendations.ts"), "utf8");
assert.match(recommendationSource, /practiceId === input\.currentPracticeId/);
assert.match(recommendationSource, /limitPublicRelatedProducts/);
assert.doesNotMatch(recommendationSource, /href|normalizedAuthor|other products by author/);

process.env.MAX_BOT_TOKEN=token;
let native=0, lookup=0;
setResolveMaxNativeUserForTests(async (provider,id)=>{ native++; assert.equal(provider,MAX_EXTERNAL_IDENTITY_PROVIDER); assert.equal(id,"101"); return {ok:true,userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"};});
setGetMaxPublishedProductForTests(async (author,slug)=>{lookup++; return {ok:true,product:{authorSlug:author,productSlug:slug,title:"T",subtitle:null,authorName:"A",formatLabel:"Практика",coverUrl:null,priceLabel:"Бесплатно",isFree:true,statsLabel:null,topics:[{key:"sleep",title:"Сон"}],contents:[{title:"Трек",position:1,durationSeconds:65}],recommendations:[{authorSlug:author,slug:"other",title:"Другой",subtitle:null,authorName:"A",formatLabel:"Практика",coverUrl:null,priceLabel:"490 ₽",isFree:false}]}};});
try {
  let r=await POST(request({initData:init(),authorSlug:"author",productSlug:"product",user_id:"x",max_user_id:"y",maxAuthenticated:true}));
  assert.equal(r.status,200); const ok=await r.json(); assert.equal(ok.product.contents[0].id,undefined); assert.equal(ok.product.description,undefined); assert.deepEqual(ok.product.topics,[{key:"sleep",title:"Сон"}]); assert.equal(ok.product.recommendations.length,1); assert.equal(r.headers.get("cache-control"),"no-store");
  const before=lookup; r=await POST(request({initData:init().replace(/hash=.*/,"hash=ff"),authorSlug:"a",productSlug:"p"})); assert.equal(r.status,401); assert.equal(lookup,before);
  for (const body of ["null","[]",'"x"',"1","{"]) { r=await POST(request(body)); assert.equal(r.status,400); }
  setResolveMaxNativeUserForTests(async()=>({ok:true,userId:null})); r=await POST(request({initData:init(),authorSlug:"a",productSlug:"p"})); assert.equal(r.status,403);
  setResolveMaxNativeUserForTests(async()=>({ok:false,reason:"storage_unavailable"})); r=await POST(request({initData:init(),authorSlug:"a",productSlug:"p"})); assert.equal(r.status,503);
  setResolveMaxNativeUserForTests(async()=>({ok:true,userId:"u"})); setGetMaxPublishedProductForTests(async()=>({ok:true,product:null})); r=await POST(request({initData:init(),authorSlug:"a",productSlug:"p"})); assert.equal(r.status,404);
} finally { setResolveMaxNativeUserForTests(null); setGetMaxPublishedProductForTests(null); }
console.log("max-product-route-unit: ok");
