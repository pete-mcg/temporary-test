const CASE_REFERENCE_PATTERNS = [
    /\bFOI\d{4}\/\d{5}\b/g,
    /\bMC\d{4}\/\d{5}\b/g,
    /\bMCSOS\d{4}\/\d{5}\b/g,
    /\bPOA\d{4}\/\d{5}\b/g,
    /\bTO\d{4}\/\d{5}\b/g,
    /\bPQW\d{4}\/\d{5}\b/g,
    /\bPQO\d{4}\/\d{5}\b/g,
    /\bPQN\d{4}\/\d{5}\b/g,
    /\bPQLW\d{4}\/\d{5}\b/g,
    /\bPQLO\d{4}\/\d{5}\b/g,
    /\bPQW\/\d{2}-\d{2}\/\d{4}\/\d{5}\b/g,
    /\bPQO\/\d{2}-\d{2}\/\d{4}\/\d{5}\b/g,
    /\bPQN\/\d{2}-\d{2}\/\d{4}\/\d{5}\b/g,
    /\bPQLW\/\d{2}-\d{2}\/\d{4}\/\d{5}\b/g,
    /\bPQLO\/\d{2}-\d{2}\/\d{4}\/\d{5}\b/g,
];

const BASE_URL = 'https://mod.ecase.co.uk/view_case?case_ref=';

export function linkCaseReferences(text: string): string {
    for (const pattern of CASE_REFERENCE_PATTERNS) {
        text = text.replace(pattern, (match) => {
            const encodedRef = encodeURIComponent(match);
            return `[${match}](${BASE_URL}${encodedRef})`;
        });
    }
    return text;
}
