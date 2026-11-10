import test from 'node:test';
import assert from 'node:assert/strict';
import { readNotebookSelection, persistNotebookSelection, normalizeAssistantMarkdown, normalizeMarkdownTables, parseNotebookCitation, cleanQuizOption } from '../src/presentation/pages/alemdrive/drive-src/utils/notebookResearch.js';

test('observed model answer marks do not reveal the quiz key', () => {
    assert.equal(cleanQuizOption('C) 920\u202f000 ✔'), 'C) 920\u202f000');
    assert.equal(cleanQuizOption('B) **Борис Проверочный** ✅ (правильный ответ)'), 'B) Борис Проверочный');
    assert.equal(cleanQuizOption('A) √4 = 2'), 'A) √4 = 2');
});

const memoryStorage = () => {
    const values = new Map();
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('deselecting survives reload without changing the attached pool', () => {
    const storage = memoryStorage();
    const attached = ['a', 'b'];
    assert.deepEqual([...readNotebookSelection(storage, 'chat-a', attached)], attached);
    persistNotebookSelection(storage, 'chat-a', new Set(['a']));
    assert.deepEqual([...readNotebookSelection(storage, 'chat-a', attached)], ['a']);
    assert.deepEqual(attached, ['a', 'b']);
    persistNotebookSelection(storage, 'chat-a', new Set());
    assert.equal(readNotebookSelection(storage, 'chat-a', attached).size, 0);
    assert.deepEqual([...readNotebookSelection(storage, 'chat-b', attached)], attached);
});

test('removed or foreign source ids are never restored as active', () => {
    const storage = memoryStorage();
    persistNotebookSelection(storage, 'chat-a', new Set(['a', 'b', 'foreign']));
    assert.deepEqual([...readNotebookSelection(storage, 'chat-a', ['b'])], ['b']);
    storage.setItem('notebook_active_sources:chat-a', 'not JSON');
    assert.deepEqual([...readNotebookSelection(storage, 'chat-a', ['b'])], ['b']);
});

test('empty table cells retain their column positions', () => {
    const table = '| Категория | Количество | Цена | Сумма |\n| --- | --- | --- | --- |\n| Комплекты | | | 580000 |\n| Резерв ||| 100000 |';
    assert.equal(normalizeMarkdownTables(table), table);
});

test('blank lines between table rows are repaired without touching fenced source code', () => {
    const text = '| А | Б |\n| --- | --- |\n\n| 1 | 2 |\n\n```mermaid\nA["a|b"]\n\n| c | d |\n\n| e | f |\n```';
    const expected = '| А | Б |\n| --- | --- |\n| 1 | 2 |\n\n```mermaid\nA["a|b"]\n\n| c | d |\n\n| e | f |\n```';
    assert.equal(normalizeMarkdownTables(text), expected);
});

test('escaped pipes in table values are preserved', () => {
    const table = '| Источник | Цитата |\n| --- | --- |\n| a.txt | x \\| y |';
    assert.equal(normalizeMarkdownTables(table), table);
});

test('observed model line breaks stay inside their table cells', () => {
    const table = '| File | Codes | Empty |\n| --- | --- | --- |\n| a.docx | first [a](/a) <br>last [b](/b) &lt;br/&gt; third ||';
    const expected = '| File | Codes | Empty |\n| --- | --- | --- |\n| a.docx | first [a](/a) ; last [b](/b) ;  third ||';
    assert.equal(normalizeMarkdownTables(normalizeAssistantMarkdown(table)), expected);
    const code = '```html\n| x | <br> |\n```\n~~~html\n<br>\n~~~';
    assert.equal(normalizeAssistantMarkdown(code), code);
    assert.equal(normalizeAssistantMarkdown('first<br>second'), 'first\n\nsecond');
});

test('only bounded internal citation URLs can open a source preview', () => {
    const chat = '5d696e49-9941-4f78-9b76-38b31416154d';
    const file = '03561fee-1ffa-4605-97ec-8058439eb4ce';
    const href = `/web/drive/notebook?chat=${chat}&source=${file}&start_line=2&end_line=5`;
    assert.deepEqual(parseNotebookCitation(href), { chatId: chat, fileId: file, start: 2, end: 5 });
    assert.equal(parseNotebookCitation('https://evil.example' + href), null);
    assert.equal(parseNotebookCitation(href.replace('start_line=2', 'start_line=0')), null);
    assert.equal(parseNotebookCitation(href.replace('end_line=5', 'end_line=99999')), null);
    assert.equal(parseNotebookCitation('javascript:alert(1)'), null);
});
