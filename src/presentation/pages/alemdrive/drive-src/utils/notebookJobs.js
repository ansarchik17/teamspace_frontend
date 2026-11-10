// Background Deep Research jobs: POST /ask/jobs, then GET until the job ends.
// A backend without jobs (404) falls back to the synchronous /ask.

export const NOTEBOOK_JOB_STORAGE_PREFIX = 'notebook_active_job:';

const STAGE_KEYS = new Set(['queued', 'reading', 'answering', 'verifying']);

// Translation key (under drive:notebookJobs.progress) and params for a stage.
export function notebookJobProgressKey(progress) {
    if (progress?.stage === 'analyzing') {
        return progress.chunks_total > 0
            ? { key: 'analyzing', params: { done: progress.chunks_done, total: progress.chunks_total } }
            : { key: 'analyzingUnknown', params: {} };
    }
    return { key: STAGE_KEYS.has(progress?.stage) ? progress.stage : 'default', params: {} };
}

export function newOperationId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// PostgreSQL rejects U+0000; the backend answers 400 for it.
export function stripNul(value) {
    return typeof value === 'string' ? value.replace(/\u0000/g, '') : value;
}

export function storeActiveJob(storage, chatId, job) {
    try {
        storage?.setItem(NOTEBOOK_JOB_STORAGE_PREFIX + chatId, JSON.stringify(job));
    } catch {
        // storage is a convenience only
    }
}

export function readActiveJob(storage, chatId) {
    try {
        const raw = storage?.getItem(NOTEBOOK_JOB_STORAGE_PREFIX + chatId);
        const job = raw ? JSON.parse(raw) : null;
        return job?.job_id ? job : null;
    } catch {
        return null;
    }
}

export function clearActiveJob(storage, chatId) {
    try {
        storage?.removeItem(NOTEBOOK_JOB_STORAGE_PREFIX + chatId);
    } catch {
        // ignore
    }
}

// A failed job carries the response the synchronous /ask would have given;
// shape it like an axios error so one handler serves both routes.
export function notebookJobError(job) {
    const jobError = job?.error || {};
    const error = new Error(jobError.message || 'notebook research job failed');
    if (!jobError.message) error.i18nKey = 'errors.jobFailed';
    error.response = { status: jobError.http_status || 500, data: jobError.body || { error: { code: jobError.code, message: jobError.message } } };
    error.code = jobError.code;
    return error;
}

function abortError() {
    const error = new Error('notebook research request stopped');
    error.name = 'AbortError';
    return error;
}

function sleepFor(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(abortError());
            return;
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(abortError());
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

// Abort reason used by the Stop button. Any other abort (leaving the
// notebook, unmount) only stops waiting: the job keeps running and is
// resumed from storage later.
export const NOTEBOOK_STOP_REASON = 'notebook-stop';

const isTerminal = (job) => job?.status === 'done' || job?.status === 'failed' || job?.status === 'cancelled';

// waitForNotebookJob polls one job until done/failed/cancelled.
export async function waitForNotebookJob({ api, chatId, job, signal, onProgress, sleep = sleepFor, storage }) {
    let current = job;
    let delay = 1000;
    let failures = 0;
    try {
        for (;;) {
            onProgress?.(current);
            if (current.status === 'done') return current.result;
            if (current.status === 'failed') throw notebookJobError(current);
            if (current.status === 'cancelled') throw abortError();
            await sleep(delay, signal);
            delay = Math.min(Math.round(delay * 1.5), 5000);
            try {
                current = await api.getJob(chatId, current.job_id, signal);
                failures = 0;
            } catch (error) {
                if (signal?.aborted) throw abortError();
                if (error?.response?.status === 404) {
                    clearActiveJob(storage, chatId);
                    throw error;
                }
                // Transient network or gateway errors: keep polling for a while.
                failures += 1;
                if (failures >= 5) throw error;
            }
        }
    } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') {
            if (signal?.reason === NOTEBOOK_STOP_REASON) {
                clearActiveJob(storage, chatId);
                if (!isTerminal(current)) await api.cancelJob(chatId, current.job_id).catch(() => {});
            }
            throw abortError();
        }
        throw error;
    } finally {
        if (isTerminal(current)) clearActiveJob(storage, chatId);
    }
}

// runNotebookResearch starts a background job and returns the /ask response.
// Without job support it calls the synchronous /ask with the same payload.
// 409 (the user already has an unfinished job) is rethrown with activeJob, so
// the UI can show that job instead of starting a second paid analysis.
export async function runNotebookResearch({ api, chatId, payload, signal, onProgress, sleep, storage }) {
    const body = { ...payload, operation_id: payload.operation_id || newOperationId() };
    let job;
    try {
        job = await api.createJob(chatId, body, signal);
    } catch (error) {
        const status = error?.response?.status;
        if (status === 404 || status === 405) {
            return api.ask(chatId, body, signal);
        }
        const details = error?.response?.data?.error?.details;
        if (status === 409 && details?.job_id) {
            const sameChat = !details.chat_id || details.chat_id === chatId;
            const conflict = new Error('notebook research job already running');
            conflict.i18nKey = sameChat ? 'errors.activeJobSameChat' : 'errors.activeJobOtherChat';
            conflict.response = error.response;
            conflict.activeJob = { job_id: details.job_id, chat_id: details.chat_id || chatId, sameChat };
            throw conflict;
        }
        throw error;
    }
    storeActiveJob(storage, chatId, { job_id: job.job_id, operation_id: job.operation_id, question: payload.question || '' });
    return waitForNotebookJob({ api, chatId, job, signal, onProgress, sleep, storage });
}
