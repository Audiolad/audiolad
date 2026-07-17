import type { HomeTopicItem } from "@/lib/home/topic-navigation";
import type { PersonalHomeData } from "@/lib/home/types";

import ActiveProgramsSection from "./ActiveProgramsSection";
import ContinueListening from "./ContinueListening";
import DailyGreeting from "./DailyGreeting";
import HomeSectionBoundary from "./HomeSectionBoundary";
import HomeTopicNavigation from "./HomeTopicNavigation";
import ProductRail from "./ProductRail";

type PersonalHomeProps = {
  data: PersonalHomeData;
  homeTopics: HomeTopicItem[];
};

export default function PersonalHome({ data, homeTopics }: PersonalHomeProps) {
  return (
    <>
      <HomeSectionBoundary section="personal_greeting">
        <DailyGreeting firstName={data.greetingFirstName} />
      </HomeSectionBoundary>

      <HomeSectionBoundary section="personal_continue_listening">
        <ContinueListening
          item={data.continueListening}
          startSuggestions={data.startSuggestions}
        />
      </HomeSectionBoundary>

      <HomeSectionBoundary section="personal_home_topics">
        <HomeTopicNavigation topics={homeTopics} />
      </HomeSectionBoundary>

      <HomeSectionBoundary section="personal_for_you">
        <ProductRail
          title="Для вас"
          products={data.forYouProducts}
          ariaLabel="Для вас"
          href="/catalog"
        />
      </HomeSectionBoundary>

      <HomeSectionBoundary section="personal_active_programs">
        <ActiveProgramsSection programs={data.activePrograms} />
      </HomeSectionBoundary>

      <HomeSectionBoundary section="personal_recently_listened">
        <ProductRail
          title="Недавно слушали"
          products={data.recentlyListened}
          ariaLabel="Недавно слушали"
          href="/history"
          linkLabel="История"
        />
      </HomeSectionBoundary>

      <HomeSectionBoundary section="personal_library">
        <ProductRail
          title="Из вашей Аудиотеки"
          products={data.libraryProducts}
          ariaLabel="Из вашей Аудиотеки"
          href="/my-practices"
          linkLabel="Аудиотека"
        />
      </HomeSectionBoundary>

      <HomeSectionBoundary section="personal_time_of_day">
        <ProductRail
          title={data.timeOfDaySectionTitle}
          products={data.timeOfDayProducts}
          ariaLabel={data.timeOfDaySectionTitle}
          href="/catalog"
        />
      </HomeSectionBoundary>

      <HomeSectionBoundary section="personal_new_materials">
        <ProductRail
          title="Новые материалы"
          products={data.newProducts}
          ariaLabel="Новые материалы"
          href="/catalog"
        />
      </HomeSectionBoundary>

      <HomeSectionBoundary section="personal_free_materials">
        <ProductRail
          title="Материалы в подарок"
          products={data.freeProducts}
          ariaLabel="Материалы в подарок"
          href="/catalog"
        />
      </HomeSectionBoundary>
    </>
  );
}
