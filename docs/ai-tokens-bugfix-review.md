# Исправления после проверки задач 23–32

Дата: 19 октября 2026. Изменения локальные в workspace-backend и workspace-front, без commit/push и развёртывания. Существующие изменения пользователя сохранены.

## Исправлено (fixed)

- Smart Agent: отсутствующий operation_id получает UUID на отдельный запрос, а не идентификатор сессии. Явный operation_id сохраняет идемпотентность.
- Параллельность: под блокировкой строки пользователя Reserve считает все активные резервы пользователя, включая старую компанию и прошлые периоды. main передаёт серверный лимит. После отмены HTTP, потери Redis lease или heartbeat нельзя запустить следующую генерацию, пока результат предыдущей неизвестен. Сервисные операции без пользователя не меняются. Неизвестные операции занимают слот до подтверждённой сверки.
- Heartbeat: ошибка Renew передаётся исполнителю; до dispatch такой запрос фиксируется как not_dispatched. Redis использует собственное время; истёкший lease не восстанавливается Renew.
- Личные лимиты: производственный GET сообщает enforced, согласованно с Reserve. Старые активные резервы входят в carried_reserved и при отсутствии созданной строки текущего периода.
- Notebook: бизнес-ошибки общего учёта доходят до безопасного HTTP presenter; fallback запускается только при подтверждённом запрете модели, не при квоте или произвольном сбое.
- Фронтенд: проверка пользователя и отмены выполняется после чтения JSON, включая ошибку чтения. Обновление JWT того же user_id разрешено; смена пользователя отклоняется. Каждый запуск хука отменяет предыдущий и использует номер запроса; logout/unmount инвалидируют все результаты.
- Сетевой Failed to fetch означает неизвестный результат. Ошибки accounting/model после возможного dispatch также не объявляются доказанно бесплатным отказом. Явный retry_at=null не подменяется границей периода.
- При отправке composer временно заблокирован; отказ сохраняет исходный текст и восстанавливает действующий preview вложения. Отказ редактирования восстанавливает всю историю и оставляет редактор с введённым текстом. Ответ старого диалога не меняет новый диалог, включая этапы загрузки документов.
- Исправлены fixtures интеграционных тестов: параметризованные multi-statement запросы используют simple protocol; актуальные таблицы журнала; ненулевой config; правильный /v1/models.

Основные файлы backend: internal/repository/ai_reservations.go, user_ai_limits.go; internal/service/ai_paid_caller.go, ai_limiter.go, smart_agent_service.go, notebook_research_service.go, notebook_verification.go; cmd/api/main.go; internal/handler/administration_ai_payload.go.
Основные файлы frontend: src/infrastructure/repositories/HttpUserAILimitsRepository.ts; src/presentation/alemai/useUserAILimits.ts; src/domain/entities/AICallError.ts; src/presentation/pages/alemai/AlemAIChat.tsx и chat/components/MessageBubble.tsx.

## Проверки

1. Сборка: npx tsc -b — PASS. gofmt изменённых Go-файлов — PASS. git diff --check в обоих репозиториях — PASS.
2. Исходный обход: TestAIPaidHTTPDisconnectDurableSlot с настоящим HTTP-сервером и PostgreSQL — PASS: провайдер продолжает работу после disconnect, попытка unknown, второй dispatch запрещён. TestAIReserveDurableConcurrencyParallel — PASS: восемь конкурирующих запросов создают один резерв. TestAIReserveDurableConcurrencyAcrossInstances — PASS: другой экземпляр и новая неделя не обходят активный резерв, replay сохраняется, carried_reserved корректен без текущей строки периода.
3. Регрессии: go test ./internal/repository ./internal/service ./internal/handler ./cmd/api -run 'TestAI|TestAlem|TestUnified|TestNotebook|TestSmartAgent|TestProxy|TestUserAI|TestEvaluateAI|TestCalculateEffective|TestPersonalAI|TestAdministrationAI' -count=1 -timeout=120s — PASS на отдельной БД. БД остановлена после тестов.
4. go test ./internal/domain ./internal/alem ./internal/i18n ./internal/apperrors -count=1 — PASS. go test ./internal/config -run TestAILimiter -count=1 — PASS.
5. node scripts/test-user-ai-limits.cjs; test-ai-limits-races.cjs; test-chat-edit-races.cjs; test-chat-limits-exhaustion.cjs; test-ai-limits-indicator.cjs — PASS. Новые тесты проверяют реальные hook/handler функции, устаревшие ответы, смену пользователя во время JSON, обновление JWT, полный rollback истории и изоляцию нового диалога.
6. npm run i18n:check — PASS. Независимый read-only обзор выявил refresh и поздний ответ другого диалога; оба замечания учтены.

Полный пакет internal/config имеет отдельные ошибки очистки временных backend.log на Windows (файл открыт). Эти несвязанные logger-тесты не исправлялись. Первоначальные сетевые проверки в песочнице были заблокированы; успешно повторены с локальным доступом. Настоящий Redis и визуальная проверка в браузере не запускались.

## Осталось (blocked / отдельная интеграция)

Задача 26 не завершена. Drive, 2slides, AxisMail и внешние инструменты ещё требуют общего учёта. Для adaptive web search, DocumentParse и внешнего STT нельзя доказать бесплатность по отсутствию usage в этом репозитории. Исправлены ложные утверждения в backend/docs/ai-inventory-reconciliation-task-26.md. Контракты внешних услуг и исходники внешних workers не представлены; фиктивные списания и молчаливое отключение существующих функций не добавлялись. Общую готовность лимитов для всех платных путей подтверждать нельзя.

Для применения исправлений потребуется обновление бэкенда и фронтенда. Новая миграция этими исправлениями не добавлена; нужны миграции предыдущих задач и согласованная серверная настройка AI limiter на всех экземплярах.
