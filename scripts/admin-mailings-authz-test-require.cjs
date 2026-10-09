const Module = require("module");
const orig = Module.prototype.require;
const calls = { load: 0, gates: 0 };
let user = null; // {id, roles:[], legacy:null}
class Redirect extends Error {}
const mocks = {
  "next/cache": { revalidatePath() {} },
  "next/navigation": {
    forbidden() { throw new Error("FORBIDDEN"); },
    notFound() { throw new Error("NOTFOUND"); },
    redirect() { throw new Error("REDIRECT"); },
  },
  "@/lib/supabase/server": {
    async createClient() {
      return {
        auth: { async getUser() { return { data: { user: user ? { id: user.id, email: "x@example.test" } : null } }; } },
        from() { const q = { select() { return q; }, eq() { return Promise.resolve({ data: (user?.roles ?? []).map((r) => ({ role_code: r })), error: null }); } }; return q; },
      };
    },
  },
  "@/lib/auth/platform-role-lookup": { async fetchUserPlatformRole() { return user?.legacy ?? null; } },
  "@/lib/admin/mailings/service": {
    async loadAuthorMailingCandidates() { calls.load++; return [
      { authorId: "a1", userId: "u1", email: "one@example.test", fullName: "Син Тетик", displayName: "S", isFixture: false, status: "active" },
    ]; },
    async loadDeliveryGates() { calls.gates++; return new Map(); },
    async launchSavedAuthorCampaign() {}, async saveAuthorMailingDraft() {}, async searchAuthorMailingCandidates() { return []; },
  },
};
Module.prototype.require = function (id) {
  if (id === "server-only") return {};
  if (mocks[id]) return mocks[id];
  return orig.apply(this, arguments);
};
global.__t = { setUser(u) { user = u; }, calls };
