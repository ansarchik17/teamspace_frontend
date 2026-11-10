import client from './client';

/**
 * kind:
 * - fast_ppt: requires themeId
 * - pdf_slides: custom-designed slides from text
 * - like_this: requires referenceImageUrl
 */
export async function generateTwoSlidesPresentation(payload) {
    const res = await client.post('/notebook/slides/2slides/generate', payload);
    return res.data;
}

export async function getTwoSlidesJob(jobId) {
    if (!jobId) throw new Error('getTwoSlidesJob: jobId is required');
    const res = await client.get(`/notebook/slides/2slides/jobs/${jobId}`);
    return res.data;
}

export async function searchTwoSlidesThemes(query, limit = 20) {
    if (!query) throw new Error('searchTwoSlidesThemes: query is required');
    const res = await client.get('/notebook/slides/2slides/themes/search', {
        params: { query, limit },
    });
    return res.data;
}
