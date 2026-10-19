import {
    UserInfo,
    ConversationRequest,
    Conversation,
    ChatMessage,
    CosmosDBHealth,
    CosmosDBStatus,
    DatabaseInfo,
    Mode,
    UserAuthStatus,
    UserLoginResponse,
    FrontendSettings,
    UserAccess,
    AnnexMpOption,
} from './models';
import { Filters } from '../api/models';

const serverUrl = import.meta.env.VITE_SERVER_URL || '';

export async function conversationApi(options: ConversationRequest, abortSignal: AbortSignal, settings: Filters, mode: Mode): Promise<Response> {
    const response = await fetch(`${serverUrl}/conversation`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            settings: settings,
            messages: options.messages,
            mode,
        }),
        signal: abortSignal,
        credentials: 'include',
    });

    return response;
}

export async function getUserInfo(): Promise<UserAccess | undefined> {
    const response = await fetch(`${serverUrl}/user`, { credentials: 'include' });
    if (!response.ok) {
        return undefined;
    }

    const payload = await response.json();
    return payload;
}

export const getUserAuthStatus = async (): Promise<number> => {
    // 200 = authenticated
    // 401 = unauthenticated - needs to be relogged in
    // 403 = blocked
    // 500 = error

    try {
        const response = await fetch(`${serverUrl}/auth/check`, {
            credentials: 'include',
        });

        return response.status;
    } catch (error) {
        console.error(error);
        return 500;
    }
};

export const getAdminUsers = async (): Promise<UserAccess[]> => {
    const response = await fetch(`/api/users`, {
        credentials: 'include',
    });

    return response.json();
};

export const changeUserRole = async (userAccess: UserAccess): Promise<UserAccess[]> => {
    const response = await fetch(`/api/user/role`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(userAccess),
    });

    return response.json();
};

export const addUser = async (userAccess: UserAccess): Promise<UserAccess[]> => {
    const response = await fetch(`/api/user/add`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(userAccess),
    });

    return response.json();
};

export const removeUser = async (userAccess: UserAccess): Promise<UserAccess[]> => {
    const response = await fetch(`/api/user/remove`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(userAccess),
    });

    return response.json();
};

export const login = async (): Promise<UserLoginResponse> => {
    const response = await fetch(`${serverUrl}/auth/login`, {
        credentials: 'include',
    });

    return response.json();
};

export const authorise = async (code: string): Promise<UserAuthStatus> => {
    const response = await fetch(`${serverUrl}/auth/callback-api?code=${code}`, {
        credentials: 'include',
    });

    return response.json();
};

export const acceptTerms = async (): Promise<void> => {
    await fetch(`${serverUrl}/accept_terms`, {
        method: 'POST',
        credentials: 'include',
    });
};

export const historyList = async (offset = 0): Promise<Conversation[] | null> => {
    const response = await fetch(`${serverUrl}/history/list?offset=${offset}`, {
        method: 'GET',
        credentials: 'include',
    })
        .then(async (res) => {
            const payload = await res.json();
            if (!Array.isArray(payload)) {
                console.error('There was an issue fetching your data.');
                return null;
            }
            const conversations: Conversation[] = await Promise.all(
                payload.map(async (conv: any) => {
                    let convMessages: ChatMessage[] = [];
                    convMessages = await historyRead(conv.id)
                        .then((res) => {
                            return res;
                        })
                        .catch((err) => {
                            console.error('error fetching messages');
                            return [];
                        });
                    const conversation: Conversation = {
                        id: conv.id,
                        title: conv.title,
                        date: conv.createdAt,
                        messages: convMessages,
                    };
                    return conversation;
                }),
            );
            return conversations;
        })
        .catch((err) => {
            console.error('There was an issue fetching your data.');
            return null;
        });

    return response;
};

export const historyRead = async (convId: string): Promise<ChatMessage[]> => {
    const response = await fetch(`${serverUrl}/history/read`, {
        method: 'POST',
        body: JSON.stringify({
            conversation_id: convId,
        }),
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
    })
        .then(async (res) => {
            if (!res) {
                return [];
            }
            const payload = await res.json();
            let messages: ChatMessage[] = [];
            if (payload?.messages) {
                payload.messages.forEach((msg: any) => {
                    const message: ChatMessage = {
                        id: msg.id,
                        role: msg.role,
                        date: msg.createdAt,
                        content: msg.content,
                        feedback: msg.feedback ?? undefined,
                    };
                    messages.push(message);
                });
            }
            return messages;
        })
        .catch((err) => {
            console.error('There was an issue fetching your data.');
            return [];
        });
    return response;
};

type HistoryGeneratePayload = {
    conversation_id?: string;
    messages: ChatMessage[];
    settings: Filters;
    mode: Mode;
};

export const historyGenerate = async (options: ConversationRequest, abortSignal: AbortSignal, settings: Filters, mode: Mode, convId?: string): Promise<Response> => {
    const data: HistoryGeneratePayload = {
        settings: settings,
        messages: options.messages,
        mode,
    };

    if (convId) {
        data.conversation_id = convId;
    }

    const body = JSON.stringify(data);

    const response = await fetch(`${serverUrl}/history/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body,
        signal: abortSignal,
        credentials: 'include',
    })
        .then((res) => {
            return res;
        })
        .catch((err) => {
            console.error('There was an issue fetching your data.');
            return new Response();
        });

    return response;
};

export const historyUpdate = async (messages: ChatMessage[], convId: string, settings: Filters, mode: Mode): Promise<Response> => {
    const response = await fetch(`${serverUrl}/history/update`, {
        method: 'POST',
        body: JSON.stringify({
            conversation_id: convId,
            messages: messages,
            settings: settings,
            mode,
        }),
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
    })
        .then(async (res) => {
            return res;
        })
        .catch((err) => {
            console.error('There was an issue fetching your data.');
            let errRes: Response = {
                ...new Response(),
                ok: false,
                status: 500,
            };
            return errRes;
        });

    return response;
};

//export const historyDelete = async (convId: string): Promise<Response> => {
//    const response = await fetch(`${serverUrl}/history/delete", {
//        method: "DELETE",
//        body: JSON.stringify({
//            conversation_id: convId,
//        }),
//        headers: {
//            "Content-Type": "application/json"
//        },
//    })
//        .then((res) => {
//            return res
//        })
//        .catch((err) => {
//            console.error("There was an issue fetching your data.");
//            let errRes: Response = {
//                ...new Response,
//                ok: false,
//                status: 500,
//            }
//            return errRes;
//        })
//    return response;
//}

//export const historyDeleteAll = async (): Promise<Response> => {
//    const response = await fetch(`${serverUrl}/history/delete_all", {
//        method: "DELETE",
//        body: JSON.stringify({}),
//        headers: {
//            "Content-Type": "application/json"
//        },
//    })
//        .then((res) => {
//            return res
//        })
//        .catch((err) => {
//            console.error("There was an issue fetching your data.");
//            let errRes: Response = {
//                ...new Response,
//                ok: false,
//                status: 500,
//            }
//            return errRes;
//        })
//    return response;
//}

export const historyClear = async (convId: string): Promise<Response> => {
    const response = await fetch(`${serverUrl}/history/clear`, {
        method: 'POST',
        body: JSON.stringify({
            conversation_id: convId,
        }),
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
    })
        .then((res) => {
            return res;
        })
        .catch((err) => {
            console.error('There was an issue fetching your data.');
            let errRes: Response = {
                ...new Response(),
                ok: false,
                status: 500,
            };
            return errRes;
        });

    return response;
};

export const historyRename = async (convId: string, title: string): Promise<Response> => {
    try {
        const response = await fetch(`${serverUrl}/history/rename`, {
            method: 'POST',
            body: JSON.stringify({
                conversation_id: convId,
                title: title,
            }),
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
        });

        return response;
    } catch (err) {
        console.error('There was an issue fetching your data.', err);
        let errRes: Response = {
            ...new Response(),
            ok: false,
            status: 500,
        };
        return errRes;
    }
};

export const historyEnsure = async (): Promise<CosmosDBHealth> => {
    const response = await fetch(`${serverUrl}/history/ensure`, {
        method: 'GET',
        credentials: 'include',
    })
        .then(async (res) => {
            let respJson = await res.json();
            let formattedResponse;
            if (respJson.message) {
                formattedResponse = CosmosDBStatus.Working;
            } else {
                if (res.status === 500) {
                    formattedResponse = CosmosDBStatus.NotWorking;
                } else if (res.status === 401) {
                    formattedResponse = CosmosDBStatus.InvalidCredentials;
                } else if (res.status === 422) {
                    formattedResponse = respJson.error;
                } else {
                    formattedResponse = CosmosDBStatus.NotConfigured;
                }
            }
            if (!res.ok) {
                return {
                    cosmosDB: false,
                    status: formattedResponse,
                };
            } else {
                return {
                    cosmosDB: true,
                    status: formattedResponse,
                };
            }
        })
        .catch((err) => {
            console.error('There was an issue fetching your data.');
            return {
                cosmosDB: false,
                status: err,
            };
        });
    return response;
};

export const frontendSettings = async (): Promise<FrontendSettings | null> => {
    const response = await fetch(`${serverUrl}/frontend_settings`, {
        method: 'GET',
        credentials: 'include',
    })
        .then((res) => {
            return res.json();
        })
        .catch((err) => {
            console.error('There was an issue fetching your data.');
            return null;
        });

    return response;
};

export const databaseInfo = async (): Promise<Response | null> => {
    const response = await fetch(`${serverUrl}/database_info`, {
        method: 'GET',
        credentials: 'include',
    })
        .then((res) => {
            return res.json();
        })
        .catch((err) => {
            console.error('There was an issue fetching your data.');
            return null;
        });

    return response;
};

export const historyMessageFeedback = async (messageId: string, feedback: string, comment: string): Promise<Response> => {
    const response = await fetch(`${serverUrl}/history/message_feedback`, {
        method: 'POST',
        body: JSON.stringify({
            message_id: messageId,
            message_feedback: feedback,
            message_comment: comment,
        }),
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
    })
        .then((res) => {
            return res;
        })
        .catch((err) => {
            console.error('There was an issue logging feedback.');
            let errRes: Response = {
                ...new Response(),
                ok: false,
                status: 500,
            };
            return errRes;
        });
    return response;
};

export const historyMessageCopy = async (messageId: string, copy: boolean): Promise<Response> => {
    const response = await fetch(`${serverUrl}/history/message_copy`, {
        method: 'POST',
        body: JSON.stringify({
            message_id: messageId,
            message_copy: copy,
        }),
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
    })
        .then((res) => {
            return res;
        })
        .catch((err) => {
            console.error('There was an issue logging the answer copy feature.');
            let errRes: Response = {
                ...new Response(),
                ok: false,
                status: 500,
            };
            return errRes;
        });
    return response;
};

export const getMetadata = async (case_ref: string): Promise<Response> => {
    const response = await fetch(`${serverUrl}/get_metadata`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            case_ref: case_ref,
        }),
        credentials: 'include',
    });
    return response;
};

export const searchMetadata = async (query: string, caseTypes: string[], monthsCutoff?: number, top?: number, conversationId?: string): Promise<Response> => {
    const response = await fetch(`${serverUrl}/search_metadata`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query: query,
            case_types: caseTypes,
            months_cutoff: monthsCutoff,
            top: top,
            conversation_id: conversationId,
        }),
        credentials: 'include',
    });
    return response;
};

export const fetchAnnexMpList = async (): Promise<AnnexMpOption[]> => {
    const response = await fetch(`${serverUrl}/annex/mp_list`, {
        method: 'GET',
        credentials: 'include',
    });

    if (!response.ok) {
        throw new Error('Failed to fetch MP list');
    }

    return response.json();
};

export const submitAnnexRequest = async (mpNameList: string, mpQuestion: string): Promise<Response> => {
    const response = await fetch(`${serverUrl}/annex/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            mp_name_list: mpNameList,
            mp_question: mpQuestion,
        }),
        credentials: 'include',
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate annex');
    }

    return response;
};
