import { useRef, useState, useEffect, useContext, useLayoutEffect, useCallback } from "react";
import { CommandBarButton, IconButton, Dialog, DialogType, Stack, TooltipHost } from "@fluentui/react";
import { SquareRegular, ShieldLockRegular, ErrorCircleRegular, WarningRegular } from "@fluentui/react-icons";
import { ExamplePromptButton, ReferenceLinkButton, TryAgainButton } from "../../components/common/Button";

import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm'
import rehypeRaw from "rehype-raw";
import uuid from 'react-uuid';
import { isEmpty } from "lodash-es";
import DOMPurify from 'dompurify';

import styles from "./Chat.module.css";
import DES from "../../assets/DES.svg";
import { XSSAllowTags } from "../../constants/xssAllowTags";

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
    ErrorMessage
} from "../../api";
import { Answer } from "../../components/Answer";
import { QuestionInput } from "../../components/QuestionInput";
import { ChatHistoryPanel } from "../../components/ChatHistory/ChatHistoryPanel";
import { AppStateContext } from "../../state/AppProvider";
import { useBoolean } from "@fluentui/react-hooks";
import { Settings } from "../../api/models";
import { useAuth } from '../../state/AuthProvider';
import { downloadFileToBrowser } from "../../utils/fileDownload";

const enum messageStatus {
    NotRunning = "Not Running",
    Processing = "Processing",
    Done = "Done"
}

type ChatProps = {
    settings: Settings;
    className?: string;
    isCitationPanelOpen: boolean;
    setIsCitationPanelOpen: (isOpen: boolean) => void;
    sidePanelState?: number;
    triggerResponseReceived: () => void;
};

const Chat: React.FC<ChatProps> = ({ settings, className, isCitationPanelOpen, setIsCitationPanelOpen, sidePanelState, triggerResponseReceived }) => {
    const appStateContext = useContext(AppStateContext)
    const ui = appStateContext?.state.frontendSettings?.ui;
    const chatMessageStreamEnd = useRef<HTMLDivElement | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [showLoadingMessage, setShowLoadingMessage] = useState<boolean>(false);
    const [activeCitation, setActiveCitation] = useState<Citation>();
    const abortFuncs = useRef([] as AbortController[]);
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [processMessages, setProcessMessages] = useState<messageStatus>(messageStatus.NotRunning);
    const [clearingChat, setClearingChat] = useState<boolean>(false);
    const [hideErrorDialog, { toggle: toggleErrorDialog }] = useBoolean(true);
    const [errorMsg, setErrorMsg] = useState<ErrorMessage | null>()
    const document_list = appStateContext?.state.getDatabaseInfo?.documentList;
    const { isAuthenticated } = useAuth();

    const handleMyHrClick = () => {
        window.open('https://modgovuk.sharepoint.com/teams/2228/portals/MyHR', '_blank');

    }

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
    }

    const [ASSISTANT, TOOL, ERROR] = ["assistant", "tool", "error"]

    useEffect(() => {
        if (appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.Working
            && appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.NotConfigured
            && appStateContext?.state.chatHistoryLoadingState === ChatHistoryLoadingState.Fail
            && hideErrorDialog) {
            let subtitle = `${appStateContext.state.isCosmosDBAvailable.status}. Please contact the site administrator.`
            setErrorMsg({
                title: "Chat history is not enabled",
                subtitle: subtitle
            })
            toggleErrorDialog();
        }
    }, [appStateContext?.state.isCosmosDBAvailable, appStateContext?.state.chatHistoryLoadingState, hideErrorDialog, toggleErrorDialog]);

    const handleErrorDialogClose = () => {
        toggleErrorDialog()
        setTimeout(() => {
            setErrorMsg(null)
        }, 500);
    }

    useEffect(() => {
        setIsLoading(appStateContext?.state.chatHistoryLoadingState === ChatHistoryLoadingState.Loading)
    }, [appStateContext?.state.chatHistoryLoadingState])

    let assistantMessage = {} as ChatMessage
    let toolMessage = {} as ChatMessage
    let assistantContent = ""

    const processResultMessage = (resultMessage: ChatMessage, userMessage: ChatMessage, conversationId?: string) => {
        if (resultMessage.role === ASSISTANT) {
            assistantContent += resultMessage.content
            assistantMessage = resultMessage
            assistantMessage.content = assistantContent

            if (resultMessage.context) {
                toolMessage = {
                    id: uuid(),
                    role: TOOL,
                    content: resultMessage.context,
                    date: new Date().toISOString(),
                }
            }
        }

        if (resultMessage.role === TOOL) toolMessage = resultMessage

        if (!conversationId) {
            isEmpty(toolMessage) ?
                setMessages([...messages, userMessage, assistantMessage]) :
                setMessages([...messages, userMessage, toolMessage, assistantMessage]);
        } else {
            isEmpty(toolMessage) ?
                setMessages([...messages, assistantMessage]) :
                setMessages([...messages, toolMessage, assistantMessage]);
        }
    }

    const makeApiRequestWithoutCosmosDB = async (question: string, conversationId?: string) => {
        setIsLoading(true);
        setShowLoadingMessage(true);
        const abortController = new AbortController();
        abortFuncs.current.unshift(abortController);

        const userMessage: ChatMessage = {
            id: uuid(),
            role: "user",
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
            }
        } else {
            conversation = appStateContext?.state?.currentChat
            if (!conversation) {
                console.error("Conversation not found.");
                setIsLoading(false);
                setShowLoadingMessage(false);
                abortFuncs.current = abortFuncs.current.filter(a => a !== abortController);
                return;
            } else {
                conversation.messages.push(userMessage);
            }
        }

        appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: conversation });
        setMessages(conversation.messages)

        const request: ConversationRequest = {
            messages: [...conversation.messages.filter((answer) => answer.role !== ERROR)]
        };

        let result = {} as ChatResponse;
        try {
            const response = await conversationApi(request, abortController.signal, settings);
            if (response?.body) {
                const reader = response.body.getReader();

                let runningText = "";
                while (true) {
                    setProcessMessages(messageStatus.Processing)
                    const { done, value } = await reader.read();
                    if (done) break;

                    var text = new TextDecoder("utf-8").decode(value);
                    const objects = text.split("\n");
                    objects.forEach((obj) => {
                        try {
                            if (obj !== "" && obj !== "{}") {
                                runningText += obj;
                                result = JSON.parse(runningText);
                                if (result.choices?.length > 0) {
                                    result.choices[0].messages.forEach((msg) => {
                                        msg.id = result.id;
                                        msg.date = new Date().toISOString();
                                    })
                                    if (result.choices[0].messages?.some(m => m.role === ASSISTANT)) {
                                        setShowLoadingMessage(false);
                                    }
                                    result.choices[0].messages.forEach((resultObj) => {
                                        processResultMessage(resultObj, userMessage, conversationId);
                                    })
                                }
                                else if (result.error) {
                                    throw Error(result.error);
                                }
                                runningText = "";
                            }
                        }
                        catch (e) {
                            if (!(e instanceof SyntaxError)) {
                                console.error(e);
                                throw e;
                            } else {
                                console.log("Incomplete message. Continuing...")
                            }
                        }
                    });
                }
                conversation.messages.push(toolMessage, assistantMessage)
                appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: conversation });
                setMessages([...messages, toolMessage, assistantMessage]);
            }

        } catch (e) {
            if (!abortController.signal.aborted) {
                let errorUserMessage = "An error occurred. Please try again.";
                if (ui?.show_feedback) {
                    errorUserMessage += " If the problem persists, please report this error using the Report an Issue button on the Feedback page (opened from the side panel).";
                }
                let errorMessage = `${e}`;
                if (result.error?.message) {
                    errorMessage = result.error.message;
                }
                else if (typeof result.error === "string") {
                    errorMessage = result.error;
                }
                let errorChatMsg: ChatMessage = {
                    id: uuid(),
                    role: ERROR,
                    content: errorUserMessage,
                    error_message: errorMessage,
                    date: new Date().toISOString()
                }
                conversation.messages.push(errorChatMsg);
                appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: conversation });
                setMessages([...messages, errorChatMsg]);
            } else {
                setMessages([...messages, userMessage])
            }
        } finally {
            setIsLoading(false);
            setShowLoadingMessage(false);
            abortFuncs.current = abortFuncs.current.filter(a => a !== abortController);
            setProcessMessages(messageStatus.Done)
        }

        return abortController.abort();
    };

    const makeApiRequestWithCosmosDB = async (question: string, conversationId?: string) => {
        setIsLoading(true);
        setShowLoadingMessage(true);
        const abortController = new AbortController();
        abortFuncs.current.unshift(abortController);

        const userMessage: ChatMessage = {
            id: uuid(),
            role: "user",
            content: question,
            date: new Date().toISOString(),
        };

        //api call params set here (generate)
        let request: ConversationRequest;
        let conversation;
        if (conversationId) {
            conversation = appStateContext?.state?.chatHistory?.find((conv) => conv.id === conversationId)
            if (!conversation) {
                console.error("Conversation not found.");
                setIsLoading(false);
                setShowLoadingMessage(false);
                abortFuncs.current = abortFuncs.current.filter(a => a !== abortController);
                return;
            } else {
                conversation.messages.push(userMessage);
                request = {
                    messages: [...conversation.messages.filter((answer) => answer.role !== ERROR)]
                };
            }
        } else {
            request = {
                messages: [userMessage].filter((answer) => answer.role !== ERROR)
            };
            setMessages(request.messages)
        }
        let result = {} as ChatResponse;
        try {
            const response = conversationId ? await historyGenerate(request, abortController.signal, settings, conversationId) : await historyGenerate(request, abortController.signal, settings);
            if (!response?.ok) {
                const contentType = response.headers.get("content-type");
                let errorResponseUserMessage = "Please try again.";
                if (ui?.show_feedback) {
                    errorResponseUserMessage += " If the problem persists, please report this error using the Report an Issue button on the Feedback page (opened from the side panel).";
                }
                let errorResponseMessage = "";
                let errorResponseMetadata = undefined;

                if (contentType && contentType.indexOf("application/json") !== -1) {
                    const responseJson = await response.json();
                    errorResponseMessage = responseJson.error || errorResponseMessage;
                    errorResponseMetadata = responseJson.history_metadata || errorResponseMetadata;
                } else {
                    errorResponseMessage = await response.text();
                    // If the error response is an Azure Gateway Timeout, change the message to a more user-friendly message
                    if (errorResponseMessage.includes("504 Gateway Time-out")) {
                        errorResponseUserMessage = "This conversation is too long for the model to process, please refresh the chat and try again.";
                    }
                }
                let errorChatMsg: ChatMessage = {
                    id: uuid(),
                    role: ERROR,
                    content: `There was an error generating a response: ${errorResponseUserMessage} Chat history can't be saved at this time.`,
                    error_message: errorResponseMessage,
                    date: new Date().toISOString()
                }
                let resultConversation;
                if (conversationId) {
                    resultConversation = appStateContext?.state?.chatHistory?.find((conv) => conv.id === conversationId)
                    if (!resultConversation) {
                        console.error("Conversation not found.");
                        setIsLoading(false);
                        setShowLoadingMessage(false);
                        abortFuncs.current = abortFuncs.current.filter(a => a !== abortController);
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
                                date: errorResponseMetadata.date
                            }
                            resultConversation.messages.push(errorChatMsg);
                            appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: resultConversation });
                        }
                        setMessages([...messages, userMessage, errorChatMsg])
                        setIsLoading(false);
                        setShowLoadingMessage(false);
                        abortFuncs.current = abortFuncs.current.filter(a => a !== abortController);
                        return;
                    }
                    catch (e) {
                        console.error("Error: ", e)
                        return;
                    }
                }
                appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: resultConversation });
                setMessages([...resultConversation.messages]);
                return;
            }
            if (response?.body) {
                const reader = response.body.getReader();

                let runningText = "";
                while (true) {
                    setProcessMessages(messageStatus.Processing)
                    const { done, value } = await reader.read();
                    if (done) break;

                    var text = new TextDecoder("utf-8").decode(value);
                    const objects = text.split("\n");
                    objects.forEach((obj) => {
                        try {
                            if (obj !== "" && obj !== "{}") {
                                runningText += obj;
                                result = JSON.parse(runningText);
                                if (result.choices?.length > 0) {
                                    result.choices[0].messages.forEach((msg) => {
                                        msg.id = result.id;
                                        msg.date = new Date().toISOString();
                                    })
                                    if (result.choices[0].messages?.some(m => m.role === ASSISTANT)) {
                                        setShowLoadingMessage(false);
                                    }
                                    result.choices[0].messages.forEach((resultObj) => {
                                        processResultMessage(resultObj, userMessage, conversationId);
                                    })
                                }
                                runningText = "";
                            }
                            else if (result.error) {
                                throw Error(result.error);
                            }
                        }
                        catch (e) {
                            if (!(e instanceof SyntaxError)) {
                                console.error(e);
                                throw e;
                            } else {
                                console.log("Incomplete message. Continuing...")
                            }
                        }
                    });
                }

                let resultConversation;
                if (conversationId) {
                    resultConversation = appStateContext?.state?.chatHistory?.find((conv) => conv.id === conversationId)
                    if (!resultConversation) {
                        console.error("Conversation not found.");
                        setIsLoading(false);
                        setShowLoadingMessage(false);
                        abortFuncs.current = abortFuncs.current.filter(a => a !== abortController);
                        return;
                    }
                    isEmpty(toolMessage) ?
                        resultConversation.messages.push(assistantMessage) :
                        resultConversation.messages.push(toolMessage, assistantMessage)
                } else {
                    resultConversation = {
                        id: result.history_metadata.conversation_id,
                        title: result.history_metadata.title,
                        messages: [userMessage],
                        date: result.history_metadata.date
                    }
                    isEmpty(toolMessage) ?
                        resultConversation.messages.push(assistantMessage) :
                        resultConversation.messages.push(toolMessage, assistantMessage)
                }
                if (!resultConversation) {
                    setIsLoading(false);
                    setShowLoadingMessage(false);
                    abortFuncs.current = abortFuncs.current.filter(a => a !== abortController);
                    return;
                }
                appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: resultConversation });
                isEmpty(toolMessage) ?
                    setMessages([...messages, assistantMessage]) :
                    setMessages([...messages, toolMessage, assistantMessage]);
            }

        } catch (e) {
            console.error("Error: ", e)
            if (!abortController.signal.aborted) {
                let errorUserMessage = `An error occurred. Please try again.`;
                if (ui?.show_feedback) {
                    errorUserMessage += " If the problem persists, please report this error using the Report an Issue button on the Feedback page (opened from the side panel).";
                }
                let errorMessage = `${e}`;
                if (result.error?.message) {
                    errorMessage = result.error.message;
                }
                else if (typeof result.error === "string") {
                    errorMessage = result.error;
                }
                let errorChatMsg: ChatMessage = {
                    id: uuid(),
                    role: ERROR,
                    content: errorUserMessage,
                    error_message: errorMessage,
                    date: new Date().toISOString()
                }
                let resultConversation;
                if (conversationId) {
                    resultConversation = appStateContext?.state?.chatHistory?.find((conv) => conv.id === conversationId)
                    if (!resultConversation) {
                        console.error("Conversation not found.");
                        setIsLoading(false);
                        setShowLoadingMessage(false);
                        abortFuncs.current = abortFuncs.current.filter(a => a !== abortController);
                        return;
                    }
                    resultConversation.messages.push(errorChatMsg);
                } else {
                    if (!result.history_metadata) {
                        console.error("Error retrieving data.", result);
                        let errorChatMsg: ChatMessage = {
                            id: uuid(),
                            role: ERROR,
                            content: errorUserMessage,
                            error_message: errorMessage,
                            date: new Date().toISOString()
                        }
                        setMessages([...messages, userMessage, errorChatMsg])
                        setIsLoading(false);
                        setShowLoadingMessage(false);
                        abortFuncs.current = abortFuncs.current.filter(a => a !== abortController);
                        return;
                    }
                    resultConversation = {
                        id: result.history_metadata.conversation_id,
                        title: result.history_metadata.title,
                        messages: [userMessage],
                        date: result.history_metadata.date
                    }
                    resultConversation.messages.push(errorChatMsg);
                }
                if (!resultConversation) {
                    setIsLoading(false);
                    setShowLoadingMessage(false);
                    abortFuncs.current = abortFuncs.current.filter(a => a !== abortController);
                    return;
                }
                appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: resultConversation });
                setMessages([...messages, errorChatMsg]);
            } else {
                setMessages([...messages, userMessage])
            }
        } finally {
            setIsLoading(false);
            setShowLoadingMessage(false);
            abortFuncs.current = abortFuncs.current.filter(a => a !== abortController);
            setProcessMessages(messageStatus.Done)
        }
        return abortController.abort();

    }

    const clearChat = async () => {
        setClearingChat(true)
        if (appStateContext?.state.currentChat?.id && appStateContext?.state.isCosmosDBAvailable.cosmosDB) {
            let response = await historyClear(appStateContext?.state.currentChat.id)
            if (!response.ok) {
                if (ui?.show_feedback) {
                    setErrorMsg({
                        title: "Error clearing current chat",
                        subtitle: "Please try again. If the problem persists, please report this error using the Report an Issue button on the Feedback page (opened from the side panel).",
                    })
                }
                else {
                    setErrorMsg({
                        title: "Error clearing current chat",
                        subtitle: "Please try again.",
                    })
                }
                toggleErrorDialog();
            } else {
                appStateContext?.dispatch({ type: 'DELETE_CURRENT_CHAT_MESSAGES', payload: appStateContext?.state.currentChat.id });
                appStateContext?.dispatch({ type: 'UPDATE_CHAT_HISTORY', payload: appStateContext?.state.currentChat });
                setActiveCitation(undefined);
                setIsCitationPanelOpen(false);
                setMessages([])
            }
        }
        setClearingChat(false)
    };

    const newChat = () => {
        setProcessMessages(messageStatus.Processing)
        setMessages([])
        setIsCitationPanelOpen(false);
        setActiveCitation(undefined);
        appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: null });
        setProcessMessages(messageStatus.Done)
    };

    const stopGenerating = () => {
        abortFuncs.current.forEach(a => a.abort());
        setShowLoadingMessage(false);
        setIsLoading(false);
    }

    useEffect(() => {
        if (appStateContext?.state.currentChat) {
            setMessages(appStateContext.state.currentChat.messages)
        } else {
            setMessages([])
        }
    }, [appStateContext?.state.currentChat]);

    useLayoutEffect(() => {
        const saveToDB = async (messages: ChatMessage[], id: string) => {
            const response = await historyUpdate(messages, id)
            return response
        }

        if (appStateContext && appStateContext.state.currentChat && processMessages === messageStatus.Done) {
            if (appStateContext.state.isCosmosDBAvailable.cosmosDB) {
                if (!appStateContext?.state.currentChat?.messages) {
                    console.error("Failure fetching current chat state.")
                    return
                }
                saveToDB(appStateContext.state.currentChat.messages, appStateContext.state.currentChat.id)
                    .then((res) => {
                        if (!res.ok) {
                            const contentType = res.headers.get("content-type");
                            let errorUserMessage = "An error occurred. Answers can't be saved at this time.";
                            if (ui?.show_feedback) {
                                errorUserMessage += " If the problem persists, please report this error using the Report an Issue button on the Feedback page (opened from the side panel).";
                            }
                            let errorMessage = `${res.text()}`;

                            // If the error response is an Azure Gateway Timeout, change the message to a more user-friendly message
                            if (errorMessage.includes("504 Gateway Time-out")) {
                                errorUserMessage = "This conversation is too long for the model to process, please refresh the chat and try again.";
                            }

                            let errorChatMsg: ChatMessage = {
                                id: uuid(),
                                role: ERROR,
                                content: errorUserMessage,
                                error_message: errorMessage,
                                date: new Date().toISOString()
                            }
                            if (!appStateContext?.state.currentChat?.messages) {
                                let err: Error = {
                                    ...new Error(),
                                    message: "Failure fetching current chat state."
                                }
                                throw err
                            }
                            setMessages([...appStateContext?.state.currentChat?.messages, errorChatMsg])
                        }
                        return res as Response
                    })
                    .catch((err) => {
                        console.error("Error: ", err)
                        let errRes: Response = {
                            ...new Response(),
                            ok: false,
                            status: 500,
                        }
                        return errRes;
                    })
            } else {
            }
            appStateContext?.dispatch({ type: 'UPDATE_CHAT_HISTORY', payload: appStateContext.state.currentChat });
            setMessages(appStateContext.state.currentChat.messages)
            setProcessMessages(messageStatus.NotRunning)
        }
    }, [processMessages, ERROR, appStateContext, ui?.show_feedback]);

    useLayoutEffect(() => {
        chatMessageStreamEnd.current?.scrollIntoView({ behavior: "smooth" })
    }, [showLoadingMessage, processMessages]);

    useEffect(() => {
        if (messages?.length > 1 && messages[1]?.role === 'assistant') {
            triggerResponseReceived();
        }
    }, [messages.length]);

    const onShowCitation = (citation: Citation) => {
        setActiveCitation(citation);
        setIsCitationPanelOpen(true);
    };

    const onViewSource = async (citation: Citation) => {
        if (citation.url && citation.url.includes("blob.core")) {
            const match = citation.url.match(/https:\/\/[^\/]+\/([^\/]+)\/(.+)/);
            if (match) {
                const [, container, blob] = match;
                const decoded_blob = decodeURIComponent(blob);
                downloadFileToBrowser(container, decoded_blob, decoded_blob);
            } else {
                window.open(citation.url, "_blank");
            }
        }
    };

    const parseCitationFromMessage = (message: ChatMessage) => {
        if (message?.role && message?.role === "tool") {
            try {
                const toolMessage = JSON.parse(message.content) as ToolMessageContent;
                return toolMessage.citations;
            }
            catch {
                return [];
            }
        }
        return [];
    }

    const checkCitationWithinAnswer = (answer: ChatMessage) => {
        const citationInAnswer = answer.content.includes("[doc")
        return citationInAnswer
    }

    const disabledButton = () => {
        return isLoading || (messages && messages.length === 0) || clearingChat || appStateContext?.state.chatHistoryLoadingState === ChatHistoryLoadingState.Loading
    }

    const handleTryAgainClick = (messages?: ChatMessage[]) => {
        if (messages) {
            const userEntries = messages.filter(entry => entry.role === 'user');
            const mostRecentUserEntry = userEntries[userEntries.length - 1].content;
            appStateContext?.state.isCosmosDBAvailable?.cosmosDB ? makeApiRequestWithCosmosDB(mostRecentUserEntry) : makeApiRequestWithoutCosmosDB(mostRecentUserEntry);
        }
    };

    // Define the onClick event handler
    const handleExamplePromptClick = (question?: string) => {
        if (question) {
            appStateContext?.state.isCosmosDBAvailable?.cosmosDB ? makeApiRequestWithCosmosDB(question) : makeApiRequestWithoutCosmosDB(question)
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

    // Ensure containerWidth is not null before rendering buttons
    if (containerWidth === null) {
        return <div ref={containerRef} className={styles.container}>Loading...</div>;
    }

    return (
        <div className={styles.container} role="main">
            {!isAuthenticated ? (
                <Stack className={styles.chatEmptyState}>
                    <ShieldLockRegular className={styles.chatIcon} style={{ color: 'darkorange', height: "200px", width: "200px" }} />
                    <h1 className={styles.chatEmptyStateTitle}>Authentication Not Configured</h1>
                    <h2 className={styles.chatEmptyStateSubtitle}>
                        This app does not have authentication configured. Please add an identity provider by finding your app in the <a href="https://portal.azure.com/" rel="noreferrer" target="_blank">Azure Portal</a>
                        and following <a href="https://learn.microsoft.com/en-us/azure/app-service/scenario-secure-app-authentication-app-service#3-configure-authentication-and-authorization" rel="noreferrer" target="_blank">these instructions</a>.
                    </h2>
                    <h2 className={styles.chatEmptyStateSubtitle} style={{ fontSize: "20px" }}><strong>Authentication configuration takes a few minutes to apply. </strong></h2>
                    <h2 className={styles.chatEmptyStateSubtitle} style={{ fontSize: "20px" }}><strong>If you deployed in the last 10 minutes, please wait and reload the page after 10 minutes.</strong></h2>
                </Stack>
            ) : (
                <Stack horizontal className={styles.chatRoot}>
                    <div className={styles.chatContainer}>
                         <h2 className={styles.chatBanner}>
                            <WarningRegular className={styles.bannerIcon} style={{ color: 'white', height: "30px", width: "30px", marginLeft: sidePanelState === 0 ? "50px" : "0px" }} />
                            <div>All outputs should be verified. Please do not enter personal data. <br></br>
                                    CHRIS does not perform pay calculations - please access the<a style={{ color: 'white'}} href="https://modgovuk.sharepoint.com/teams/5020/Library/Human%20Resources%20Portal%20Documents/Reward/2025%20pay%20award/20250701%202025%20Pay%20Award%20Calculator%20FINAL.xlsx" rel="noreferrer" target="_blank">2025 pay calculator.</a>
                            </div>
                            <WarningRegular className={styles.bannerIcon} style={{ color: 'white', height: "30px", width: "30px", marginRight: sidePanelState === 0 ? "50px" : "0px" }} />
                        </h2>

                        {!messages || messages.length < 1 ? (
                            <div className={styles.chatEmptyContainer}>
                                <Stack className={styles.chatEmptyState}>
                                    <img
                                        alt="DES"
                                        src={ui?.chat_logo ? ui.chat_logo : DES}
                                        className={styles.chatIcon}
                                        aria-hidden="true"
                                    />
                                    <h1 className={styles.chatEmptyStateTitle}>{ui?.chat_title}</h1>
                                    <h2 className={styles.chatEmptyStateSubtitle}>{ui?.chat_description}</h2>
                                </Stack>
                                <div id="example-prompts" ref={containerRef} className={styles.examplePromptButtonsContainer}>
                                    <ExamplePromptButton
                                        onClick={() => handleExamplePromptClick(ui?.example_prompt_1)}
                                        text={ui?.example_prompt_title_1}
                                        icon={ui?.example_prompt_icon_1} />
                                    {containerWidth > 640 && <ExamplePromptButton
                                        onClick={() => handleExamplePromptClick(ui?.example_prompt_2)}
                                        text={ui?.example_prompt_title_2}
                                        icon={ui?.example_prompt_icon_2} />}
                                    {containerWidth > 960 && <ExamplePromptButton
                                        onClick={handleMyHrClick}
                                        text={ui?.example_prompt_title_3}
                                        icon={ui?.example_prompt_icon_3} />}
                                </div>
                            </div>
                        ) : (
                            <div className={styles.chatMessageStream} style={{ marginBottom: isLoading ? "40px" : "0px" }} role="log">
                                {messages.map((answer, index) => (
                                    <div key={index}>
                                        {answer.role === "user" ? (
                                            <div className={styles.chatMessageUser} tabIndex={0}>
                                                <div className={styles.chatMessageUserMessage}>{answer.content}</div>
                                            </div>
                                        ) : (
                                            answer.role === "assistant" ? <div className={styles.chatMessageGpt}>
                                                <Answer
                                                    answer={{
                                                        answer: answer.content,
                                                        citationInAnswer: checkCitationWithinAnswer(answer),
                                                        citations: parseCitationFromMessage(messages[index - 1]),
                                                        message_id: answer.id,
                                                        feedback: answer.feedback
                                                    }}
                                                    onCitationClicked={c => onShowCitation(c)}
                                                />
                                            </div> : answer.role === ERROR ? <div className={styles.chatMessageError}>
                                                <Stack horizontal className={styles.chatMessageErrorContent}>
                                                    <ErrorCircleRegular className={styles.errorIcon} style={{ color: "rgba(182, 52, 67, 1)" }} />
                                                    <span>Error</span>
                                                </Stack>
                                                <div className={styles.chatMessageErrorContent}>{answer.content}</div>
                                                {(ui?.show_feedback) &&
                                                    <TryAgainButton
                                                        onClick={() => handleTryAgainClick(messages)}
                                                        text={"Try Again"}
                                                    />
                                                }
                                            </div> : null
                                        )}
                                    </div>
                                ))}
                                {showLoadingMessage && (
                                    <>
                                        <div className={styles.chatMessageGpt}>
                                            <Answer
                                                answer={{
                                                    answer: "Generating answer...",
                                                    citations: []
                                                }}
                                                onCitationClicked={() => null}
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
                                    onKeyDown={e => e.key === "Enter" || e.key === " " ? stopGenerating() : null}
                                >
                                    <SquareRegular className={styles.stopGeneratingIcon} aria-hidden="true" />
                                    <span className={styles.stopGeneratingText} aria-hidden="true">Stop generating</span>
                                </Stack>
                            )}
                            <Stack>
                                <div className={styles.newChatIconContainer}>
                                    {appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.NotConfigured &&
                                        <TooltipHost
                                            content={ui?.show_history ? "New Chat" : "Clear Chat"}
                                            tooltipProps={{
                                                styles: {
                                                    content: {
                                                        fontSize: "14px",
                                                        textAlign: "center",
                                                        color: "black"
                                                    },
                                                },
                                            }}
                                            calloutProps={{
                                                isBeakVisible: true,
                                                beakWidth: 10,
                                                gapSpace: 2,
                                                styles: {
                                                    root: {
                                                        borderRadius: "4px",
                                                        border: "1px solid black"
                                                    },
                                                    beak: { background: "rgb(255,255,255)" },
                                                    beakCurtain: { background: "rgb(255,255,255)" },
                                                    calloutMain: { background: "rgb(255,255,255)" },
                                                }
                                            }}
                                            id="newchat-tooltip">
                                            <CommandBarButton
                                                role="button"
                                                styles={{
                                                    icon: {
                                                        color: '#FFFFFF',
                                                    },
                                                    iconDisabled: {
                                                        color: "#BDBDBD !important"
                                                    },
                                                    root: {
                                                        color: '#FFFFFF',
                                                        background: "radial-gradient(109.81% 107.82% at 100.1% 90.19%, #58247c 33.63%, #723b9a 70.31%, #cea1ee 100%)"
                                                    },
                                                    rootDisabled: {
                                                        background: "#F0F0F0"
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
                                                iconProps={ui?.show_history ? { iconName: 'Add' } : { iconName: 'Refresh' }}
                                                onClick={newChat}
                                                disabled={disabledButton()}
                                                aria-label="new chat button"
                                                aria-describedby="newchat-tooltip"
                                            />
                                        </TooltipHost>
                                    }
                                </div>
                                <div className={appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.NotConfigured ? styles.clearChatRefreshContainer : styles.clearChatRefreshNoCosmosContainer}>
                                    {(ui?.show_history || appStateContext?.state.isCosmosDBAvailable?.status === CosmosDBStatus.NotConfigured) &&
                                        <TooltipHost
                                            content="Clear Chat"
                                            tooltipProps={{
                                                styles: {
                                                    content: {
                                                        fontSize: "14px",
                                                        textAlign: "center",
                                                        color: "black"
                                                    },
                                                },
                                            }}
                                            calloutProps={{
                                                isBeakVisible: true,
                                                beakWidth: 10,
                                                gapSpace: 2,
                                                styles: {
                                                    root: {
                                                        borderRadius: "4px",
                                                        border: "1px solid black"
                                                    },
                                                    beak: { background: "rgb(255,255,255)" },
                                                    beakCurtain: { background: "rgb(255,255,255)" },
                                                    calloutMain: { background: "rgb(255,255,255)" },
                                                }
                                            }}
                                            id="clearchat-tooltip">
                                            <CommandBarButton
                                                role="button"
                                                styles={{
                                                    icon: {
                                                        color: '#FFFFFF',
                                                    },
                                                    iconDisabled: {
                                                        color: "#BDBDBD !important",
                                                    },
                                                    root: {
                                                        color: '#FFFFFF',
                                                        background: "radial-gradient(109.81% 107.82% at 100.1% 90.19%, #58247c 33.63%, #723b9a 70.31%, #cea1ee 100%)",
                                                    },
                                                    rootDisabled: {
                                                        background: "#F0F0F0"
                                                    },
                                                    rootHovered: {
                                                        selectors: {
                                                            '.ms-Button-icon': {
                                                                color: '#58247c',
                                                            },
                                                        },
                                                    },
                                                }}
                                                className={appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.NotConfigured ? styles.clearChatRefresh : styles.clearChatRefreshNoCosmos}
                                                iconProps={{ iconName: 'Refresh' }}
                                                onClick={appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.NotConfigured ? clearChat : newChat}
                                                disabled={disabledButton()}
                                                aria-label="clear chat button"
                                                aria-describedby="clearchat-tooltip"
                                            />
                                        </TooltipHost>
                                    }
                                </div>
                                <Dialog
                                    hidden={hideErrorDialog}
                                    onDismiss={handleErrorDialogClose}
                                    dialogContentProps={errorDialogContentProps}
                                    modalProps={modalProps}
                                >
                                </Dialog>
                            </Stack>
                            <QuestionInput
                                clearOnSend
                                placeholder="Type a new question..."
                                disabled={isLoading}
                                onSend={(question, id) => {
                                    appStateContext?.state.isCosmosDBAvailable?.cosmosDB ? makeApiRequestWithCosmosDB(question, id) : makeApiRequestWithoutCosmosDB(question, id)
                                }}
                                conversationId={appStateContext?.state.currentChat?.id ? appStateContext?.state.currentChat?.id : undefined}
                            />
                        </Stack>
                        <div className={styles.warningText}>
                            {document_list ? (
                                "Relying solely on this tool is not recommended; please review the references and ask follow-up questions."
                            ) : (
                                "Relying solely on this tool is not recommended; please check important info."
                            )}
                        </div>
                    </div>
                    {/* Citation Panel */}
                    {messages && messages.length > 0 && isCitationPanelOpen && activeCitation && (
                        <Stack.Item className={styles.citationPanel} tabIndex={0} role="tabpanel" aria-label="Citations Panel">
                            <Stack aria-label="Citations Panel Header Container" horizontal className={styles.citationPanelHeaderContainer} horizontalAlign="space-between" verticalAlign="center">
                                <span aria-label="Citations" className={styles.citationPanelHeader}>Reference Overview</span>
                                <IconButton
                                    iconProps={{ iconName: 'Cancel' }}
                                    aria-label="Close citations panel" styles={{
                                        root: {
                                            color: 'black',
                                        },
                                        rootHovered: {
                                            color: 'black',
                                        },
                                    }}
                                    onClick={() => setIsCitationPanelOpen(false)} />
                            </Stack>
                            <div className={styles.citationPanelTitle}>
                                <ReferenceLinkButton tabIndex={0} onClick={() => onViewSource(activeCitation)} text={activeCitation.filepath} title={activeCitation.url && activeCitation.url.includes("blob.core") ? activeCitation.url : activeCitation.filepath ?? ""} />
                            </div>
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
                    {(appStateContext?.state.isChatHistoryOpen && appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.NotConfigured) && <ChatHistoryPanel />}
                </Stack>
            )}
        </div>
    );
};

export default Chat;