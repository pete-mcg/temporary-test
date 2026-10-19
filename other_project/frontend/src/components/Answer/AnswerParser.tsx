import { AskResponse, Citation } from '../../api';
import { cloneDeep } from 'lodash-es';

type ParsedAnswer = {
    citations: Citation[];
    markdownFormatText: string;
    unreferencedCitations: Citation[];
};

const enumerateCitations = (citations: Citation[]) => {
    const filepathMap = new Map();
    for (const citation of citations) {
        const { filepath } = citation;
        let part_i = 1;
        if (filepathMap.has(filepath)) {
            part_i = filepathMap.get(filepath) + 1;
        }
        filepathMap.set(filepath, part_i);
        citation.part_index = part_i;
    }
    return citations;
};

export function parseAnswer(answer: AskResponse): ParsedAnswer {
    let allRetrievedDocs = answer.allRetrievedDocs;
    let citations = answer.citations;

    citations.forEach((citation) => {
        const currentTitle = citation.title;
        if (!currentTitle) return;

        // Filter AllRetrievedDocs to find relevant objects for the current title without filter_reason
        const relevantDocs = allRetrievedDocs.filter((doc) => doc.title === currentTitle && !doc.filter_reason);

        const filteredDocs = relevantDocs.filter((doc) => doc.original_search_score < 1);
        const maxSearchScore =
            filteredDocs.length > 0
                ? filteredDocs.reduce((max, doc) => {
                      return doc.original_search_score > max ? doc.original_search_score : max;
                  }, 0)
                : null;

        if (maxSearchScore != null) {
            const MaxSearchScorePercent = maxSearchScore * 100;
            const RoundedMaxSearchScorePercent = parseFloat(MaxSearchScorePercent.toFixed(0));
            citation.search_score = RoundedMaxSearchScorePercent;
        }

        const maxRerankScore = relevantDocs.reduce((max, doc) => {
            return doc.rerank_score > max ? doc.rerank_score : max;
        }, 0);

        const roundedMaxRerankScore = parseFloat(maxRerankScore.toFixed(3));
        citation.rerank_score = roundedMaxRerankScore;
    });

    let answerText = answer.answer;
    const citationLinks = answerText.match(/\[(doc\d\d?\d?)]/g);

    const lengthDocN = '[doc'.length;

    let filteredCitations = [] as Citation[];
    let citationReindex = 0;
    citationLinks?.forEach((link) => {
        // Replacing the links/citations with number
        let citationIndex = link.slice(lengthDocN, link.length - 1);
        let citation = cloneDeep(answer.citations[Number(citationIndex) - 1]) as Citation;
        if (!filteredCitations.find((c) => c.id === citationIndex) && citation) {
            answerText = answerText.replaceAll(link, ` ^${++citationReindex}^ `);
            citation.id = citationIndex; // original doc index to de-dupe
            citation.reindex_id = citationReindex.toString(); // reindex from 1 for display
            filteredCitations.push(citation);
        }
    });

    filteredCitations = enumerateCitations(filteredCitations);

    const filteredCitationIds = filteredCitations.map((citation) => citation.id);

    // Create a new array of citations called UnreferencedCitations which contains citations that are not included in filteredCitations / not referenced in the answer
    const UnreferencedCitations = answer.citations.filter((_, index) => !filteredCitationIds.includes((index + 1).toString()));

    return {
        citations: filteredCitations,
        markdownFormatText: answerText,
        unreferencedCitations: UnreferencedCitations, // Additional Documents
    };
}
