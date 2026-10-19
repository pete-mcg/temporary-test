export type ErrorCode = 'SESSION_EXPIRED' | 'RATE_LIMIT' | 'CONTENT_FILTER' | 'GATEWAY_TIMEOUT' | 'UNKNOWN';

const ERROR_INSTRUCTIONS: Record<ErrorCode, string> = {
    SESSION_EXPIRED: 'Error 401 - Your session has expired. Please refresh the page to log back in',
    RATE_LIMIT: 'Error 429 - The service is experiencing high demand. Please try again in a few minutes',
    CONTENT_FILTER: 'Content filter triggered - Inappropriate content was detected. Please modify your input and try again',
    GATEWAY_TIMEOUT: 'Error 504 - The request timed out. This conversation may be too long. Please refresh the chat and try again',
    UNKNOWN: 'An unexpected error occurred. Please try again',
};

const FEEDBACK_SUFFIX = 'If the problem persists, please use the feedback form to raise a performance related issue providing the details of your query and the resulting error.';

export function detectErrorCode(statusOrMessage: number | string): ErrorCode {
    if (typeof statusOrMessage === 'number') {
        if (statusOrMessage === 401) return 'SESSION_EXPIRED';
        if (statusOrMessage === 429) return 'RATE_LIMIT';
        if (statusOrMessage === 504) return 'GATEWAY_TIMEOUT';
        return 'UNKNOWN';
    }
    const msg = statusOrMessage;
    if (msg.includes('User is not authenticated') || msg === '401') return 'SESSION_EXPIRED';
    if (msg.includes('429') || msg.includes('Rate limit')) return 'RATE_LIMIT';
    if (msg.includes('ResponsibleAIPolicyViolation') || msg.includes('content_filter_result')) return 'CONTENT_FILTER';
    if (msg.includes('504 Gateway Time-out')) return 'GATEWAY_TIMEOUT';
    return 'UNKNOWN';
}

/** Build a user-facing error message from first status codes/error string identified. Falls back to UNKNOWN. */
export function buildErrorMessage(...sources: (number | string | undefined | null)[]): string {
    for (const source of sources) {
        if (source == null) continue;
        const code = detectErrorCode(source);
        if (code !== 'UNKNOWN') {
            return `The tool could not receive a response to your query. ${ERROR_INSTRUCTIONS[code]}. ${FEEDBACK_SUFFIX}`;
        }
    }
    return `The tool could not receive a response to your query. ${ERROR_INSTRUCTIONS['UNKNOWN']}. ${FEEDBACK_SUFFIX}`;
}

/** For 401 errors there should be no retry button available. */
export function isRetryableError(errorContent: string): boolean {
    return !errorContent.includes('Error 401');
}
