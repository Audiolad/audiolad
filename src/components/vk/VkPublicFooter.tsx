"use client";

import {
  getVkDiscoveryFooterLinks,
  getVkLegalFooterLinks,
  openVkGuestExternalUrl,
  VK_PUBLIC_CONTACT_EMAIL,
  type VkFooterLink,
} from "@/lib/vk/guest-links";

function FooterLink({ item }: { item: VkFooterLink }) {
  return (
    <button
      type="button"
      onClick={() => {
        openVkGuestExternalUrl(item.url);
      }}
      className="inline-flex min-h-11 w-full items-center text-left text-[15px] text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
    >
      {item.title}
    </button>
  );
}

export default function VkPublicFooter({ variant }: { variant: "profile" | "product" }) {
  const discovery = variant === "profile" ? getVkDiscoveryFooterLinks() : [];
  const legal = getVkLegalFooterLinks();

  return (
    <footer
      className={
        variant === "profile"
          ? "mt-6 border-t border-[#eadff8] pt-4"
          : "mt-8 border-t border-[#eadff8] pb-2 pt-6"
      }
      aria-label={
        variant === "profile"
          ? "О платформе, правовая информация и контакты"
          : "Правовая информация и контакты"
      }
      {...(variant === "profile"
        ? { "data-vk-profile-legal": "" }
        : { "data-vk-product-legal": "" })}
    >
      <p className="text-lg font-semibold text-[#6234b5]">АудиоЛад</p>
      {discovery.length ? (
        <nav aria-label="Разделы платформы" className="mt-3">
          <ul className="flex flex-col">
            {discovery.map((item) => (
              <li key={item.href}>
                <FooterLink item={item} />
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <nav aria-label="Юридическая информация" className="mt-3">
        <ul className="grid gap-1 text-[15px]">
          {legal.map((item) => (
            <li key={item.href}>
              <FooterLink item={item} />
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-5">
        <p className="text-sm font-medium text-[#7d70a2]">Контакт для связи</p>
        <p className="mt-2 text-[15px] text-[#7042c5]">{VK_PUBLIC_CONTACT_EMAIL}</p>
      </div>
    </footer>
  );
}
