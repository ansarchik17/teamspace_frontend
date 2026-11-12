# TeamSpace frontend

Корпоративное рабочее пространство на React 19, TypeScript, Vite 8 и Tailwind CSS 4.
Основной backend расположен в соседнем каталоге `teamspace_backend` и написан на Go.

## Локальный запуск

Нужен Node.js 22.21.1+; рекомендуемая версия указана в `.nvmrc`.
Сначала запустите backend в отдельном терминале:

```bash
cd ../teamspace_backend
npm run dev
```

Backend-команда требует Go и работающий Docker Engine с Compose v2.
Она поднимает локальные PostgreSQL, Redis, MinIO и Keycloak и запускает API на порту 8080.

В каталоге frontend:

```bash
npm ci
npm run dev
```

Открыть **http://localhost:5173/web/**. Vite использует фиксированный порт 5173
и проксирует `/api`, включая `/api/v1/ws`, на `http://127.0.0.1:8080`.
При занятом порте команда выдаёт ошибку. Изменения frontend применяются через HMR.

По умолчанию `.env` не нужен. Если API слушает другой адрес, создайте `.env.local`:

```dotenv
VITE_API_PROXY_TARGET=http://127.0.0.1:8080
```

Остальные примеры находятся в `.env.example`. Vite читает `.env`, `.env.local`
и файлы выбранного режима; переменные терминала имеют приоритет. После изменения
конфигурации перезапустите dev-сервер. `VITE_*` доступны браузеру, поэтому
секреты провайдеров не следует помещать в эти переменные.

EPS, IForm, AI gateway, ODO, Growy и Whiteboard являются отдельными интеграциями.
Одного основного backend недостаточно для их полной работы. В конфигурации EPS
пока сохранён существующий удалённый адрес по умолчанию; локальный адрес задаётся
через `VITE_EPS_PROXY_TARGET`. Подробности и найденные риски см. в
[аудите проекта](../teamspace_backend/docs/audits/local-development-2026-11-12.md).

## Архитектура

| Каталог | Назначение |
| --- | --- |
| `src/domain` | Сущности, интерфейсы репозиториев и сессий |
| `src/application` | Сценарии использования и правила доступа |
| `src/infrastructure` | HTTP-адаптеры, refresh сессии, хранилища, realtime |
| `src/presentation` | Страницы, компоненты, контроллеры и view models |
| `src/shared` | Общий UI, настройки, авторизация, ru/kk/en |
| `public/growy-telegram` | Отдельный Telegram UI на JavaScript |
| `deploy/mail`, `deploy/whiteboard` | Исходники и конфигурация отдельных приложений |

`src/main.tsx` инициализирует i18n и React; `src/App.tsx` регистрирует маршруты
с базовым путём `/web/`. `ProtectedRoute` проверяет сессию и onboarding.
HTTP-адаптеры используют cookie/Bearer-сессию и общий механизм обновления токенов.

## Проверки

```bash
npm run typecheck
npm run build
npm run lint
npm run i18n:check
npm test
npm run test:production-build  # После build; требует Chromium для Playwright
```

На 12 ноября 2026 сборка, проверка типов, lint и i18n проходят.
Lint выдаёт 476 предупреждений. Общий набор Node-тестов: 149 из 154 проходят;
пять тестов Telegram требуют обновления тестового DOM и загрузки reply helper.
Browser-проверка и фактический dev-запуск в среде аудита блокируются запретом
на открытие локальных портов. Результаты подробно приведены в аудите.
