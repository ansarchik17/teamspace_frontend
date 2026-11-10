# Карта обращений к ИИ для подключения учёта расхода

Дата исследования: 16 октября 2026 года. Задача 01. Исследованы рабочие копии `workspace-front` и `workspace-backend`. Изменяется только этот документ.

## Границы и обозначения

Это статический анализ исходников, а не проверка работающего production. «Потенциально платный» означает вызов генерации, embeddings, rerank или внешнего AI-сервиса; наличие тарифа и фактическую стоимость код не подтверждает. Реальные настройки окружения, ключи и счета провайдеров не читались. Название модели не определяет поставщика: модели `openai/...` и `google/...` через Alem отправляются в NITEC, а не напрямую в OpenAI/Google.

Пути `internal/...` ниже относятся к `C:/Users/Merey/workspace-backend`, пути `src/...` и `deploy/mail/...` — к `C:/Users/Merey/workspace-front`. Номера строк — ориентиры на момент исследования.

**Alem transport:** `internal/alem/client.go:17,56`, `internal/alem/methods.go:67,103,113`. Адрес по умолчанию `https://llm.nitec.kz`; POST `/v1/chat/completions`, `/v1/embeddings`, `/v1/rerank`. `Client.do` повторяет сетевые ошибки, HTTP 429 и 5xx до `maxRetries` дополнительных попыток. Обычные Alem-сервисы используют `ALEM_MAX_RETRIES` (в конфигурации default 1), Drive — `DRIVE_SEARCH_ALEM_MAX_RETRIES` (fallback `ALEM_MAX_RETRIES`, default 2), Notebook создаёт клиент с 1 повтором. Значения production не проверены. Каждый повтор является отдельной HTTP-попыткой; после сетевой ошибки неизвестно, успел ли провайдер выполнить предыдущую.

**Usage Alem:** `internal/alem/models.go:98,150,185,210` содержит `prompt_tokens`, `completion_tokens`, `total_tokens` для completions, embeddings и rerank. Наличие поля в структуре не гарантирует, что конкретный провайдер прислал ненулевой расход. Отсутствие поля сейчас не отличается от нуля. Детализации cached/reasoning tokens в этой структуре нет.

## 1. Подтверждённые вызовы основного бэкенда

Во всех строках таблицы потоковый ответ провайдера **не используется**. Общий Alem transport принудительно задаёт `Stream=false` для обычных completions.

| ID | Функция и исходник | Инициатор / доступная атрибуция | Провайдер / модель | Usage сейчас | Повторы и дополнительные вызовы |
| --- | --- | --- | --- | --- | --- |
| B01 | Основной чат: `internal/service/alem_service.go:172,405,419,454` | Авторизованный пользователь, `userID`, `chatID`; контекстная ветка требует `AIDataIdentity` | Alem/NITEC, выбранная или default модель | `TotalTokens` сохраняется в `AIMessage.TokensUsage`; отдельного журнала расхода нет | Alem transport; при запрете выбранной модели повтор с default; контекстная ветка — B02/B03 |
| B02 | Контекстный цикл: `internal/service/ai_context_chat.go:20,81,87,105` | Пользователь B01, `AIDataIdentity.UserID` | Alem/NITEC, модель запроса | Суммируются входные/выходные/общие токены доступных ответов, возвращаются в итоговом response | До 9 раундов; в первом раунде возможен дополнительный вызов с JSON-протоколом вместо tools; transport-повторы на каждый вызов |
| B03 | Проверка/публикация ответа: `internal/service/ai_user_answer.go:152,173,174` | Пользователь B02; helper самостоятельно не принимает `userID` | Alem/NITEC, переданная модель | Usage суммируется и передаётся в B02 | Условный этап, до 2 попыток публикации; дополнительно Alem transport |
| B04 | Автонаименование чата: `internal/service/alem_service.go:478,613,632` | Побочный эффект первых сообщений B01; запускается goroutine; в аргументах `chatID`, но нет `userID`/компании | Alem/NITEC, `google/gemma-3-27b` | Ответ содержит usage, но расход не сохраняется и не добавляется к ответу чата | Alem transport; `context.Background()`, не зависит от закрытия клиентского запроса |
| B05 | Unified chat: `internal/service/unified_ai_service.go:128,243,255,274` | Авторизованный пользователь, `userID`, `chatID` | Alem/NITEC, выбранная/default модель | Только `TotalTokens` в `UnifiedAIMessage.TokensUsage` | Alem transport; fallback на default при запрете модели |
| B06 | Публичный для авторизованного клиента proxy embeddings: `internal/service/alem_service.go:671`, `internal/service/unified_ai_service.go:291` | Пользователь обработчика; сами service-методы принимают только `ctx` и запрос, без явного userID | Alem/NITEC, модель из запроса | Usage возвращается в API response; отдельное списание не найдено | Alem transport |
| B07 | Proxy rerank: `internal/service/alem_service.go:676`, `internal/service/unified_ai_service.go:296` | Аналогично B06 | Alem/NITEC, модель из запроса | Usage возвращается в response; отдельное списание не найдено | Alem transport |
| B08 | Notebook: основной ответ `internal/service/notebook_research_service.go:396,478,482` | Пользователь `Ask`, `userID`, `chatID` | Alem/NITEC, `chatModel`; fallback `DefaultAlemModel` | Ответ провайдера типизирован с usage, но `Ask` его не сохраняет и не возвращает как расход | Клиент: 1 transport-повтор; при ошибке/пустом ответе иной модели — default, пока ctx активен |
| B09 | Notebook: проверка thinking-ответа `internal/service/notebook_verification.go:30,38` | Тот же пользователь B08; helper без явного userID | Alem/NITEC, модель завершающего вызова B08 | Usage не извлекается для учёта | Дополнительный вызов только в thinking; 1 transport-повтор |
| B10 | Drive: переписывание поискового запроса `internal/service/drive_search_service.go:732,761,778` | Пользователь `Search(ctx,userID,...)`; helper без userID | Alem/NITEC, `queryRewriteModel()` | Usage игнорируется | Только при включённом query rewrite; Drive transport |
| B11 | Drive: HyDE `internal/service/drive_search_service.go:749,809,826` | Пользователь B10 | Alem/NITEC, `hydeModel()` | Usage игнорируется | Дополнительная генерация к rewrite; при ошибке поиск продолжается без HyDE; Drive transport |
| B12 | Drive: embedding поискового текста `internal/service/drive_search_service.go:641,654,1965,1966` | Пользователь поиска; общий helper `embedTexts` без userID | Alem/NITEC, `cfg.EmbeddingModel` | Используются только векторы, usage игнорируется | При hybrid search; Drive transport |
| B13 | Drive: rerank результатов `internal/service/drive_search_service.go:1008,1061` | Пользователь поиска; helper без userID | Alem/NITEC, модель из конфигурации rerank | Usage игнорируется | Условный этап rerank; Drive transport |
| B14 | Drive: embeddings чанков файла `internal/service/drive_search_service.go:1362,1398,1682,1689,1958,1966` | Изменение/загрузка файла через Drive, фон `IndexFileAsync(fileID)` либо on-demand indexing при поиске; есть fileID, но у фонового входа нет явного инициатора | Alem/NITEC, `cfg.EmbeddingModel` | Usage игнорируется | При hybrid indexing; Drive transport. Повторная индексация может заново расходовать токены |
| B15 | Legacy Smart Agent `internal/service/smart_agent_service.go:66,124,202,216` | Авторизованный пользователь `ProcessChat(ctx,userID,req)`; `callOpenAI` без userID и ctx | Напрямую OpenAI `/v1/chat/completions`, `gpt-4o` | `OpenAIResponse.Usage` декодируется (`smart_agent_types.go`), но цикл его не суммирует и не сохраняет | До 5 итераций с tools; явных HTTP-повторов нет. HTTP-запрос создаётся без привязки к ctx |
| B16 | Agent v2: adaptive web search `internal/agent/adaptive_web_search.go:60,99,115`; вызов из `internal/agent/tools.go:137` | Действие пользователя агента; передаются Authorization/Cookie; helper без userID | Внешний `AGENT_ADAPTIVE_WEB_SEARCH_URL`, default `https://alem-workspace.gov.kz/v1/chat/ask_adaptive`; внутренняя модель неизвестна | Usage в локальном контракте не учитывается | Один JSON HTTP-вызов, явных повторов нет; внутренние вызовы внешнего сервиса неизвестны |
| B17 | Notebook: создание презентации `internal/service/twoslides_service.go:37,106,148,168` | Авторизованный пользователь `NotebookHandler.GenerateSlidesWithTwoSlides`; в `Generate(ctx,req)` userID не передаётся | 2slides, `TWOSLIDES_BASE_URL`; варианты fast_ppt/pdf_slides/like_this, опциональный imageModel | Неструктурированный ответ `map[string]any`; подтверждённого извлечения токенов/кредитов нет | Один POST на создание; явных повторов нет. Внешнее выполнение асинхронное, результат проверяется через GetJob; это не streaming |

### Входы API и связанные цепочки

`internal/server/router.go:1042–1155` регистрирует защищённые группы основного чата, unified chat, агента и Notebook. Для чата есть POST сообщений, для обеих chat-групп — POST embeddings/rerank. Notebook использует POST `/notebook/chats/:id/ask` и `/notebook/slides/2slides/generate` внутри API-префикса router.

`internal/handler/smart_agent_handler.go:55` сначала вызывает `ProcessLegacy`, а при ошибке может перейти на v2. `internal/agent/service.go:65` делегирует legacy-процессору. Это отдельная граница fallback: ошибка предыдущего пути не доказывает отсутствие расхода. V2 также содержит обычные операции с данными; нельзя считать каждый шаг агента вызовом LLM.

Drive `Search` (`drive_search_service.go:102`) может вызвать on-demand индексацию отсутствующих файлов до поиска. Одна операция пользователя потенциально порождает B14 + B10 + B11 + B12 + B13. Отдельные этапы зависят от конфигурации. Notebook пользуется Drive для чтения источников; нельзя приписывать все Drive-вызовы каждому Notebook-запросу без проверки конкретной ветки.

## 2. Отдельный почтовый сервис в репозитории фронтенда

| ID | Файл и операция | Инициатор | Провайдер | Usage | Повторы / поток |
| --- | --- | --- | --- | --- | --- |
| M01 | `deploy/mail/source/server/workers.ts:111`, `aiTick`: summary/reply; транспорт `server/ai-client.ts:7` | Пользователь создаёт `/api/ai/jobs` (`server/app.ts:1028`); worker сохраняет привязку `job.user_id`, `job.tenant_id`, `job.mailbox_id` | `AI_BASE_URL` + `/chat/completions`, модель `AI_MODEL` | JSON может содержать usage, но worker берёт только `choices[0].message.content`, расход не сохраняется | Явных повторов нет; ошибка помечает job failed; JSON буферизуется полностью, streaming нет; таймаут 60 секунд |

Здесь уже есть ограничение **30 заданий на пользователя и tenant в сутки** по количеству строк `ai_jobs` (`app.ts`), а не по токенам. Оно не связано с бюджетами Go-бэкенда. Tenant/user почты нужно явно сопоставить с компанией/пользователем Workspace перед общим списанием. Запрос может быть оплачен, даже если последующая проверка доступа или запись результата завершилась ошибкой.

## 3. Клиент провайдера в браузере: наличие без подтверждённого использования

`src/presentation/pages/alemdrive/drive-src/api/llm.js`:

| ID | Вход | Провайдер | Usage | Повторы / поток | Статус |
| --- | --- | --- | --- | --- | --- |
| F01 | `createEmbeddings:40`, POST на строке 45 | NITEC, default `BAAI/bge-m3` | Возвращается сырой response.data | Явных повторов нет, JSON | Вызовы из других файлов не найдены |
| F02 | `createEmbeddingsBatched:62` | Через F01 | Возвращает только векторы, usage теряется | Последовательные batch по 24; это отдельные запросы, а не retries | Внешние вызовы функции не найдены |
| F03 | `chatCompletion:95`, POST на строке 110 | NITEC; FAST/THINKING модели из Vite env с fallback в файле | Возвращается сырой response.data | Явных повторов нет; stream не запрашивается | Импорты и вызовы из других файлов не найдены |

Клиент предусматривает ключ из `VITE_LLM_API_KEY` либо localStorage. Фактическое наличие ключа не проверялось. Это **потенциальный путь обхода серверных квот**, если модуль снова подключат. Нельзя описывать его как подтверждённый текущий расход. Будущий общий учёт должен исключить прямые браузерные обращения за счёт платформы.

## 4. Внешние AI-интерфейсы без доступной реализации провайдера

Во фронтенде `src/infrastructure/repositories/HttpAlemAiRepository.ts` найдены следующие операции. Это подтверждённые клиентские входы, но не доказательство того, какой провайдер и сколько вызовов стоит за ними. Реализация перечисленных `/api/tools/...` не найдена в исследованных исходниках Go; маршруты не следует приравнивать к `/api/v1/...` основного бэкенда.

| ID | Функция / строки | Инициатор | Известный интерфейс | Usage, retries, streaming |
| --- | --- | --- | --- | --- |
| X01 | `smartAgentChat:397`, `smartAgentChatStream:404`, cancel:494 | Пользователь Smart Agent | `/api/tools/smart-agent/chat`, `/chat/stream`, cancel по requestId | SSE подтверждён на границе браузер–сервис. Поток от модели, usage и внутренние повторы неизвестны. Это не streaming Alem transport |
| X02 | analyze text/multipart:546,553,566; task-assist:613 | Пользователь ТЗ-ИИ | `/api/tools/tzai/analyze-text`, `/analyze`, `/task-assist` | Провайдер, usage и внутренние повторы неизвестны; методы ожидают JSON |
| X03 | speech-to-text:642; report:649 | Пользователь Meeting AI / заметок | `/api/tools/meeting-ai/speech-to-text`, `/speech-to-text/report` | Неизвестны speech-провайдер, тарифная единица, usage и повторы; JSON |
| X04 | meetingAnalyze:652; async:664; статус:677 | Пользователь Meeting AI / заметок | `/api/tools/meeting-ai/meeting/analyze`, `/analyze/async`, получение задания | Асинхронное задание; внутренние STT/LLM-вызовы и usage неизвестны, это не доказанный поток модели |
| X05 | analyzeText:720 | Пользователь Meeting AI | `/api/tools/meeting-ai/text-analysis` | Провайдер, usage и внутренние повторы неизвестны; JSON |
| X06 | `internal/service/content_extraction_service.go:282,301` | Загрузка/чтение документа; фон AIDocumentService, Drive indexing, Notebook | HTTP DocumentParse по `DOCUMENT_PARSE_URL`, multipart file | Локальный контракт читает только `chunks[].text`; usage отсутствует; один HTTP-вызов без явного retry, не stream. Использует ли внешний сервис платный OCR/LLM — неизвестно |

Для X01–X06 нужны исходники соответствующих сервисов или их контракт расхода. STT может тарифицироваться длительностью, 2slides — заданиями/кредитами: нельзя придумывать токены там, где провайдер их не возвращает.

## 5. Документы, фоновые процессы и исключения

- `internal/service/ai_document_service.go:207,237`: worker скачивает файл, вызывает `ExtractTextBytes`, создаёт текстовые чанки и сохраняет ready. Прямого LLM/embedding-вызова в worker нет. Возможная внешняя стоимость — X06, если выбран DocumentParse. Retry документа и очереди нельзя считать бесплатным повтором внешнего парсера без его контракта.
- `internal/service/content_extraction_service.go`: локальное извлечение текста/конвертация не является подтверждённым платным LLM-вызовом.
- `internal/service/ai_assistant_service.go`: сбор данных календаря, задач, контактов и шаблонного `speech_text`; прямой вызов LLM/TTS не найден. Наличие слова AI или TTS в комментарии не доказывает платный вызов.
- `internal/alem/methods.go:77` реализует `CreateChatCompletionStream`, но его вызовы из других Go-файлов не найдены. `ChatCompletionChunk` не содержит usage, финальный usage потоков сейчас не моделируется.
- ListModels, получение истории/источников, чтение статуса 2slides и поиск тем — внешние или внутренние операции, но код не подтверждает генерацию и списание токенов. Не включать их автоматически в токенный расход.
- В `workspace-backend/services/notes-stt` найден только локальный `__pycache__/server.cpython-312.pyc`, исходник server.py отсутствует. Бинарный кэш не исследовался как источник контракта и не изменялся.

## 6. Точки подключения будущего учёта

1. На уровне сценария закрепить проверенные userID, organizationID, operationID и тип действия. Для B04 и B14 передавать атрибуцию в фон, а не восстанавливать текущую компанию после завершения. Для M01 определить mapping tenant/user.
2. На границе **каждого фактического provider attempt** резервировать бюджет и фиксировать исход. Одной записи `tokens_usage` финального сообщения недостаточно: теряются заголовки, промежуточные вызовы, fallback, поиск и операции, завершившиеся ошибкой после ответа модели.
3. В Alem transport различать HTTP-попытки и логическую операцию. Не удваивать списание: B02/B03 уже суммируют usage, поэтому их агрегат нельзя списывать повторно поверх отдельных вызовов.
4. Для B15 подключить отдельный OpenAI transport; для B17 — адаптер тарификации внешнего задания. Для M01 нужен общий серверный механизм списания или доверенный API учёта между сервисами.
5. Для X01–X06 получить договорённость о расходе, стабильных идентификаторах операций/попыток и завершении после отмены. Учёт только в браузере не защищает бюджет.
6. До включения жёстких квот закрыть инвентаризацию внешних сервисов. Отсутствующий usage хранить как неизвестный, не как бесплатный вызов.

## 7. Что проверено и что осталось

Выполнены поиск по обоим репозиториям, чтение transport-клиентов, вызывающих сервисов, router/handlers, моделей usage, фоновых задач и фронтенд-репозиториев. Проверены ссылки на streaming-клиент и браузерный llm.js. Секреты не извлекались, платные API не вызывались.

Не проверены production-конфигурация, реальная доступность маршрутов, счета/тарифы, фактические ответы usage и внутренности внешних `/api/tools`, DocumentParse, adaptive search, 2slides и STT. Поэтому документ является полной картой найденных точек в доступных исходниках с явными пробелами за внешними границами, а не гарантией полноты production-инфраструктуры.

Тесты приложения не запускались: изменена только документация. Для этого изменения не нужны миграции, обновление бэкенда или настройка сервера. Commit, push и развёртывание не выполнялись. Существовавшие до исследования `.cache/` во фронтенде и `services/` в бэкенде не изменялись.
