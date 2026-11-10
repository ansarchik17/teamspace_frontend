# Инструкция по развертыванию Alem Frontend (React + Vite + Nginx)

Данный документ содержит полное руководство по сборке, настройке и запуску фронтенд-приложения **Alem Frontend** на сервере.

---

## 📋 Содержание
1. [Обзор архитектуры и особенности](#1-обзор-архитектуры-и-особенности)
2. [Требования к серверу](#2-требования-к-серверу)
3. [Переменные окружения (.env)](#3-переменные-окружения-env)
4. [Вариант 1: Запуск через Docker (Рекомендуется)](#4-вариант-1-запуск-через-docker-рекомендуется)
5. [Вариант 2: Запуск через Docker Compose](#5-вариант-2-запуск-через-docker-compose)
6. [Вариант 3: Ручная сборка и Nginx (Без Docker)](#6-вариант-3-ручная-сборка-и-nginx-без-docker)
7. [Конфигурация Nginx (Маршрутизация и Проксирование)](#7-конфигурация-nginx-маршрутизация-и-проксирование)
8. [Частые проблемы и решение (Troubleshooting)](#8-частые-проблемы-и-решение-troubleshooting)

---

## 1. Обзор архитектуры и особенности

* **Стек:** React 19, TypeScript, Vite, TailwindCSS.
* **Тип приложения:** Single Page Application (SPA).
* **Сборка:** Статические файлы HTML/JS/CSS компилируются на этапе сборки (Build time).
* **Маршрутизация:** Клиентский роутинг (React Router v7). Требуется перенаправление всех запросов на `index.html` (Nginx `try_files`).

> ⚠️ **Важно знать:** В Vite-приложениях переменные окружения, начинающиеся с `VITE_`, вшиваются в итоговые JS-файлы **в момент сборки** (`npm run build` или `docker build`). Если вы меняете URL бэкенда, необходимо пересобрать проект.

---

## 2. Требования к серверу

### Минимальные характеристики:
* **CPU:** 1-2 ядра
* **RAM:** 2 ГБ (для комфортной сборки Docker/npm). Для работы готовых статических файлов достаточно 512 МБ.
* **Диск:** 5-10 ГБ свободного места.

### Установленный софт (в зависимости от способа):
* **Для Варианта 1 & 2 (Docker):** Docker Engine 20.10+ и Docker Compose v2+.
* **Для Варианта 3 (Без Docker):** Node.js v20+ (или LTS 22+), npm 10+, Nginx 1.20+.

---

## 3. Переменные окружения (.env)

Переменные передаются при сборке. Файл `.env.local` используется для локальной разработки, а для сервера задаются аргументы сборки (`ARG`) или `.env`.

Основные переменные:
* `VITE_API_URL` — базовый путь к API бэкенда (например, `/api/v1` или `https://api.yourdomain.com/v1`).
* `VITE_PROXY_API` — адрес бэкенда для локального проксирования в dev-режиме.

Для Alem Drive сервер Collabora задаётся на backend через `COLLABORA_URL`.

---

## 4. Вариант 1: Запуск через Docker (Рекомендуется)

В проекте подготовлен многоэтапный (multi-stage) `Dockerfile`, который собирает статику на базе Node.js и раздает её через легкий образ `nginx:alpine`.

### Шаг 1. Клонирование репозитория
```bash
git clone <URL_РЕПОЗИТОРИЯ> alem-frontend
cd alem-frontend
```

### Шаг 2. Сборка Docker-образа
Выполните команду сборки. Передайте необходимый `VITE_API_URL` через `--build-arg`:
```bash
docker build -t alem-frontend:latest \
  --build-arg VITE_API_URL=/api/v1 \
  .
```

### Шаг 3. Запуск контейнера
Запустите контейнер на нужном порту (например, порт `8082` на сервере мапится на `80` контейнера):
```bash
docker run -d \
  --name alem-frontend-container \
  --restart always \
  -p 8082:80 \
  alem-frontend:latest
```

### Шаг 4. Проверка работы
Проверьте статус контейнера и Healthcheck:
```bash
docker ps
curl http://localhost:8082/health
```
Если команда возвращает `ok`, контейнер успешно запущен и готов к работе.

---

## 5. Вариант 2: Запуск через Docker Compose

Для удобства управления можно создать файл `docker-compose.yml` в корне проекта:

```yaml
version: '3.8'

services:
  alem-frontend:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        VITE_API_URL: /api/v1
    container_name: alem-frontend-container
    restart: always
    ports:
      - "8082:80"
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

**Запуск:**
```bash
docker compose up -d --build
```

**Остановка:**
```bash
docker compose down
```

---

## 6. Вариант 3: Ручная сборка и Nginx (Без Docker)

Если вы деплоите проект непосредственно на сервер с установленным Nginx:

### Шаг 1. Установка зависимостей и сборка
```bash
# 1. Установка Node.js зависимостей
npm install

# 2. Сборка продакшн бандла
npm run build
```
После завершения в корне проекта появится папка `dist/` со статическими файлами.

### Шаг 2. Копирование файлов на сервер
Перенесите содержимое папки `dist/` в директорию веб-сервера, например:
```bash
sudo mkdir -p /var/www/alem-frontend
sudo cp -r dist/* /var/www/alem-frontend/
sudo chown -R www-data:www-data /var/www/alem-frontend
```

---

## 7. Конфигурация Nginx (Маршрутизация и Проксирование)

Поскольку приложение является SPA (Single Page Application) с клиентским роутингом, Nginx должен отдавать `index.html` на все маршруты, которых нет в виде физических файлов на диске. Также Nginx проксирует запросы к бэкенду (`/api/`).

Пример готового конфига для Nginx (`/etc/nginx/sites-available/alem-frontend.conf`):

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name yourdomain.com; # Укажите ваш домен или IP

    client_max_body_size 32m;
    root /var/www/alem-frontend; # Или /usr/share/nginx/html в Docker
    index index.html;

    # Healthcheck
    location = /health {
        access_log off;
        return 200 "ok\n";
        add_header Content-Type text/plain;
    }

    # Обслуживание статики и SPA-роутинга
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Кэширование статических ассетов (JS, CSS, изображения, шрифты)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }

    # Проксирование API на бэкенд
    location /api/ {
        proxy_pass http://127.0.0.1:18081; # Укажите IP и порт вашего Backend API
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Поддержка WebSockets
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

Активация конфига (для Debian/Ubuntu):
```bash
sudo ln -s /etc/nginx/sites-available/alem-frontend.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 8. Частые проблемы и решение (Troubleshooting)

### 🔴 1. При обновлении страницы (F5) выходит ошибка `404 Not Found`
* **Причина:** Nginx пытается найти файл на диске с именем пути URL и не находит его.
* **Решение:** Проверьте наличие строки `try_files $uri $uri/ /index.html;` в конфигурации Nginx.

### 🔴 2. Ошибки CORS или `404` при запросах к API
* **Причина:** Запросы с фронтенда отправляются на неверный порт или адрес бэкенда.
* **Решение:** Проверьте `proxy_pass` в Nginx. Фронтенд должен делать запросы относительными путями (например, `/api/v1/...`), а Nginx перенаправлять их на целевой бэкенд.

### 🔴 3. Изменения в `.env` не применяются на сервере
* **Причина:** Переменные `VITE_` вшиваются в код во время сборки (`build time`), а не чтения runtime.
* **Решение:** Пересоберите Docker-образ с помощью `docker build --no-cache` или заново выполните `npm run build`.

---

## 🛠 Полезные команды

```bash
# Просмотр логов контейнера
docker logs -f --tail 100 alem-frontend-container

# Перезапуск контейнера
docker restart alem-frontend-container

# Проверка статуса Nginx на сервере
sudo systemctl status nginx
```
