import { Secretariat } from '../pages/UserManagement/SecretariatList';

export type AskResponse = {
    answer: string;
    citations: Citation[];
    allRetrievedDocs: AllRetrievedDocs[];
    citationInAnswer?: boolean;
    error?: string;
    message_id?: string;
    feedback?: Feedback;
};

export type Citation = {
    part_index?: number;
    search_score?: number;
    rerank_score?: number;
    content: string;
    id: string;
    title: string | undefined;
    filepath: string | undefined;
    url: string | null;
    metadata: string | null;
    chunk_id: string | null;
    reindex_id: string | null;
};

export type AllRetrievedDocs = {
    filter_reason?: string;
    content: string;
    data_source_index: number;
    original_search_score: number;
    rerank_score: number;
    search_queries: string[];
    title: string;
};

export type ToolMessageContent = {
    citations: Citation[];
    intent: string;
    all_retrieved_documents: AllRetrievedDocs[];
};

export type ChatMessage = {
    id: string;
    role: string;
    content: string;
    error_message?: string;
    end_turn?: boolean;
    date: string;
    feedback?: Feedback;
    context?: string;
};

export type Conversation = {
    id: string;
    title: string;
    messages: ChatMessage[];
    date: string;
};

export enum ChatCompletionType {
    ChatCompletion = 'chat.completion',
    ChatCompletionChunk = 'chat.completion.chunk',
}

export type ChatResponseChoice = {
    messages: ChatMessage[];
};

export type ChatResponse = {
    id: string;
    model: string;
    created: number;
    object: ChatCompletionType;
    choices: ChatResponseChoice[];
    history_metadata: {
        conversation_id: string;
        title: string;
        date: string;
    };
    error?: any;
    conversation_id?: string;
    message_id?: string;
};

export type ConversationRequest = {
    messages: ChatMessage[];
};

export type UserInfo = {
    access_token: string;
    expires_on: string;
    id_token: string;
    provider_name: string;
    user_claims: any[];
    user_id: string;
};

export enum Role {
    Admin = 'ADMIN',
    Normal = 'NORMAL',
    Blocked = 'BLOCKED',
}

export type UserAccess = {
    user_id: string;
    secretariat: Secretariat;
    role: Role;
};

export type UserAuthStatus = {
    success: boolean;
    error?: string;
    statusCode: number;
};

export type UserLoginResponse = {
    success: boolean;
    error?: string;
    url?: string;
};

export enum CosmosDBStatus {
    NotConfigured = 'CosmosDB is not configured',
    NotWorking = 'CosmosDB is not working',
    InvalidCredentials = 'CosmosDB has invalid credentials',
    InvalidDatabase = 'Invalid CosmosDB database name',
    InvalidContainer = 'Invalid CosmosDB container name',
    Working = 'CosmosDB is configured and working',
}

export type CosmosDBHealth = {
    cosmosDB: boolean;
    status: string;
};

export enum ChatHistoryLoadingState {
    Loading = 'loading',
    Success = 'success',
    Fail = 'fail',
    NotStarted = 'notStarted',
}

export type ErrorMessage = {
    title: string;
    subtitle: string;
};

export type UI = {
    chat_title: string;
    logo?: string;
    show_share_button?: boolean;
    show_history?: boolean;
    show_feedback?: boolean;
    show_additional_docs?: boolean;
    user_guidance_link?: string;
    version?: string;
    hash?: string;
};

export type SearchModeConfig = {
    top_k: number;
    strictness: number;
};

export type SearchConfig = {
    related_responses: SearchModeConfig;
    policy_and_guidance: SearchModeConfig;
    evaluate_draft: SearchModeConfig;
    ask_anything: SearchModeConfig;
};

export type FrontendSettings = {
    feedback_enabled?: string | null;
    azure_storage_container_name?: string | null;
    ui?: UI;
    hasAcceptedTerms: boolean;
    azure_search_score_threshold_find_all?: string;
    search_config: SearchConfig;
};

export enum Feedback {
    Neutral = 'neutral',
    Positive = 'positive',
    Negative = 'negative',
    MissingCitation = 'missing_citation',
    WrongCitation = 'wrong_citation',
    OutOfScope = 'out_of_scope',
    InaccurateOrIrrelevant = 'inaccurate_or_irrelevant',
    OtherUnhelpful = 'other_unhelpful',
    HateSpeech = 'hate_speech',
    Violent = 'violent',
    Sexual = 'sexual',
    Manipulative = 'manipulative',
    OtherHarmful = 'other_harmlful',
}

export type DatabaseInfo = {
    lastRefresh?: string | null;
    documentList?: string[] | null;
};

export const caseTypes = ['FOI', 'PQLO', 'PQLW', 'PQN', 'PQO', 'PQW'];

export const pqCaseTypes = ['PQLO', 'PQLW', 'PQN', 'PQO', 'PQW'];

// Removed: allCaseTypes - replaced by metadataCaseTypes for metadata search
// Removed: AllCaseType, AllCaseTypePayload - stale types no longer used

export const metadataCaseTypes = ['FOI', 'PQ', 'MC', 'TO'];

export type CaseType = (typeof caseTypes)[number];

export type MetadataCaseType = (typeof metadataCaseTypes)[number];

export type CaseTypePayload = {
    [key in CaseType]: boolean;
};

export type MetadataCaseTypePayload = {
    [key in MetadataCaseType]: boolean;
};

export interface Filters {
    casetypes: CaseTypePayload;
    monthsCutoff: number | null;
}

export interface MetadataFilters {
    casetypes: MetadataCaseTypePayload;
    monthsCutoff: number | null;
}

export enum Mode {
    relatedResponses = 'related_responses',
    metadataSearch = 'metadata_search',
    informationAnnex = 'information_annex',
    evaluateDraft = 'evaluate_draft',
    policyAndGuidance = 'policy_and_guidance',
    askAnything = 'ask_anything',
}

export type Metadata = {
    '@search.score': number;
    case_ref: string | null;
    reporting_team: string | null;
    date_received: string | null;
    latest_drafter: string | null;
    member_of_parliament: string | null;
    internal_review: string | null;
};

export type CaseMetadata = {
    case_ref: string | null;
    case_type: string | null;
    case_title: string | null;
    date_received: string | null;
    latest_drafter: string | null;
    reporting_team: string | null;
    team: string | null;
    member_of_parliament: string | null;
    internal_review: string | null;
    year: string | null;
    '@search.score'?: number;
    '@search.reranker_score'?: number;
};

export type MetadataResponse = {
    grouped_metadata: { [caseType: string]: CaseMetadata[] };
    raw_error_messages: string[];
    public_error_messages: string[];
    history_metadata?: {
        conversation_id: string;
        title: string;
        date: string;
    };
};

export const modes = [
    {
        mode: Mode.relatedResponses,
        title: 'Find and Summarise Related PQs/FOIs',
        icon: 'DocumentSearch',
        tooltip: 'Access related responses for a request or topic, including the teams and drafters involved.',
        placeholder: 'Provide the details or description of the FOI or PQ request you wish to search for.',
        tag: 'Enhanced',
    },
    {
        mode: Mode.metadataSearch,
        title: 'Find Related Responses Across All Case Types',
        icon: 'Table',
        tooltip: 'Search across all case types (FOI, PQ, MC, TO) and retrieve metadata for related cases.',
        placeholder: 'Enter a query to use the intelligent search and find related cases for the selected case types.',
        tag: 'New',
    },
    {
        mode: Mode.informationAnnex,
        title: 'Generate Information Annex (MP Profile)',
        icon: 'ContactInfo',
        tooltip: 'Generate an information annex for a Member of Parliament, providing background data and analysis relevant to their question.',
        placeholder: '',
        tag: 'New',
    },
    {
        mode: Mode.evaluateDraft,
        title: 'Evaluate a Draft',
        icon: 'CheckboxComposite',
        tooltip: 'This feature is under review, use cautiously. Check your draft against best practices.',
        placeholder: 'Paste the full draft you wish to evaluate.',
    },
    {
        mode: Mode.policyAndGuidance,
        title: 'Policy & Drafting Guidance',
        icon: 'EntitlementPolicy',
        tooltip: 'Ask targeted questions for policy or drafting guidance, for example FOI act, exemptions, processes and templates.',
        placeholder: 'Ask a question about policy or drafting guidance.',
    },
    {
        mode: Mode.askAnything,
        title: 'Ask Anything',
        icon: 'CannedChat',
        tooltip: 'Ensure you are familiar with how to prompt AI chatbots or select one of the other tasks. Input queries on any topic related to FOI and PQ historical knowledge base.',
        placeholder: 'Enter any query related to historical FOI, PQ requests or guidance.',
    },
];

export type AnnexMpOption = {
    name_list: string;
    member_id: number;
};

export type AnnexResponse = {
    answer: string;
    conversation_id: string | null;
    message_id: string;
};

export enum IrisRoute {
    MAIN = '/',
    AUTHORISE = '/authorise',
    DENIED = '/denied',
    ADMIN_USERS = '/admin/users',
}
