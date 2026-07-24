# SEO-хаб «Бесплатные медитации»

URL: `/topics/besplatnye-meditatsii`  
Ветка: `feat/seo-topic-hub-besplatnye-meditatsii`

## Модель фильтрации

**`freeOnly: true` + ordered `practiceSlugAllowlist` (10 slug)**  
Без `topicKey` (не подделываем platform topic).  
`resolveTopicChips: false`.

Почему не auto free-only без allowlist: нужен редакционный порядок входа и контроль состава при росте каталога.

## Аудит (на момент подготовки)

- Published catalog: 20  
- Free (`is_free=true`): 10  
- Guest access enabled: 0 из 10 (FAQ честно про вход для Аудиотеки)

## Порядок allowlist

1. kod-prityazheniya  
2. dengi-prihodyat-segodnya  
3. prityanut-dengi-legko  
4. zhenskie-dengi  
5. bastet-boginya-radosti-lyubvi-i-zhenskoy-sily  
6. elixir-molodosti  
7. klyuch-k-izobiliyu  
8. dengi-menya-obozhayut  
9. energiya-denezhnogo-puti  
10. velikie-zhenschiny-mira  

## Публичный copy (регистрация / скачивание)

- Не обещаем прослушивание без регистрации и не пишем «доступно без регистрации».
- Не обещаем скачивание.
- Не пишем «все бесплатные медитации».
- Допустимо: бесплатные медитации и аудиопрактики для прослушивания онлайн без покупки.
- Явно: для прослушивания или сохранения в Аудиотеку может понадобиться вход.

## Analytics

- `topic_slug=besplatnye-meditatsii`
- `hub_slug=besplatnye-meditatsii`
- `topic_key` **не отправляется**
- Отчётность хаба – по `topic_slug`
