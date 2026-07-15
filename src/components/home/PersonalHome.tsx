import type { PersonalHomeData } from "@/lib/home/types";

import ActiveProgramsSection from "./ActiveProgramsSection";
import ContinueListening from "./ContinueListening";
import DailyGreeting from "./DailyGreeting";
import ProductRail from "./ProductRail";

type PersonalHomeProps = {
  data: PersonalHomeData;
};

export default function PersonalHome({ data }: PersonalHomeProps) {
  return (
    <>
      <DailyGreeting
        title={data.greetingTitle}
        phrase={data.greetingPhrase}
      />

      <ContinueListening
        item={data.continueListening}
        startSuggestions={data.startSuggestions}
      />

      <ProductRail
        title="Для вас"
        products={data.forYouProducts}
        ariaLabel="Для вас"
        href="/catalog"
      />

      <ActiveProgramsSection programs={data.activePrograms} />

      <ProductRail
        title="Недавно слушали"
        products={data.recentlyListened}
        ariaLabel="Недавно слушали"
        href="/history"
        linkLabel="История"
      />

      <ProductRail
        title="Из вашей Аудиотеки"
        products={data.libraryProducts}
        ariaLabel="Из вашей Аудиотеки"
        href="/my-practices"
        linkLabel="Аудиотека"
      />

      <ProductRail
        title={data.timeOfDaySectionTitle}
        products={data.timeOfDayProducts}
        ariaLabel={data.timeOfDaySectionTitle}
        href="/catalog"
      />

      <ProductRail
        title="Новые материалы"
        products={data.newProducts}
        ariaLabel="Новые материалы"
        href="/catalog"
      />

      <ProductRail
        title="Бесплатные материалы"
        products={data.freeProducts}
        ariaLabel="Бесплатные материалы"
        href="/catalog"
      />
    </>
  );
}
