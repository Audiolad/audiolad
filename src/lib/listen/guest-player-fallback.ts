export type GuestPlayerFallbackTarget = {
  authorSlug: string;
  productSlug: string;
};

export const GUEST_PLAYER_FALLBACK_REGISTERED_EVENT =
  "audiolad:guest-player-fallback-registered";

type GuestProductLike = {
  authorSlug: string | null;
  slug: string;
};

let registeredTarget: GuestPlayerFallbackTarget | null = null;

function targetsEqual(
  left: GuestPlayerFallbackTarget | null,
  right: GuestPlayerFallbackTarget | null,
): boolean {
  return (
    left?.authorSlug === right?.authorSlug &&
    left?.productSlug === right?.productSlug
  );
}

export function registerGuestPlayerFallbackTarget(
  target: GuestPlayerFallbackTarget | null,
): void {
  const changed = !targetsEqual(registeredTarget, target);
  registeredTarget = target;

  if (
    target &&
    changed &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(
      new CustomEvent(GUEST_PLAYER_FALLBACK_REGISTERED_EVENT, {
        detail: target,
      }),
    );
  }
}

export function peekGuestPlayerFallbackTarget(): GuestPlayerFallbackTarget | null {
  return registeredTarget;
}

export function pickGuestDefaultListenTarget(input: {
  featuredFreeProduct: GuestProductLike | null;
  freeProducts: GuestProductLike[];
}): GuestPlayerFallbackTarget | null {
  const candidates = [input.featuredFreeProduct, ...input.freeProducts];

  for (const product of candidates) {
    if (!product) {
      continue;
    }

    const authorSlug = product.authorSlug?.trim();
    const productSlug = product.slug?.trim();

    if (authorSlug && productSlug) {
      return { authorSlug, productSlug };
    }
  }

  return null;
}
