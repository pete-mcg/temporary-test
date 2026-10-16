export type AskResponse = {
    answer: string;
    citations: Citation[];
    citationInAnswer?: boolean;
    error?: string;
    message_id?: string;
    feedback?: Feedback;
};

export type Citation = {
    part_index?: number;
    content: string;
    id: string;
    title: string | null;
    filepath: string | undefined;
    url: string | null;
    metadata: string | null;
    chunk_id: string | null;
    reindex_id: string | null;
}

export type ToolMessageContent = {
    citations: Citation[];
    intent: string;
}

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
}

export enum ChatCompletionType {
    ChatCompletion = "chat.completion",
    ChatCompletionChunk = "chat.completion.chunk"
}

export type ChatResponseChoice = {
    messages: ChatMessage[];
}

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
    }
    error?: any;
}

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

export type UserAuthStatus = {
    success: boolean;
    error?: string;
}

export type UserLoginResponse = {
    success: boolean;
    error?: string;
    url?: string;
}

export enum CosmosDBStatus {
    NotConfigured = "CosmosDB is not configured",
    NotWorking = "CosmosDB is not working",
    InvalidCredentials = "CosmosDB has invalid credentials",
    InvalidDatabase = "Invalid CosmosDB database name",
    InvalidContainer = "Invalid CosmosDB container name",
    Working = "CosmosDB is configured and working",
}

export type CosmosDBHealth = {
    cosmosDB: boolean,
    status: string
}

export enum ChatHistoryLoadingState {
    Loading = "loading",
    Success = "success",
    Fail = "fail",
    NotStarted = "notStarted"
}

export type ErrorMessage = {
    title: string,
    subtitle: string
}

export type UI = {
    title: string;
    knowledge_base: string;
    chat_title: string;
    chat_description: string;
    default_system_message: string;
    logo?: string;
    chat_logo?: string;
    show_share_button?: boolean;
    show_history?: boolean;
    show_settings?: boolean;
    show_feedback?: boolean;
    show_editable_system_message?: boolean;
    show_tour?: boolean;
    example_prompt_1: string;
    example_prompt_title_1: string;
    example_prompt_icon_1: string;
    example_prompt_2: string;
    example_prompt_title_2: string;
    example_prompt_icon_2: string;
    example_prompt_3: string;
    example_prompt_title_3: string;
    example_prompt_icon_3: string;
    storage_account_name: string;
}

export type FrontendSettings = {
    feedback_enabled?: string | null;
    ui?: UI;
}

export enum Feedback {
    Neutral = "neutral",
    Positive = "positive",
    Negative = "negative",
    MissingCitation = "missing_citation",
    WrongCitation = "wrong_citation",
    OutOfScope = "out_of_scope",
    InaccurateOrIrrelevant = "inaccurate_or_irrelevant",
    OtherUnhelpful = "other_unhelpful",
    HateSpeech = "hate_speech",
    Violent = "violent",
    Sexual = "sexual",
    Manipulative = "manipulative",
    OtherHarmful = "other_harmlful"
}

export type DatabaseInfo = {
    lastRefresh?: string | null;
    documentList?: string[] | null;
}

export const models = [
    'GPT35TURBO',
    'GPT4',
]

export type Model = typeof models[number];

export type ModelPayload = {
    [key in Model]: boolean;
}

export interface Settings {
    models: ModelPayload;
    temperature: number;
    systemMessage: string | undefined;
}