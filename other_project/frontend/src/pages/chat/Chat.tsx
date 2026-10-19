import { useRef, useState, useEffect, useContext, useLayoutEffect } from 'react';
import { CommandBarButton, IconButton, Dialog, DialogType, Stack, TooltipHost } from '@fluentui/react';
import { SquareRegular, ShieldLockRegular, ErrorCircleRegular, WarningRegular, DocumentTextRegular } from '@fluentui/react-icons';
import { BannerButton, ReferenceLinkButton, TryAgainButton, RelevanceHelpButton, ModeButton } from '../../components/common/Button';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import uuid from 'react-uuid';
import { isEmpty } from 'lodash-es';
import DOMPurify from 'dompurify';

import styles from './Chat.module.css';
import DES from '../../assets/DES.svg';
import { XSSAllowTags } from '../../constants/xssAllowTags';

import {
    ChatMessage,
    ConversationRequest,
    conversationApi,
    Citation,
    ToolMessageContent,
    ChatResponse,
    Conversation,
    historyGenerate,
    historyUpdate,
    historyClear,
    ChatHistoryLoadingState,
    CosmosDBStatus,
    ErrorMessage,
    getMetadata,
    submitAnnexRequest,
    searchMetadata,
} from '../../api';
import { Answer } from '../../components/Answer';
import { QuestionInput } from '../../components/QuestionInput';
import { ChatHistoryPanel } from '../../components/ChatHistory/ChatHistoryPanel';
import { AppStateContext } from '../../state/AppProvider';
import { useBoolean } from '@fluentui/react-hooks';
import { Mode, Filters, Metadata, modes, CaseMetadata, MetadataResponse, MetadataFilters } from '../../api/models';
import { buildErrorMessage, isRetryableError } from '../../utils/errorHandling';
import MetadataResults from '../../components/MetadataResults/MetadataResults';
import ModeSelector from '../../components/ModeSelector/ModeSelector';
import { WhatToAskPanel } from '../../components/WhatToAskPanel/WhatToAskPanel';
import { DropdownModeSelector } from '../../components/ModeSelector/DropdownModeSelector';
import { useAuth } from '../../state/AuthProvider';
import { getSasUrl } from '../../utils/utils';
import { AnnexDialog } from '../../components/AnnexDialog/AnnexDialog';

const enum messageStatus {
    NotRunning = 'Not Running',
    Processing = 'Processing',
    Done = 'Done',
}

type ChatProps = {
    filters: Filters;
    metadataFilters: MetadataFilters;
    className?: string;
    isCitationPanelOpen: boolean;
    setIsCitationPanelOpen: (isOpen: boolean) => void;
    sidePanelState?: number;
    triggerResponseReceived: () => void;
    showFilterPanel: () => void;
    resetFilters: () => void;
    isFiltersChanged: boolean;
};

const Chat: React.FC<ChatProps> = ({
    filters: settings,
    metadataFilters,
    className,
    isCitationPanelOpen,
    setIsCitationPanelOpen,
    sidePanelState,
    triggerResponseReceived,
    showFilterPanel,
    isFiltersChanged,
    resetFilters,
}) => {
    const appStateContext = useContext(AppStateContext);
    const ui = appStateContext?.state.frontendSettings?.ui;
    const chatMessageStreamEnd = useRef<HTMLDivElement | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [showLandingPage, setShowLandingPage] = useState<boolean>(true);
    const [showLoadingMessage, setShowLoadingMessage] = useState<boolean>(false);
    const [activeCitation, setActiveCitation] = useState<Citation>();
    const abortFuncs = useRef([] as AbortController[]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [processMessages, setProcessMessages] = useState<messageStatus>(messageStatus.NotRunning);
    const [clearingChat, setClearingChat] = useState<boolean>(false);
    const [hideErrorDialog, { toggle: toggleErrorDialog }] = useBoolean(true);
    const [errorMsg, setErrorMsg] = useState<ErrorMessage | null>();
    const [whatToAskVisible, setWhatToAskVisible] = useState(false);
    const document_list = appStateContext?.state.getDatabaseInfo?.documentList;
    const [question, setQuestion] = useState<string>('');
    const inputRef = useRef(null);
    const [metadata, setMetadata] = useState<Metadata | null>(null);
    const [isAnnexDialogOpen, setIsAnnexDialogOpen] = useState(false);
    const [isAnnexSubmitting, setIsAnnexSubmitting] = useState(false);
    const [annexMemberId, setAnnexMemberId] = useState<number | null>(null);
    const [metadataSearchHistory, setMetadataSearchHistory] = useState<
        Array<{
            query: string;
            results: { [caseType: string]: CaseMetadata[] };
            timestamp: Date;
        }>
    >([]);
    const latestMetadataResultRef = useRef<HTMLDivElement | null>(null);
    const defaultQuestionPlaceholder = 'To begin the conversation, select your filters and task mode.';
    const last_refresh_date = appStateContext?.state.getDatabaseInfo?.lastRefresh;
    const questionPlaceholder = () => {
        if (!appStateContext?.state.mode) {
            return defaultQuestionPlaceholder;
        }
        if (appStateContext.state.mode === Mode.informationAnnex) {
            return 'Use the Information Annex dialog to submit your request.';
        }

        return modes.filter((mode) => mode.mode === appStateContext?.state.mode)[0].placeholder;
    };
    const { isAuthenticated } = useAuth();

    const isFiltersDisabled = appStateContext?.state.mode === Mode.policyAndGuidance || appStateContext?.state.mode === Mode.evaluateDraft || appStateContext?.state.mode === Mode.informationAnnex;

    const errorDialogContentProps = {
        type: DialogType.close,
        title: errorMsg?.title,
        closeButtonAriaLabel: 'Close',
        subText: errorMsg?.subtitle,
    };

    const modalProps = {
        titleAriaId: 'labelId',
        subtitleAriaId: 'subTextId',
        isBlocking: true,
        styles: { main: { maxWidth: 450 } },
    };

    const [ASSISTANT, TOOL, ERROR] = ['assistant', 'tool', 'error'];

    useEffect(() => {
        if (
            appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.Working &&
            appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.NotConfigured &&
            appStateContext?.state.chatHistoryLoadingState === ChatHistoryLoadingState.Fail &&
            hideErrorDialog
        ) {
            let subtitle = `${appStateContext.state.isCosmosDBAvailable.status}. Please contact the site administrator.`;
            setErrorMsg({
                title: 'Chat history is not enabled',
                subtitle: subtitle,
            });
            toggleErrorDialog();
        }
    }, [appStateContext?.state.isCosmosDBAvailable, appStateContext?.state.chatHistoryLoadingState, hideErrorDialog, toggleErrorDialog]);

    const handleErrorDialogClose = () => {
        toggleErrorDialog();
        setTimeout(() => {
            setErrorMsg(null);
        }, 500);
    };

    useEffect(() => {
        setIsLoading(appStateContext?.state.chatHistoryLoadingState === ChatHistoryLoadingState.Loading);
    }, [appStateContext?.state.chatHistoryLoadingState]);

    let assistantMessage = {} as ChatMessage;
    let toolMessage = {} as ChatMessage;
    let assistantContent = '';

    const processResultMessage = (resultMessage: ChatMessage, userMessage: ChatMessage, conversationId?: string) => {
        if (resultMessage.role === ASSISTANT) {
            assistantContent += resultMessage.content;
            assistantMessage = resultMessage;
            assistantMessage.content = assistantContent;

            if (resultMessage.context) {
                toolMessage = {
                    id: uuid(),
                    role: TOOL,
                    content: resultMessage.context,
                    date: new Date().toISOString(),
                };
            }
        }

        if (resultMessage.role === TOOL) toolMessage = resultMessage;

        if (!conversationId) {
            isEmpty(toolMessage) ? setMessages([...messages, userMessage, assistantMessage]) : setMessages([...messages, userMessage, toolMessage, assistantMessage]);
        } else {
            isEmpty(toolMessage) ? setMessages([...messages, assistantMessage]) : setMessages([...messages, toolMessage, assistantMessage]);
        }
    };

    const readResponseStream = async (response: Response, userMessage: ChatMessage, conversationId?: string): Promise<ChatResponse> => {
        let result = {} as ChatResponse;
        if (response?.body) {
            const reader = response.body.getReader();

            let runningText = '';
            while (true) {
                setProcessMessages(messageStatus.Processing);
                const { done, value } = await reader.read();
                if (done) break;

                var text = new TextDecoder('utf-8').decode(value);
                const objects = text.split('\n');
                for (const obj of objects) {
                    try {
                        if (obj !== '' && obj !== '{}') {
                            runningText += obj;
                            result = JSON.parse(runningText);
                            if (result.choices?.length > 0) {
                                for (const msg of result.choices[0].messages) {
                                    msg.id = result.id;
                                    msg.date = new Date().toISOString();
                                }
                                if (result.choices[0].messages?.some((m) => m.role === ASSISTANT)) {
                                    setShowLoadingMessage(false);
                                }
                                for (const resultObj of result.choices[0].messages) {
                                    processResultMessage(resultObj, userMessage, conversationId);
                                }
                            } else if (result.error) {
                                throw Error(result.error);
                            }
                            runningText = '';
                        }
                    } catch (e) {
                        if (!(e instanceof SyntaxError)) {
                            console.error(e);
                            throw e;
                        } else {
                            console.log('Incomplete message. Continuing...');
                        }
                    }
                }
            }
        }
        return result;
    };

    const handleMetadataSearch = async (query: string) => {
        setIsLoading(true);
        setShowLoadingMessage(true);
        setShowLandingPage(false);

        try {
            // Get selected case types from metadata filters and expand MC and PQ
            const selectedCaseTypes = Object.entries(metadataFilters.casetypes || {})
                .filter(([_, isSelected]) => isSelected)
                .map(([caseType, _]) => caseType)
                .flatMap((caseType) => {
                    // Expand MC to include MCSOS and POA
                    if (caseType === 'MC') {
                        return ['MC', 'MCSOS', 'POA'];
                    }
                    // Expand PQ to all PQ variants
                    if (caseType === 'PQ') {
                        return ['PQW', 'PQO', 'PQN', 'PQLW', 'PQLO'];
                    }
                    return [caseType];
                });

            if (selectedCaseTypes.length === 0) {
                setErrorMsg({
                    title: 'No case types selected',
                    subtitle: 'Please select at least one case type using the filter button.',
                });
                toggleErrorDialog();
                setIsLoading(false);
                setShowLoadingMessage(false);
                return;
            }

            // Get current conversation ID if it exists
            const conversationId = appStateContext?.state?.currentChat?.id;

            const response = await searchMetadata(query, selectedCaseTypes, metadataFilters.monthsCutoff ?? undefined, 100, conversationId);

            if (!response.ok && response.status === 401) {
                throw new Error('User is not authenticated');
            }
            if (!response.ok) {
                throw new Error(await response.text());
            }

            const data: MetadataResponse = await response.json();

            if (data.public_error_messages && data.public_error_messages.length > 0) {
                setErrorMsg({
                    title: 'Error searching metadata',
                    subtitle: data.public_error_messages.join(', '),
                });
                toggleErrorDialog();
            } else {
                // Add to search history
                setMetadataSearchHistory((prev) => [
                    ...prev,
                    {
                        query,
                        results: data.grouped_metadata,
                        timestamp: new Date(),
                    },
                ]);

                // Update conversation history if history_metadata is present
                if (data.history_metadata && appStateContext?.state.isCosmosDBAvailable.cosmosDB) {
                    let conversation: Conversation;

                    if (conversationId) {
                        // Update existing conversation
                        conversation = appStateContext?.state?.chatHistory?.find((conv) => conv.id === conversationId) || {
                            id: conversationId,
                            title: query,
                            messages: [],
                            date: new Date().toISOString(),
                        };
                    } else {
                        // Create new conversation from history_metadata
                        conversation = {
                            id: data.history_metadata.conversation_id,
                            title: data.history_metadata.title || query,
                            messages: [],
                            date: data.history_metadata.date || new Date().toISOString(),
                        };
                    }

                    // Update current chat in app state
                    appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: conversation });
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : `${error}`;
            setErrorMsg({
                title: 'Error searching metadata',
                subtitle: buildErrorMessage(errorMessage),
            });
            toggleErrorDialog();
        } finally {
            setIsLoading(false);
            setShowLoadingMessage(false);
        }
    };

    const shouldHandleMetadataSearch = async (question: string): Promise<boolean> => {
        if (appStateContext?.state.mode === Mode.metadataSearch) {
            await handleMetadataSearch(question);
            return true;
        }
        return false;
    };

    const makeApiRequestWithoutCosmosDB = async (question: string, conversationId?: string) => {
        if (!appStateContext?.state.mode) {
            console.error('Mode is not selected');
            return;
        }

        if (await shouldHandleMetadataSearch(question)) return;

        setIsLoading(true);
        setShowLoadingMessage(true);
        const abortController = new AbortController();
        abortFuncs.current.unshift(abortController);

        const userMessage: ChatMessage = {
            id: uuid(),
            role: 'user',
            content: question,
            date: new Date().toISOString(),
        };

        let conversation: Conversation | null | undefined;
        if (!conversationId) {
            conversation = {
                id: conversationId ?? uuid(),
                title: question,
                messages: [userMessage],
                date: new Date().toISOString(),
            };
        } else {
            conversation = appStateContext?.state?.currentChat;
            if (!conversation) {
                console.error('Conversation not found.');
                setIsLoading(false);
                setShowLoadingMessage(false);
                abortFuncs.current = abortFuncs.current.filter((a) => a !== abortController);
                return;
            } else {
                conversation.messages.push(userMessage);
            }
        }

        appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: conversation });
        setMessages(conversation.messages);

        const request: ConversationRequest = {
            messages: [...conversation.messages.filter((answer) => answer.role !== ERROR)],
        };

        let result = {} as ChatResponse;
        try {
            const response = await conversationApi(request, abortController.signal, settings, appStateContext?.state.mode);
            if (!response.ok && response.status === 401) {
                throw new Error('User is not authenticated');
            }
            result = await readResponseStream(response, userMessage, conversationId);
            if (response?.body) {
                conversation.messages.push(toolMessage, assistantMessage);
                appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: conversation });
                setMessages([...messages, toolMessage, assistantMessage]);
            }
        } catch (e) {
            if (!abortController.signal.aborted) {
                let errorMessage = `${e}`;
                if (result.error?.message) {
                    errorMessage = result.error.message;
                } else if (typeof result.error === 'string') {
                    errorMessage = result.error;
                }
                const errorUserMessage = buildErrorMessage(errorMessage);
                let errorChatMsg: ChatMessage = {
                    id: uuid(),
                    role: ERROR,
                    content: errorUserMessage,
                    error_message: errorMessage,
                    date: new Date().toISOString(),
                };
                conversation.messages.push(errorChatMsg);
                appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: conversation });
                setMessages([...messages, errorChatMsg]);
            } else {
                setMessages([...messages, userMessage]);
            }
        } finally {
            setIsLoading(false);
            setShowLoadingMessage(false);
            abortFuncs.current = abortFuncs.current.filter((a) => a !== abortController);
            setProcessMessages(messageStatus.Done);
        }

        return abortController.abort();
    };

    const makeApiRequestWithCosmosDB = async (question: string, conversationId?: string) => {
        if (!appStateContext?.state.mode) {
            console.error('Mode is not selected');
            return;
        }

        if (await shouldHandleMetadataSearch(question)) return;

        setIsLoading(true);
        setShowLoadingMessage(true);
        const abortController = new AbortController();
        abortFuncs.current.unshift(abortController);

        const userMessage: ChatMessage = {
            id: uuid(),
            role: 'user',
            content: question,
            date: new Date().toISOString(),
        };

        //api call params set here (generate)
        let request: ConversationRequest;
        let conversation;
        if (conversationId) {
            conversation = appStateContext?.state?.chatHistory?.find((conv) => conv.id === conversationId);
            if (!conversation) {
                console.error('Conversation not found.');
                setIsLoading(false);
                setShowLoadingMessage(false);
                abortFuncs.current = abortFuncs.current.filter((a) => a !== abortController);
                return;
            } else {
                conversation.messages.push(userMessage);
                request = {
                    messages: [...conversation.messages.filter((answer) => answer.role !== ERROR)],
                };
            }
        } else {
            request = {
                messages: [userMessage].filter((answer) => answer.role !== ERROR),
            };
            setMessages(request.messages);
        }
        let result = {} as ChatResponse;
        try {
            const response = conversationId
                ? await historyGenerate(request, abortController.signal, settings, appStateContext?.state.mode, conversationId)
                : await historyGenerate(request, abortController.signal, settings, appStateContext?.state.mode);
            if (!response?.ok) {
                const contentType = response.headers.get('content-type');
                let errorResponseMessage = '';
                let errorResponseMetadata = undefined;

                if (contentType && contentType.indexOf('application/json') !== -1) {
                    const responseJson = await response.json();
                    errorResponseMessage = responseJson.error || '';
                    errorResponseMetadata = responseJson.history_metadata || undefined;
                } else {
                    errorResponseMessage = await response.text();
                }
                const errorResponseUserMessage = buildErrorMessage(response.status, errorResponseMessage);
                let errorChatMsg: ChatMessage = {
                    id: uuid(),
                    role: ERROR,
                    content: errorResponseUserMessage,
                    error_message: errorResponseMessage,
                    date: new Date().toISOString(),
                };
                let resultConversation;
                if (conversationId) {
                    resultConversation = appStateContext?.state?.chatHistory?.find((conv) => conv.id === conversationId);
                    if (!resultConversation) {
                        console.error('Conversation not found.');
                        setIsLoading(false);
                        setShowLoadingMessage(false);
                        abortFuncs.current = abortFuncs.current.filter((a) => a !== abortController);
                        return;
                    }
                    resultConversation.messages.push(errorChatMsg);
                } else {
                    try {
                        if (errorResponseMetadata) {
                            resultConversation = {
                                id: errorResponseMetadata.conversation_id,
                                title: errorResponseMetadata.title,
                                messages: [userMessage],
                                date: errorResponseMetadata.date,
                            };
                            resultConversation.messages.push(errorChatMsg);
                            appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: resultConversation });
                        }
                        setMessages([...messages, userMessage, errorChatMsg]);
                        setIsLoading(false);
                        setShowLoadingMessage(false);
                        abortFuncs.current = abortFuncs.current.filter((a) => a !== abortController);
                        return;
                    } catch (e) {
                        console.error('Error: ', e);
                        return;
                    }
                }
                appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: resultConversation });
                setMessages([...resultConversation.messages]);
                return;
            }
            result = await readResponseStream(response, userMessage, conversationId);
            if (response?.body) {
                let resultConversation;
                if (conversationId) {
                    resultConversation = appStateContext?.state?.chatHistory?.find((conv) => conv.id === conversationId);
                    if (!resultConversation) {
                        console.error('Conversation not found.');
                        setIsLoading(false);
                        setShowLoadingMessage(false);
                        abortFuncs.current = abortFuncs.current.filter((a) => a !== abortController);
                        return;
                    }
                    isEmpty(toolMessage) ? resultConversation.messages.push(assistantMessage) : resultConversation.messages.push(toolMessage, assistantMessage);
                } else {
                    resultConversation = {
                        id: result.history_metadata.conversation_id,
                        title: result.history_metadata.title,
                        messages: [userMessage],
                        date: result.history_metadata.date,
                    };
                    isEmpty(toolMessage) ? resultConversation.messages.push(assistantMessage) : resultConversation.messages.push(toolMessage, assistantMessage);
                }
                if (!resultConversation) {
                    setIsLoading(false);
                    setShowLoadingMessage(false);
                    abortFuncs.current = abortFuncs.current.filter((a) => a !== abortController);
                    return;
                }
                appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: resultConversation });
                isEmpty(toolMessage) ? setMessages([...messages, assistantMessage]) : setMessages([...messages, toolMessage, assistantMessage]);
            }
        } catch (e) {
            if (!abortController.signal.aborted) {
                let errorMessage = `${e}`;
                if (result.error?.message) {
                    errorMessage = result.error.message;
                } else if (typeof result.error === 'string') {
                    errorMessage = result.error;
                }
                const errorUserMessage = buildErrorMessage(errorMessage);
                let errorChatMsg: ChatMessage = {
                    id: uuid(),
                    role: ERROR,
                    content: errorUserMessage,
                    error_message: errorMessage,
                    date: new Date().toISOString(),
                };
                let resultConversation;
                if (conversationId) {
                    resultConversation = appStateContext?.state?.chatHistory?.find((conv) => conv.id === conversationId);
                    if (!resultConversation) {
                        console.error('Conversation not found.');
                        setIsLoading(false);
                        setShowLoadingMessage(false);
                        abortFuncs.current = abortFuncs.current.filter((a) => a !== abortController);
                        return;
                    }
                    resultConversation.messages.push(errorChatMsg);
                } else {
                    if (!result.history_metadata) {
                        console.error('Error retrieving data.', result);
                        let errorChatMsg: ChatMessage = {
                            id: uuid(),
                            role: ERROR,
                            content: errorUserMessage,
                            error_message: errorMessage,
                            date: new Date().toISOString(),
                        };
                        setMessages([...messages, userMessage, errorChatMsg]);
                        setIsLoading(false);
                        setShowLoadingMessage(false);
                        abortFuncs.current = abortFuncs.current.filter((a) => a !== abortController);
                        return;
                    }
                    resultConversation = {
                        id: result.history_metadata.conversation_id,
                        title: result.history_metadata.title,
                        messages: [userMessage],
                        date: result.history_metadata.date,
                    };
                    resultConversation.messages.push(errorChatMsg);
                }
                if (!resultConversation) {
                    setIsLoading(false);
                    setShowLoadingMessage(false);
                    abortFuncs.current = abortFuncs.current.filter((a) => a !== abortController);
                    return;
                }
                appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: resultConversation });
                setMessages([...messages, errorChatMsg]);
            } else {
                setMessages([...messages, userMessage]);
            }
        } finally {
            setIsLoading(false);
            setShowLoadingMessage(false);
            abortFuncs.current = abortFuncs.current.filter((a) => a !== abortController);
            setProcessMessages(messageStatus.Done);
        }
        return abortController.abort();
    };

    const clearChat = async () => {
        setClearingChat(true);
        if (appStateContext?.state.currentChat?.id && appStateContext?.state.isCosmosDBAvailable.cosmosDB) {
            appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: null });
            setActiveCitation(undefined);
            setIsCitationPanelOpen(false);
            setMessages([]);

            // Re-open Annex Dialog if in Information Annex mode
            if (appStateContext?.state.mode === Mode.informationAnnex) {
                setIsAnnexDialogOpen(true);
            }
        }
        // Also clear metadata search history if in metadata search mode
        setMetadataSearchHistory([]);
        setClearingChat(false);
    };

    const newChat = () => {
        setProcessMessages(messageStatus.Processing);
        setMessages([]);
        setIsCitationPanelOpen(false);
        setActiveCitation(undefined);
        appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: null });
        appStateContext?.dispatch({ type: 'UPDATE_MODE', payload: undefined });
        setProcessMessages(messageStatus.Done);
    };

    const stopGenerating = () => {
        abortFuncs.current.forEach((a) => a.abort());
        setShowLoadingMessage(false);
        setIsLoading(false);
    };

    useEffect(() => {
        if (appStateContext?.state.currentChat) {
            setMessages(appStateContext.state.currentChat.messages);
        } else {
            setMessages([]);
        }
    }, [appStateContext?.state.currentChat]);

    // Clear appropriate history when mode changes
    useEffect(() => {
        if (appStateContext?.state.mode === Mode.metadataSearch) {
            // Entering metadata mode - clear regular messages
            setMessages([]);
        } else {
            // Leaving metadata mode - clear metadata history
            setMetadataSearchHistory([]);
        }
    }, [appStateContext?.state.mode]);

    useLayoutEffect(() => {
        const saveToDB = async (messages: ChatMessage[], id: string) => {
            const response = await historyUpdate(messages, id, settings, appStateContext?.state.mode as Mode);
            return response;
        };

        // Skip saving for metadata search mode
        if (appStateContext?.state.mode === Mode.metadataSearch) {
            return;
        }

        if (appStateContext && appStateContext.state.currentChat && processMessages === messageStatus.Done) {
            if (appStateContext.state.isCosmosDBAvailable.cosmosDB) {
                if (!appStateContext?.state.currentChat?.messages) {
                    console.error('Failure fetching current chat state.');
                    return;
                }
                saveToDB(appStateContext.state.currentChat.messages, appStateContext.state.currentChat.id)
                    .then((res) => {
                        if (!res.ok) {
                            let errorMessage = `${res.text()}`;
                            const errorUserMessage = buildErrorMessage(res.status, errorMessage);

                            let errorChatMsg: ChatMessage = {
                                id: uuid(),
                                role: ERROR,
                                content: errorUserMessage,
                                error_message: errorMessage,
                                date: new Date().toISOString(),
                            };
                            if (!appStateContext?.state.currentChat?.messages) {
                                let err: Error = {
                                    ...new Error(),
                                    message: 'Failure fetching current chat state.',
                                };
                                throw err;
                            }
                            setMessages([...appStateContext?.state.currentChat?.messages, errorChatMsg]);
                        }
                        return res as Response;
                    })
                    .catch((err) => {
                        console.error('Error: ', err);
                        let errRes: Response = {
                            ...new Response(),
                            ok: false,
                            status: 500,
                        };
                        return errRes;
                    });
            }

            appStateContext?.dispatch({ type: 'UPDATE_CHAT_HISTORY', payload: appStateContext.state.currentChat });
            setMessages(appStateContext.state.currentChat.messages);
            setProcessMessages(messageStatus.NotRunning);
        }
    }, [processMessages, ui?.show_feedback, appStateContext, appStateContext?.state.isCosmosDBAvailable.cosmosDB, appStateContext?.state.mode, settings, ERROR]);

    useLayoutEffect(() => {
        chatMessageStreamEnd.current?.scrollIntoView({ behavior: 'smooth' });
    }, [showLoadingMessage, processMessages]);

    useEffect(() => {
        if (messages?.length > 1 && messages[1]?.role === 'assistant') {
            triggerResponseReceived();
        }
    }, [messages, triggerResponseReceived]);

    // Scroll to the latest metadata result when a new search is added
    useEffect(() => {
        if (metadataSearchHistory.length > 0 && latestMetadataResultRef.current) {
            latestMetadataResultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [metadataSearchHistory.length]);

    const onShowCitation = async (citation: Citation) => {
        setActiveCitation(citation);
        setIsCitationPanelOpen(true);

        if (citation.filepath) {
            try {
                const response = await getMetadata(citation.filepath); // Trigger API Call to get metadata from title (case_referece)
                const metadata = await response.json();
                setMetadata(metadata);
            } catch (error) {
                console.error('Error fetching metadata:', error);
            }
        } else {
            console.error('Citation title is null');
        }
    };

    const onViewSource = async (citation: Citation) => {
        if (citation.url && citation.url.includes('blob.core')) {
            const match = citation.url.match(/https:\/\/[^/]+\/([^/]+)\/(.+)/);
            if (match) {
                const [, container, blob] = match;
                const decoded_blob = decodeURIComponent(blob);
                const sasUrl = await getSasUrl(container, decoded_blob);
                if (sasUrl) {
                    window.open(sasUrl, '_blank');
                } else {
                    window.open(citation.url, '_blank');
                }
            } else {
                window.open(citation.url, '_blank');
            }
        }
    };

    const parseCitationFromMessage = (message: ChatMessage) => {
        if (message?.role && message?.role === 'tool') {
            try {
                const toolMessage = JSON.parse(message.content) as ToolMessageContent;
                return toolMessage.citations;
            } catch {
                return [];
            }
        }
        return [];
    };

    /*Retrieve all documents returned from search to access search scores, in addition to citations */
    const parseAllDocsFromMessage = (message: ChatMessage) => {
        if (message?.role && message?.role === 'tool') {
            try {
                const toolMessage = JSON.parse(message.content) as ToolMessageContent;
                return toolMessage.all_retrieved_documents;
            } catch {
                return [];
            }
        }
        return [];
    };

    /*Retrieve background styling depending on document relevance score */
    const getBackgroundStyle = (score: number | undefined) => {
        if (score === undefined) return '';
        if (score > 70) return styles.greenBackground;
        if (score >= 30) return styles.yellowBackground;
        return styles.orangeBackground;
    };

    const checkCitationWithinAnswer = (answer: ChatMessage) => {
        const citationInAnswer = answer.content.includes('[doc');
        return citationInAnswer;
    };

    const disabledButton = () => {
        // In metadata search mode, check metadataSearchHistory instead of messages
        const hasContent = appStateContext?.state.mode === Mode.metadataSearch ? metadataSearchHistory.length > 0 : messages && messages.length > 0;

        return isLoading || !hasContent || clearingChat || appStateContext?.state.chatHistoryLoadingState === ChatHistoryLoadingState.Loading;
    };

    const handleTryAgainClick = (messages?: ChatMessage[]) => {
        if (messages) {
            const userEntries = messages.filter((entry) => entry.role === 'user');
            const mostRecentUserEntry = userEntries[userEntries.length - 1].content;
            appStateContext?.state.isCosmosDBAvailable?.cosmosDB
                ? makeApiRequestWithCosmosDB(mostRecentUserEntry, appStateContext?.state.currentChat?.id)
                : makeApiRequestWithoutCosmosDB(mostRecentUserEntry, appStateContext?.state.currentChat?.id);
        }
    };

    // Check container width for responsive design
    const [containerWidth, setContainerWidth] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const updateWidth = () => {
        if (containerRef.current) {
            setContainerWidth(containerRef.current.offsetWidth);
        }
    };

    useLayoutEffect(() => {
        updateWidth();
    }, []);

    useEffect(() => {
        window.addEventListener('resize', updateWidth);
        return () => window.removeEventListener('resize', updateWidth);
    }, []);

    const onModeSelected = (mode: Mode) => {
        setIsCitationPanelOpen(false);
        appStateContext?.dispatch({ type: 'UPDATE_MODE', payload: mode });

        resetFilters();

        if (mode === Mode.informationAnnex) {
            setIsAnnexDialogOpen(true);
        } else if (inputRef?.current) {
            (inputRef.current as any).focus();
        }
    };

    const onDropdownModeSelected = (mode: Mode) => {
        // clear chat / new chat functionality taken from the Chat.tsx file
        if (appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.NotConfigured) {
            appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: null });
        }
        setIsCitationPanelOpen(false);
        appStateContext?.dispatch({ type: 'UPDATE_MODE', payload: mode });

        resetFilters();

        if (mode === Mode.informationAnnex) {
            setIsAnnexDialogOpen(true);
        }
    };

    const onAnnexSubmit = async (mpNameList: string, mpQuestion: string, memberId: number | null) => {
        setAnnexMemberId(memberId);
        setIsAnnexSubmitting(true);
        setIsAnnexDialogOpen(false);
        setShowLandingPage(false);

        const userMessage: ChatMessage = {
            id: uuid(),
            role: 'user',
            content: `Information Annex Request\n\nMP:\n${mpNameList}\n\nQuestion:\n${mpQuestion}`,
            date: new Date().toISOString(),
        };

        setMessages([userMessage]);
        setIsLoading(true);
        setShowLoadingMessage(true);

        try {
            const response = await submitAnnexRequest(mpNameList, mpQuestion);
            const contentType = response.headers.get('content-type') || '';
            const isStreaming = contentType.includes('json-lines');

            if (isStreaming && response.body) {
                assistantMessage = {} as ChatMessage;
                toolMessage = {} as ChatMessage;
                assistantContent = '';

                const result = await readResponseStream(response, userMessage);

                if (result.message_id) {
                    assistantMessage.id = result.message_id;
                }

                setMessages([userMessage, assistantMessage]);

                const conversation: Conversation = {
                    id: result.conversation_id ?? uuid(),
                    title: `Annex: ${mpNameList}`,
                    messages: [userMessage, assistantMessage],
                    date: new Date().toISOString(),
                };
                appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: conversation });
            } else {
                // Non-streaming JSON response
                const result = await response.json();

                const assistantMessage: ChatMessage = {
                    id: result.message_id,
                    role: 'assistant',
                    content: result.answer,
                    date: new Date().toISOString(),
                };

                setMessages([userMessage, assistantMessage]);

                const conversation: Conversation = {
                    id: result.conversation_id ?? uuid(),
                    title: `Annex: ${mpNameList}`,
                    messages: [userMessage, assistantMessage],
                    date: new Date().toISOString(),
                };
                appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: conversation });
            }
        } catch (e) {
            const rawMessage = e instanceof Error ? e.message : '';
            const content = buildErrorMessage(rawMessage);
            const errorMessage: ChatMessage = {
                id: uuid(),
                role: ERROR,
                content,
                date: new Date().toISOString(),
            };
            setMessages([userMessage, errorMessage]);
        } finally {
            setIsLoading(false);
            setShowLoadingMessage(false);
            setIsAnnexSubmitting(false);
        }
    };

    const onAnnexDismiss = () => {
        setIsAnnexDialogOpen(false);
        if (showLandingPage) {
            appStateContext?.dispatch({ type: 'UPDATE_MODE', payload: undefined });
        }
    };

    const onSend = (question: string, id?: string) => {
        setShowLandingPage(false);
        appStateContext?.state.isCosmosDBAvailable?.cosmosDB ? makeApiRequestWithCosmosDB(question, id) : makeApiRequestWithoutCosmosDB(question, id);
    };

    // Ensure containerWidth is not null before rendering buttons
    if (containerWidth === null) {
        return (
            <div ref={containerRef} className={styles.container}>
                Loading...
            </div>
        );
    }

    return (
        <div className={styles.container} role="main">
            <Stack horizontal className={styles.chatRoot}>
                <div className={styles.chatContainer}>
                    <div style={{ width: '100%' }}>
                        {!showLandingPage && (
                            <div className={styles.modeBannerContainer} style={{ boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.14), 0px 0px 2px rgba(0, 0, 0, 0.12)' }}>
                                <div className={styles.modeBanner}>
                                    <div style={{ display: 'flex', alignItems: 'center', flex: '1' }}>
                                        <BannerButton
                                            icon="home"
                                            tooltipText="Return to Home"
                                            onClick={() => {
                                                setShowLandingPage(true);
                                                newChat();
                                            }}
                                            id="home-button"
                                            iconStyles={{ paddingTop: '0px' }}
                                        />

                                        <DropdownModeSelector onModeSelected={onDropdownModeSelected} />

                                        {!isFiltersDisabled ? (
                                            <BannerButton
                                                icon="filter"
                                                onClick={showFilterPanel}
                                                id="filter-button"
                                                iconStyles={{ paddingTop: '0px' }}
                                                buttonStyles={{ marginLeft: '5px', background: isFiltersChanged ? '#cea1ee' : 'white' }}
                                                buttonHoveredStyles={{ background: isFiltersChanged ? '#af82cf' : 'rgb(200, 200, 200)' }}
                                            />
                                        ) : null}
                                    </div>

                                    {messages?.length > 1 && <BannerButton icon="Unknown" tooltipText="What inputs you can ask next." onClick={() => setWhatToAskVisible(true)} id="ask-next" />}
                                </div>
                            </div>
                        )}
                    </div>

                    {showLandingPage ? (
                        <div className={styles.chatEmptyContainer}>
                            <Stack className={styles.chatEmptyState}>
                                <h1 className={styles.chatEmptyStateTitle}>{ui?.chat_title}</h1>
                            </Stack>

                            <div style={{ minHeight: '340px' }}>
                                <div ref={containerRef} className={styles.modeSelectorContainer}>
                                    <span className={styles.modeSelectorLabel}>
                                        Data was last refreshed on {last_refresh_date}.<br />
                                        Choose an option below to start your conversation.
                                    </span>
                                    <div className={styles.modes} id="mode-selector">
                                        <ModeSelector onModeSelected={onModeSelected} />
                                    </div>
                                </div>

                                {!isFiltersDisabled && appStateContext?.state.mode && (
                                    <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'center' }}>
                                        <ModeButton icon="Filter" id="filter-button" modified={isFiltersChanged} text="Assign a filter" small={true} onClick={showFilterPanel} />
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.chatMessageStream} style={{ marginBottom: isLoading ? '40px' : '0px' }} role="log">
                            {metadataSearchHistory.map((search, index) => (
                                <div key={search.timestamp.toISOString()} style={{ marginBottom: '30px' }} ref={index === metadataSearchHistory.length - 1 ? latestMetadataResultRef : null}>
                                    <div className={styles.chatMessageUser}>
                                        <div className={styles.chatMessageUserMessage}>{search.query}</div>
                                    </div>
                                    <div style={{ marginTop: '10px' }}>
                                        <MetadataResults isOpen={false} onDismiss={() => {}} groupedMetadata={search.results} loading={false} error={null} currentQuery={search.query} inline={true} />
                                    </div>
                                </div>
                            ))}
                            {messages.map((answer, index) => (
                                <div key={index}>
                                    {answer.role === 'user' ? (
                                        <div className={styles.chatMessageUser} tabIndex={0}>
                                            <div className={styles.chatMessageUserMessage}>{answer.content}</div>
                                        </div>
                                    ) : answer.role === 'assistant' ? (
                                        <div className={styles.chatMessageGpt}>
                                            <Answer
                                                isLoading={false}
                                                answer={{
                                                    answer: answer.content,
                                                    citationInAnswer: checkCitationWithinAnswer(answer),
                                                    citations: parseCitationFromMessage(messages[index - 1]),
                                                    allRetrievedDocs: parseAllDocsFromMessage(messages[index - 1]),
                                                    message_id: answer.id,
                                                    feedback: answer.feedback,
                                                }}
                                                onCitationClicked={(c) => onShowCitation(c)}
                                                annexMemberId={annexMemberId}
                                                mode={appStateContext?.state.mode}
                                            />
                                        </div>
                                    ) : answer.role === ERROR ? (
                                        <div className={styles.chatMessageError}>
                                            <Stack horizontal className={styles.chatMessageErrorContent}>
                                                <ErrorCircleRegular className={styles.errorIcon} style={{ color: 'rgba(182, 52, 67, 1)' }} />
                                                <span>Error</span>
                                            </Stack>
                                            <div className={styles.chatMessageErrorContent}>{answer.content}</div>
                                            {isRetryableError(answer.content) && <TryAgainButton onClick={() => handleTryAgainClick(messages)} text={'Try Again'} />}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                            {showLoadingMessage && (
                                <>
                                    <div className={styles.chatMessageGpt}>
                                        <Answer
                                            isLoading={showLoadingMessage}
                                            answer={{
                                                answer: 'Generating answer... (Your answer may take up to 30 seconds to generate)',
                                                citations: [],
                                                allRetrievedDocs: [],
                                            }}
                                            onCitationClicked={() => null}
                                            annexMemberId={annexMemberId}
                                            mode={appStateContext?.state.mode}
                                        />
                                    </div>
                                </>
                            )}
                            <div ref={chatMessageStreamEnd} />
                        </div>
                    )}

                    <Stack horizontal className={styles.chatInput}>
                        {isLoading && (
                            <Stack
                                horizontal
                                className={styles.stopGeneratingContainer}
                                role="button"
                                aria-label="Stop generating"
                                tabIndex={0}
                                onClick={stopGenerating}
                                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? stopGenerating() : null)}
                            >
                                <SquareRegular className={styles.stopGeneratingIcon} aria-hidden="true" />
                                <span className={styles.stopGeneratingText} aria-hidden="true">
                                    Stop generating
                                </span>
                            </Stack>
                        )}
                        <Stack>
                            <div className={styles.newChatIconContainer}>
                                <TooltipHost
                                    content="Clear Chat"
                                    tooltipProps={{
                                        styles: {
                                            content: {
                                                fontSize: '14px',
                                                textAlign: 'center',
                                                color: 'black',
                                            },
                                        },
                                    }}
                                    calloutProps={{
                                        isBeakVisible: true,
                                        beakWidth: 10,
                                        gapSpace: 2,
                                        styles: {
                                            root: {
                                                borderRadius: '4px',
                                                border: '1px solid black',
                                            },
                                            beak: { background: 'rgb(255,255,255)' },
                                            beakCurtain: { background: 'rgb(255,255,255)' },
                                            calloutMain: { background: 'rgb(255,255,255)' },
                                        },
                                    }}
                                    id="newchat-tooltip"
                                >
                                    <CommandBarButton
                                        role="button"
                                        styles={{
                                            icon: {
                                                color: '#FFFFFF',
                                            },
                                            iconDisabled: {
                                                color: '#BDBDBD !important',
                                            },
                                            root: {
                                                color: '#FFFFFF',
                                                background: 'radial-gradient(109.81% 107.82% at 100.1% 90.19%, #58247c 33.63%, #723b9a 70.31%, #cea1ee 100%)',
                                            },
                                            rootDisabled: {
                                                background: '#F0F0F0',
                                            },
                                            rootHovered: {
                                                selectors: {
                                                    '.ms-Button-icon': {
                                                        color: '#58247c',
                                                    },
                                                },
                                            },
                                        }}
                                        className={styles.newChatIcon}
                                        iconProps={{ iconName: 'Refresh' }}
                                        onClick={clearChat}
                                        disabled={disabledButton()}
                                        aria-label="new chat button"
                                        aria-describedby="newchat-tooltip"
                                    />
                                </TooltipHost>
                            </div>
                            <Dialog hidden={hideErrorDialog} onDismiss={handleErrorDialogClose} dialogContentProps={errorDialogContentProps} modalProps={modalProps}></Dialog>
                        </Stack>
                        <QuestionInput
                            clearOnSend
                            placeholder={
                                !messages || messages.length === 0
                                    ? questionPlaceholder()
                                    : appStateContext?.state.mode === Mode.informationAnnex
                                    ? 'Information Annex mode does not support follow-up questions.'
                                    : 'Ask a follow-up question to retrieve more information on this topic.'
                            }
                            disabled={!appStateContext?.state.mode || appStateContext?.state.mode === Mode.informationAnnex}
                            onSend={onSend}
                            conversationId={appStateContext?.state.currentChat?.id ? appStateContext?.state.currentChat?.id : undefined}
                            question={question}
                            setQuestion={setQuestion}
                            textFieldRef={inputRef}
                        />
                    </Stack>
                    <div className={styles.warningText}>
                        {appStateContext?.state.mode === Mode.metadataSearch
                            ? 'This tool mode can only be used to retrieve metadata for the case types that are found using an AI content search. It does not support follow up questions.'
                            : 'You should not rely solely on this tool, human judgement is required. Review the references and ask follow-up questions.'}
                    </div>
                    <div className={styles.warningTextTimeout}>Please be aware that the tool may produce errors after a period of inactivity. If this occurs, simply refresh the window.</div>
                    <AnnexDialog isOpen={isAnnexDialogOpen} onDismiss={onAnnexDismiss} onSubmit={onAnnexSubmit} isSubmitting={isAnnexSubmitting} />
                </div>
                {/* Citation Panel */}
                {messages && messages.length > 0 && isCitationPanelOpen && activeCitation && (
                    <Stack.Item className={styles.citationPanel} tabIndex={0} role="tabpanel" aria-label="Citations Panel">
                        <Stack aria-label="Citations Panel Header Container" horizontal className={styles.citationPanelHeaderContainer} horizontalAlign="space-between" verticalAlign="center">
                            <Stack horizontal verticalAlign="center">
                                <DocumentTextRegular className={styles.bannerIcon} style={{ color: 'black', width: '40px' }} />
                                <span className={styles.citationPanelHeader}>Reference Overview</span>
                            </Stack>
                            <IconButton
                                iconProps={{ iconName: 'Cancel' }}
                                aria-label="Close citations panel"
                                styles={{
                                    root: {
                                        color: 'black',
                                    },
                                    rootHovered: {
                                        color: 'black',
                                    },
                                }}
                                onClick={() => setIsCitationPanelOpen(false)}
                            />
                        </Stack>
                        {activeCitation.search_score && (
                            <div className={styles.relevanceScoreContainer}>
                                <span
                                    className={`${styles.relevanceScore} ${getBackgroundStyle(activeCitation.search_score)}`}
                                    style={{ display: 'flex', alignItems: 'center', paddingLeft: 25, verticalAlign: 'middle' }}
                                >
                                    {activeCitation.search_score}%
                                    <RelevanceHelpButton
                                        icon="Unknown"
                                        tooltipText="The relevance score measures how closely a document aligns with your query. A higher score indicates a stronger match, while lower scores may reflect broader content in the document or vagueness in your input. Keep in mind that a lower score does not necessarily mean the content is irrelevant - it may still contain useful information."
                                        id="Relevance Help"
                                    />
                                </span>
                            </div>
                        )}
                        <div className={styles.citationPanelTitle}>
                            <ReferenceLinkButton
                                tabIndex={0}
                                tooltipText="Click here to download the source document."
                                onClick={() => onViewSource(activeCitation)}
                                text={activeCitation.title}
                                title={activeCitation.url && activeCitation.url.includes('blob.core') ? activeCitation.url : activeCitation.title ?? ''}
                            />
                        </div>
                        {metadata?.internal_review && (
                            <Stack horizontal horizontalAlign="center">
                                <WarningRegular className={styles.bannerIcon} style={{ color: 'rgb(200, 0, 0)', width: '30px' }} />
                                <span className={styles.internalReviewWarning}>{'WARNING: Internal Review - you must consult eCase before using any of this information.'}</span>
                                <WarningRegular className={styles.bannerIcon} style={{ color: 'rgb(200, 0, 0)', width: '30px' }} />
                            </Stack>
                        )}
                        {metadata && (
                            <>
                                <hr className={styles.hrLine} />
                                <div className={styles.metadata}>
                                    <div className={styles.metadataItem}>
                                        <span className={styles.metadataHeader}>
                                            <b>Case Reference:</b>
                                        </span>
                                        <span className={styles.metadataValue}>{metadata.case_ref || 'Not available'}</span>
                                    </div>
                                    <div className={styles.metadataItem}>
                                        <span className={styles.metadataHeader}>
                                            <b>Date Received:</b>
                                        </span>
                                        <span className={styles.metadataValue}>{metadata.date_received ? metadata.date_received.split('T')[0] : 'Not available'}</span>
                                    </div>
                                    <div className={styles.metadataItem}>
                                        <span className={styles.metadataHeader}>
                                            <b>Latest Drafter:</b>
                                        </span>
                                        <span className={styles.metadataValue}>{metadata.latest_drafter || 'Not available'}</span>
                                    </div>
                                    <div className={styles.metadataItem}>
                                        <span className={styles.metadataHeader}>
                                            <b>Reporting Team:</b>
                                        </span>
                                        <span className={styles.metadataValue}>{metadata.reporting_team || 'Not available'}</span>
                                    </div>
                                    {metadata.member_of_parliament && (
                                        <div className={styles.metadataItem}>
                                            <span className={styles.metadataHeader}>
                                                <b>MP Name:</b>
                                            </span>
                                            <span className={styles.metadataValue}>{metadata.member_of_parliament || 'Not available'}</span>
                                        </div>
                                    )}
                                </div>
                                <hr className={styles.hrLine} />
                            </>
                        )}
                        <div tabIndex={0}>
                            <ReactMarkdown
                                linkTarget="_blank"
                                className={styles.citationPanelContent}
                                children={DOMPurify.sanitize(activeCitation.content, { ALLOWED_TAGS: XSSAllowTags })}
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw]}
                            />
                        </div>
                    </Stack.Item>
                )}
                {appStateContext?.state.isChatHistoryOpen && appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.NotConfigured && <ChatHistoryPanel />}
            </Stack>

            <WhatToAskPanel isPanelOpen={whatToAskVisible} closePanel={() => setWhatToAskVisible(false)} />
            <div className={styles.versionNumberBox}>
                <span>
                    {ui?.version} {ui?.hash && `(${ui?.hash})`}
                </span>
            </div>
        </div>
    );
};

export default Chat;
