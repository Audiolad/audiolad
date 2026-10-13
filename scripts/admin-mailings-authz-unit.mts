import assert from "node:assert/strict";

// Real actions.ts + guard.ts; only supabase client, next/navigation and data loaders are mocked
// (see admin-mailings-authz-test-require.cjs). Synthetic data only.
type AuthzHarness = {
  setUser(user: { id: string; roles: string[] } | null): void;
  calls: { load: number; gates: number };
};
const t = (globalThis as unknown as { __t: AuthzHarness }).__t;
const { listMailingRecipientsAction, previewMailingRecipientsAction } = await import("../src/app/(platform)/admin/mailings/actions");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const payload: any = { subject:"s", preheader:"", messageType:"author_marketing", filter:{kind:"all_authors"}, content:{heading:"h",paragraphs:["p"],cta:null,secondaryLink:null,infoBlock:null}, senderIdentity:"authors" };
async function run(label:string, user: { id: string; roles: string[] } | null, expect:"ok"|"deny") {
  t.setUser(user); t.calls.load=0; t.calls.gates=0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let res: any, err: any;
  try { res = await listMailingRecipientsAction(payload); } catch(e){ err=e; }
  if (expect==="deny") { assert.ok(err, label+": must throw"); assert.equal(t.calls.load,0,label+": data loaded before guard"); assert.equal(t.calls.gates,0); console.log("ok deny:",label,err.message); }
  else { assert.ok(!err, label+": "+err?.message); assert.equal(t.calls.load,1); console.log("ok allow:",label, JSON.stringify({ok:res.ok,code:res.code,n:res.entries?.length})); }
}
await run("anonymous", null, "deny");
await run("plain user/author (no platform role)", {id:"u9", roles:[]}, "deny");
await run("support", {id:"u2", roles:["support"]}, "deny");
await run("admin (no mailings perm)", {id:"u3", roles:["admin"]}, "deny");
await run("analyst", {id:"u4", roles:["analyst"]}, "deny");
await run("owner", {id:"u5", roles:["owner"]}, "ok");
// preview parity
t.setUser(null); await assert.rejects(()=>previewMailingRecipientsAction(payload));
console.log("authz-review: ok");
