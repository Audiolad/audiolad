/** Shared VK Ads adapter. No user, order, venue IDs or arbitrary payloads accepted. */
export const VK_ADS_GOALS = Object.freeze([
  'atlas_home', 'atlas_page', 'go_to_music', 'go_to_funnel', 'go_to_cabinet',
  'gift_interest', 'gift_started', 'subscription_active', 'payment_success',
]);

/** @param {string | undefined} value */
export function vkPixelId(value) {
  return value && /^[1-9][0-9]{0,15}$/.test(value) ? value : null;
}

const VK_EXCLUDED_ROUTE = /^\/(?:documents|point|player|coffee-handoff)(?:\/|$)/;
const VK_BUSINESS_HOSTS = new Set(['coffee.audiolad.ru', 'business.audiolad.ru']);

/** @param {string} pathname */
function vkPublicPath(pathname) {
  const path = pathname.replace(/\/$/, '') || '/';
  return path.replace(/^\/business-app(?=\/|$)/, '') || '/';
}

/**
 * Business screens that must never run with the VK SDK in the document. The SDK has no unload
 * API, so entering one by SPA navigation after it loaded requires a full reload (see VkAdsPixel).
 * @param {string} hostname @param {string} pathname
 */
export function vkBusinessReloadRoute(hostname, pathname) {
  const isBusiness = VK_BUSINESS_HOSTS.has(hostname) || /^\/business-app(?:\/|$)/.test(pathname);
  return isBusiness && VK_EXCLUDED_ROUTE.test(vkPublicPath(pathname));
}

/** @param {string} hostname @param {string} pathname */
export function vkRoute(hostname, pathname) {
  const path = pathname.replace(/\/$/, '') || '/';
  const publicPath = vkPublicPath(pathname);
  if (VK_EXCLUDED_ROUTE.test(publicPath)) return null;
  if (hostname === 'audiolad.ru' || hostname === 'www.audiolad.ru') {
    if (path === '/') return { group: 'home', path };
    if (path === '/b/atlas-kofeen') return { group: 'atlas_home', path };
    if (/^\/b\/atlas-kofeen\/[a-z0-9-]+$/.test(path)) return { group: 'atlas_page', path };
    if (/^\/b\/coffee(?:\/[a-z0-9-]+)?$/.test(path)) return { group: 'coffee_seo', path };
    if (/^\/(?:articles|listen)\/[a-z0-9/-]+$/.test(path)) return { group: 'seo', path };
  }
  if (hostname === 'coffee.audiolad.ru' || hostname === 'business.audiolad.ru') {
    if (['/', '/cabinet', '/guest/coffee', '/music', '/workspace'].includes(publicPath)) {
      return { group: publicPath === '/music' || publicPath === '/guest/coffee' ? 'coffee_music' : 'coffee_cabinet', path: publicPath };
    }
  }
  return null;
}

/** Only known destinations; queries (including attribution) never enter the payload.
 * @param {string} href @param {string} origin
 */
export function vkDestinationGoal(href, origin) {
  let url;
  try { url = new URL(href, origin); } catch { return null; }
  if (url.origin === 'https://max-potok.ru' && url.pathname === '/r/gqwvf') return 'go_to_funnel';
  const route = vkRoute(url.hostname, url.pathname);
  if (route?.group === 'coffee_music') return 'go_to_music';
  if (route?.group === 'coffee_cabinet') return 'go_to_cabinet';
  return null;
}

/** Factory keeps tests offline and consent rechecked at every dispatch.
 * @param {{pixelId: string | null, allowed: () => boolean, win: Window & typeof globalThis, doc: Document}} options
 */
export function createVkAdsTracker({ pixelId, allowed, win, doc }) {
  let lastPage = '';
  const observed = new Set();
  function enabled() { return Boolean(pixelId && allowed() && vkRoute(win.location.hostname, win.location.pathname)); }
  /** @param {Record<string, unknown>} event */
  function push(event) {
    if (!enabled()) return false;
    // The SDK replaces the queue with its own push-capable object.
    const browser = /** @type {Window & typeof globalThis & {_tmr?: {push: (event: unknown) => unknown}}} */ (win);
    if (!browser._tmr) browser._tmr = [];
    browser._tmr.push({ id: pixelId, ...event });
    return true;
  }
  /** @param {string} goal */
  function goal(goal) {
    return VK_ADS_GOALS.includes(goal) && push({ type: 'reachGoal', goal });
  }
  return {
    goal,
    page() {
      if (!enabled()) { lastPage = ''; return; }
      const route = vkRoute(win.location.hostname, win.location.pathname);
      if (!route) return;
      const key = `${win.location.origin}${route.path}`;
      if (key === lastPage) return;
      // No vendor base snippet: this is the sole initial AND SPA pageView producer.
      if (!push({ type: 'pageView', url: key, referrer: '', params: { route_group: route.group } })) return;
      lastPage = key;
      if (route.group === 'atlas_home' || route.group === 'atlas_page') goal(route.group);
      if (!doc.getElementById('audiolad-vk-ads') && !doc.querySelector('script[src="https://top-fwz1.mail.ru/js/code.js"]')) {
        const script = doc.createElement('script');
        script.id = 'audiolad-vk-ads';
        script.async = true;
        script.src = 'https://top-fwz1.mail.ru/js/code.js';
        script.referrerPolicy = 'no-referrer';
        doc.head.appendChild(script);
      }
    },
    /** Observed access, not payment confirmation or a newly issued gift.
     * @param {string} mode
     */
    access(mode) {
      const event = mode === 'trial' ? 'gift_started' : mode === 'paid' ? 'subscription_active' : null;
      if (event && !observed.has(event) && goal(event)) observed.add(event);
    },
  };
}

/** @param {Document} doc */
export function vkSdkInDocument(doc) {
  return Boolean(doc.getElementById('audiolad-vk-ads') || doc.querySelector('script[src="https://top-fwz1.mail.ru/js/code.js"]'));
}
