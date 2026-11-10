import { generateTwoSlidesPresentation, getTwoSlidesJob, searchTwoSlidesThemes } from './twoSlides';

export const SLIDE_PROVIDER_TWOSLIDES = '2slides';

export async function generateSlidesWithProvider(provider, payload) {
    if (provider === SLIDE_PROVIDER_TWOSLIDES) {
        return generateTwoSlidesPresentation(payload);
    }
    throw new Error(`generateSlidesWithProvider: provider "${provider}" is not supported`);
}

export async function getSlidesJobWithProvider(provider, jobId) {
    if (provider === SLIDE_PROVIDER_TWOSLIDES) {
        return getTwoSlidesJob(jobId);
    }
    throw new Error(`getSlidesJobWithProvider: provider "${provider}" does not support jobs`);
}

export async function searchSlideThemesWithProvider(provider, query, limit = 20) {
    if (provider === SLIDE_PROVIDER_TWOSLIDES) {
        return searchTwoSlidesThemes(query, limit);
    }
    throw new Error(`searchSlideThemesWithProvider: provider "${provider}" does not support theme search`);
}
