"use client";

import {
  getVkDiscoveryFooterLinks,
  getVkLegalFooterLinks,
  isVkPublicFooterUrl,
  VK_PUBLIC_CONTACT_EMAIL,
  type VkFooterLink,
} from "@/lib/vk/guest-links";
import { activateVkPublicFooterClick } from "@/lib/vk/public-anchor-click";

const linkClassName =
  "inline-flex min-h-11 w-full items-center text-left text-[15px] text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

function FooterLink({ item }: { item: VkFooterLink }) {
  if (!isVkPublicFooterUrl(item.url)) return null;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      data-vk-public-footer-link=""
      style={{ touchAction: "manipulation" }}
      className={linkClassName}
      onClick={(event) => {
        activateVkPublicFooterClick(event, item.url);
      }}
    >
      {item.title}
    </a>
  );
}

export function VkPublicFooter({
  variant,
}: {
  variant: "profile" | "product" | "home";
}) {
  const discovery = variant === "product" ? [] : getVkDiscoveryFooterLinks();
  const legal = getVkLegalFooterLinks();

  return (
    <footer
      className={
        variant === "profile"
          ? "mt-6 border-t border-[#eadff8] pt-4"
          : variant === "home"
            ? "mt-8 border-t border-[#eadff8] pb-4 pt-6"
            : "mt-8 border-t border-[#eadff8] pb-2 pt-6"
      }
      aria-label={
        variant === "product"
          ? "Правовая информация и контакты"
          : "О платформе, правовая информация и контакты"
      }
      {...(variant === "profile"
        ? { "data-vk-profile-legal": "" }
        : variant === "product"
          ? { "data-vk-product-legal": "" }
          : { "data-vk-home-legal": "" })}
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
        <a
          href={`mailto:${VK_PUBLIC_CONTACT_EMAIL}`}
          className="mt-2 inline-flex min-h-11 items-center text-[15px] text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {VK_PUBLIC_CONTACT_EMAIL}
        </a>
      </div>
    </footer>
  );
}

export default VkPublicFooter;
