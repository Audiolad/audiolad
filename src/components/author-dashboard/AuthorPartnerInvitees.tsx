import {
  describePartnerInvitee,
  PARTNER_INVITEES_EMPTY,
  PARTNER_INVITEES_LOAD_ERROR,
  type PartnerInviteeView,
} from "@/lib/author-partner/invitees";

type Props = {
  invitees: PartnerInviteeView[];
  loadError?: string | null;
};

export default function AuthorPartnerInvitees({ invitees, loadError }: Props) {
  return (
    <section className="rounded-[24px] border border-[#eadff8] bg-white px-4 py-5 sm:px-5">
      <h3 className="text-[17px] font-semibold text-[#2b2144]">
        Приглашённые авторы
      </h3>
      <p className="mt-1 text-sm text-[#7d70a2]">
        Люди, чьё приглашение уже зафиксировано. Это может быть новый слушатель или тот, кто уже был в АудиоЛаде.
      </p>

      {loadError ? (
        <p className="mt-4 rounded-[16px] border border-[#f3c6c6] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b2c2c]">
          {loadError || PARTNER_INVITEES_LOAD_ERROR}
        </p>
      ) : invitees.length === 0 ? (
        <p className="mt-4 rounded-[16px] border border-[#eadff8] bg-[#faf6ff] px-4 py-4 text-sm text-[#4a3f6b]">
          {PARTNER_INVITEES_EMPTY}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {invitees.map((item, index) => {
            const card = describePartnerInvitee(item);
            return (
              <li
                key={`${item.state}-${index}`}
                className="rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[15px] font-semibold text-[#2b2144]">
                    {card.title}
                  </p>
                  {card.badge ? (
                    <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#7042c5]">
                      {card.badge}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-[#4a3f6b]">
                  {card.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
