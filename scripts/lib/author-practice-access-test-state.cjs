const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const AUTHOR_USER_ID = "33333333-3333-4333-8333-333333333333";
const ACTING_AUTHOR_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_AUTHOR_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_USER_ID = "66666666-6666-4666-8666-666666666666";
const PRACTICE_ID = "77777777-7777-4777-8777-777777777777";

const state = {
  userId: AUTHOR_USER_ID,
  execution: null,
  practices: {},
  realMemberships: [],
  actingMembership: null,
  authorAccessStatus: "free",
  membershipLookups: [],
};

function resetState(overrides = {}) {
  state.userId = AUTHOR_USER_ID;
  state.execution = null;
  state.practices = {};
  state.realMemberships = [];
  state.actingMembership = null;
  state.authorAccessStatus = "free";
  state.membershipLookups = [];
  Object.assign(state, overrides);
}

function createPractice(overrides = {}) {
  return {
    id: PRACTICE_ID,
    author_id: ACTING_AUTHOR_ID,
    status: "draft",
    moderation_status: "not_submitted",
    deleted_at: null,
    slug: "test-product",
    published_at: null,
    use_shared_cover: true,
    product_kind: "practice",
    publication_class: "practice",
    music_usage_permission: null,
    promo_enabled: false,
    promo_title: null,
    promo_text: null,
    promo_button_text: null,
    promo_url: null,
    promo_open_in_new_tab: null,
    is_catalog_listed: true,
    catalog_visibility: "public",
    ...overrides,
  };
}

function createSupportExecution(overrides = {}) {
  return {
    realUserId: OWNER_ID,
    actingUserId: AUTHOR_USER_ID,
    actingAuthorId: ACTING_AUTHOR_ID,
    isSupportMode: true,
    membershipRole: "owner",
    accessStatus: "free",
    sessionId: "sess-1",
    actingDisplayName: "Автор",
    actingAuthorName: "Пространство",
    actingAuthorSlug: "prostranstvo",
    canBypassProductModeration: false,
    ...overrides,
  };
}

function createActingMembership(overrides = {}) {
  return {
    role: "owner",
    accessStatus: "free",
    authorName: "Пространство",
    authorSlug: "prostranstvo",
    canBypassProductModeration: false,
    actingDisplayName: "Автор",
    ...overrides,
  };
}

function createQueryClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: state.userId ? { id: state.userId } : null },
        error: null,
      }),
    },
    from(table) {
      const filters = {};
      const chain = {
        select() {
          return chain;
        },
        eq(column, value) {
          filters[column] = value;
          return chain;
        },
        maybeSingle: async () => {
          if (table === "practices") {
            const practice = state.practices[filters.id] ?? null;
            return { data: practice, error: null };
          }

          if (table === "author_members") {
            state.membershipLookups.push({
              authorId: filters.author_id,
              userId: filters.user_id,
            });
            const membership = state.realMemberships.find(
              (row) =>
                row.authorId === filters.author_id &&
                row.userId === filters.user_id,
            );
            return {
              data: membership ? { role: membership.role } : null,
              error: null,
            };
          }

          if (table === "authors") {
            return {
              data: { access_status: state.authorAccessStatus },
              error: null,
            };
          }

          return { data: null, error: null };
        },
      };
      return chain;
    },
  };
}

module.exports = {
  OWNER_ID,
  AUTHOR_USER_ID,
  ACTING_AUTHOR_ID,
  OTHER_AUTHOR_ID,
  OTHER_USER_ID,
  PRACTICE_ID,
  state,
  resetState,
  createPractice,
  createSupportExecution,
  createActingMembership,
  createQueryClient,
};
