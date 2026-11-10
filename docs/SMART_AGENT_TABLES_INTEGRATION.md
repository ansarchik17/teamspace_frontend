# Интеграция отображения таблиц Smart Agent (Web и Flutter)

Этот документ описывает, как устроена передача табличных данных в ответах Smart Agent API и как фронтенд-разработчикам (Web) и мобильным разработчикам (Flutter) следует отображать эти таблицы внутри чата.

---

## 1. Как приходят данные в ответе API

При запросе к API `/tools/smart-agent/chat` (текстовый) или `/tools/smart-agent/chat/voice` (голосовой), а также по протоколу WebSocket, в ответе приходит объект `SmartAgentChatResponse`. 

Помимо стандартного текста ответа `reply` в нём передаётся поле `tables`, содержащее список структурированных таблиц.

### Пример JSON-ответа:

```json
{
  "tool": "smart_agent",
  "session_id": "voice-1718204561-abcde",
  "reply": "Вот сравнительная таблица по KPI отделов:\n\n[table:0]\n\nЕсли у вас возникнут вопросы, дайте знать.",
  "tables": [
    {
      "title": "Сравнение KPI отделов за Q1",
      "headers": ["Отдел", "План", "Факт", "Прогресс"],
      "rows": [
        ["Департамент продаж", "100 млн", "105 млн", "+5%"],
        ["Маркетинг", "50 млн", "48 млн", "-4%"],
        ["HR & Рекрутинг", "12 вакансий", "15 вакансий", "125%"]
      ]
    }
  ],
  "widget": null,
  "charts": null
}
```

### Ключевые моменты:
1. **Плейсхолдер `[table:idx]`**: В тексте `reply` на месте, где должна быть таблица, находится маркер вида `[table:0]`, `[table:1]` и т.д., где число соответствует индексу таблицы в массиве `tables`.
2. **Массив `tables`**: Может быть `null` или содержать одну или несколько таблиц.
3. **Объект `SmartAgentTable`**:
   - `title` (строка): Название таблицы. Может быть пустой строкой `""`.
   - `headers` (массив строк): Заголовки столбцов.
   - `rows` (двумерный массив строк): Строки таблицы. Каждая строка — это массив ячеек.

---

## 2. Логика отображения на клиенте (Общий алгоритм)

Для корректного рендеринга сообщений клиент должен:
1. Получить текст `reply` и массив `tables`.
2. Если `tables` пустой или `null`, отрендерить текст обычным образом.
3. Если `tables` содержит элементы:
   - Использовать регулярное выражение для поиска маркера `[table:(\d+)]`.
   - Разбить текст на блоки.
   - В местах нахождения плейсхолдера `[table:N]` отрендерить нативный компонент таблицы, используя данные из `tables[N]`.
   - Оставшийся текст рендерить как обычный Markdown или текст.

---

## 3. Реализация на Web-фронтенде (HTML/JS)

### Пример CSS для красивого отображения (Glassmorphism-совместимый стиль):

```css
.table-widget-container {
    margin: 12px 0;
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.4);
    overflow: hidden;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.table-widget-title {
    padding: 10px 14px;
    font-size: 14px;
    font-weight: 600;
    color: #e2e8f0;
    background: rgba(148, 163, 184, 0.08);
    border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.table-widget-scroll {
    overflow-x: auto;
    width: 100%;
}

.table-widget {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    text-align: left;
}

.table-widget th {
    padding: 10px 14px;
    font-weight: 600;
    color: #94a3b8;
    background: rgba(15, 23, 42, 0.2);
    border-bottom: 1px solid rgba(148, 163, 184, 0.15);
    white-space: nowrap;
}

.table-widget td {
    padding: 10px 14px;
    color: #cbd5e1;
    border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.table-widget tr:last-child td {
    border-bottom: none;
}

.table-widget tr:hover td {
    background: rgba(148, 163, 184, 0.04);
}
```

### JS Функция парсинга и рендеринга:

```javascript
// Эскейпинг HTML для безопасности
function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}

// Генерация HTML таблицы
function renderTableHtml(table) {
    if (!table) return "";
    const headers = Array.isArray(table.headers) ? table.headers : [];
    const rows = Array.isArray(table.rows) ? table.rows : [];
    const title = String(table.title || "").trim();
    
    let html = '<div class="table-widget-container">';
    if (title) {
        html += `<div class="table-widget-title">${escapeHtml(title)}</div>`;
    }
    html += '<div class="table-widget-scroll"><table class="table-widget">';
    
    if (headers.length) {
        html += '<thead><tr>';
        headers.forEach(h => {
            html += `<th>${escapeHtml(h)}</th>`;
        });
        html += '</tr></thead>';
    }
    
    if (rows.length) {
        html += '<tbody>';
        rows.forEach(row => {
            html += '<tr>';
            const cols = Array.isArray(row) ? row : [];
            const colCount = Math.max(headers.length, cols.length);
            for (let i = 0; i < colCount; i++) {
                html += `<td>${escapeHtml(cols[i] ?? "")}</td>`;
            }
            html += '</tr>';
        });
        html += '</tbody>';
    }
    
    html += '</table></div></div>';
    return html;
}

// Рендеринг текста ассистента с подстановкой таблиц
function renderAssistantReply(text, tables = null) {
    // Ваша стандартная функция рендеринга Markdown/текста
    let html = renderMarkdownToHtml(text); 
    
    if (Array.isArray(tables) && tables.length) {
        // Заменяем [table:idx] на сгенерированный HTML
        html = html.replace(/\[table:(\d+)\]/g, (match, idxStr) => {
            const tableIdx = parseInt(idxStr, 10);
            const table = tables[tableIdx];
            if (!table) return match;
            return renderTableHtml(table);
        });
    }
    
    return html;
}
```

---

## 4. Реализация на Flutter (Dart)

Для мобильного приложения во Flutter рекомендуется разделять текстовые параграфы и таблицы на отдельные нативные виджеты. Это предотвращает проблемы со скроллингом и обеспечивает отличный UX.

### Структура моделей данных в Dart:

```dart
class SmartAgentTable {
  final String title;
  final List<String> headers;
  final List<List<String>> rows;

  SmartAgentTable({
    required this.title,
    required this.headers,
    required this.rows,
  });

  factory SmartAgentTable.fromJson(Map<String, dynamic> json) {
    var headersJson = json['headers'] as List? ?? [];
    var rowsJson = json['rows'] as List? ?? [];
    
    return SmartAgentTable(
      title: json['title'] ?? '',
      headers: headersJson.map((e) => e.toString()).toList(),
      rows: rowsJson.map((row) => (row as List).map((e) => e.toString()).toList()).toList(),
    );
  }
}
```

### Виджет разбора текста и рендеринга:

```dart
import 'package:flutter/material.dart';

class AssistantMessageWidget extends StatelessWidget {
  final String replyText;
  final List<SmartAgentTable>? tables;

  const AssistantMessageWidget({
    Key? key,
    required this.replyText,
    this.tables,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Регулярное выражение для поиска плейсхолдеров таблиц
    final tableRegex = RegExp(r'\[table:(\d+)\]');
    
    // Делим текст на блоки
    final List<Widget> children = [];
    int lastMatchEnd = 0;

    for (final match in tableRegex.allMatches(replyText)) {
      // 1. Добавляем текст до таблицы
      if (match.start > lastMatchEnd) {
        final textBlock = replyText.substring(lastMatchEnd, match.start).trim();
        if (textBlock.isNotEmpty) {
          children.add(Text(textBlock, style: const TextStyle(fontSize: 15, height: 1.5)));
        }
      }

      // 2. Рендерим саму таблицу
      final tableIdx = int.parse(match.group(1)!);
      if (tables != null && tableIdx < tables!.length) {
        children.add(
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12.0),
            child: NativeTableWidget(table: tables![tableIdx]),
          ),
        );
      }

      lastMatchEnd = match.end;
    }

    // 3. Добавляем оставшийся текст после последней таблицы
    if (lastMatchEnd < replyText.length) {
      final remainingText = replyText.substring(lastMatchEnd).trim();
      if (remainingText.isNotEmpty) {
        children.add(Text(remainingText, style: const TextStyle(fontSize: 15, height: 1.5)));
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: children.isEmpty 
        ? [Text(replyText, style: const TextStyle(fontSize: 15, height: 1.5))]
        : children,
    );
  }
}
```

### Нативный Flutter виджет Таблицы (`NativeTableWidget`):

```dart
class NativeTableWidget extends StatelessWidget {
  final SmartAgentTable table;

  const NativeTableWidget({Key? key, required this.table}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.slate.withOpacity(0.08),
        border: Border.all(color: Colors.slate.withOpacity(0.2)),
        borderRadius: BorderRadius.circular(12),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Заголовок таблицы (если есть)
          if (table.title.trim().isNotEmpty)
            Container(
              padding: const EdgeInsets.all(12),
              color: Colors.slate.withOpacity(0.15),
              border: Border(bottom: BorderSide(color: Colors.slate.withOpacity(0.2))),
              child: Text(
                table.title,
                style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white70),
              ),
            ),
          // Горизонтальный скролл на случай широкой таблицы
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              headingRowColor: MaterialStateProperty.all(Colors.slate.withOpacity(0.05)),
              columns: table.headers.map((header) {
                return DataColumn(
                  label: Text(
                    header,
                    style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.blueGrey),
                  ),
                );
              }).toList(),
              rows: table.rows.map((row) {
                return DataRow(
                  cells: row.map((cell) {
                    return DataCell(
                      Text(cell, style: const TextStyle(color: Colors.white90)),
                    );
                  }).toList(),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}
```
