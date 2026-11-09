# t1311u / t1313u – подсказка при ранней оплате

## Формулировка (рядом с кнопкой)
«Оставшиеся дни сохранятся, и к ним добавится ещё 30 дней – доступ будет до {дата}.»

Показывается только при живом `trial` или `paid` (код пути `businessEarlyPayCarryoverNote`). В grace / offer / после конца периода – нет.

Дата = текущий `endsAt` (конец подарка или оплаченного периода) + 30 суток, как в `apply_business_subscription_for_order`.

## Где есть кнопки оплаты (grep)

| Место | Кнопка / label | Подсказка carryover |
|---|---|---|
| Профиль → «Подписка» (`BusinessProfileSubscription`) | `summary.button`: «Оплатить заранее» / «Продлить» / «Оплатить» через `BusinessPayControls` | да (общий блок) |
| Главная, карточка доступа (`BusinessHomeAccessCard`) | «Оплатить» через `BusinessPayControls` | да |
| Главная, «С чего начать» (`BusinessHomeChecklist`) | «Оплатить» / «Продлить» (свой button) | да (`BusinessEarlyPayCarryoverNote`) |
| Несколько точек (`BusinessPointSlots`) | «Оплатить» через `BusinessPayControls` | да |
| Партнёрский код (тот же `BusinessPayControls` + `BusinessPartnerTerms`) | «Оплатить заранее» / «Оплатить» | да |
| Зал (`BusinessHallHome` «Продлить доступ») | ссылка на профиль **после** конца доступа | нет – это не ранняя оплата |

## Скриншоты 390px
См. `screenshots/*.png` (fixtures в `fixtures/`).
