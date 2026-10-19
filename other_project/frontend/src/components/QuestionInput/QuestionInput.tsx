import { useState, useContext, useRef } from 'react';
import { Stack, TextField, Dialog, IRefObject, ITextField } from '@fluentui/react';
import { SendRegular, ErrorCircleRegular, SearchRegular } from '@fluentui/react-icons';
import Send from '../../assets/Send.svg';
import styles from './QuestionInput.module.css';
import { AppStateContext } from '../../state/AppProvider';
import { AlertDialog } from '../AlertDialog/AlertDialog';
import { Mode } from '../../api';

interface Props {
    onSend: (question: string, id?: string) => void;
    disabled: boolean;
    placeholder?: string;
    clearOnSend?: boolean;
    conversationId?: string;
    question: string;
    setQuestion: (question: string) => void;
    textFieldRef: IRefObject<ITextField>;
}

export const QuestionInput = ({ onSend, disabled, placeholder, clearOnSend, conversationId, question, setQuestion, textFieldRef }: Props) => {
    const appStateContext = useContext(AppStateContext);
    const ui = appStateContext?.state.frontendSettings?.ui;
    const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
    const maxWordLimit = 5000;
    const [isCreateDraftDialogOpen, setIsCreateDraftDialogOpen] = useState<boolean>(false);
    const createDraftTriggers = [
        'create draft',
        'create a response',
        'create a draft',
        'write a response',
        'write a draft',
        'generate a response',
        'generate response, generate draft',
        'generate a draft',
    ];

    const sendQuestion = () => {
        if (disabled || !question.trim()) {
            return;
        }

        const wordCount = question.trim().split(/\s+/).length;
        if (wordCount > maxWordLimit) {
            setIsDialogOpen(true);
            return;
        }

        // If in ask_anything mode and user asks tool to create a draft, open warning dialog
        const containsCreateDraftTrigger = createDraftTriggers.some((trigger) => question.toLowerCase().includes(trigger));
        if (appStateContext?.state.mode === Mode.askAnything) {
            if (containsCreateDraftTrigger) {
                setIsCreateDraftDialogOpen(true);
                return;
            }
        }

        if (conversationId) {
            onSend(question, conversationId);
        } else {
            onSend(question);
        }

        if (clearOnSend) {
            setQuestion('');
        }
    };

    const closeDialog = () => {
        setIsDialogOpen(false);
    };

    const closeCreateDraftDialog = () => {
        setIsCreateDraftDialogOpen(false);
    };

    const acceptAndSendQuestion = () => {
        onSend(question, conversationId);

        if (clearOnSend) {
            setQuestion('');
        }
        closeCreateDraftDialog();
    };

    const onEnterPress = (ev: React.KeyboardEvent<Element>) => {
        if (ev.key === 'Enter' && !ev.shiftKey && !(ev.nativeEvent?.isComposing === true)) {
            ev.preventDefault();
            sendQuestion();
        }
    };

    const onQuestionChange = (_ev: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => {
        setQuestion(newValue || '');
    };

    const sendQuestionDisabled = disabled || !question.trim();
    const isMetadataSearchMode = appStateContext?.state.mode === Mode.metadataSearch;

    const getSendButtonIcon = () => {
        if (isMetadataSearchMode) {
            return sendQuestionDisabled ? <SearchRegular className={styles.questionInputSendButtonDisabled} /> : <SearchRegular className={styles.questionInputSendButton} />;
        }
        return sendQuestionDisabled ? <SendRegular className={styles.questionInputSendButtonDisabled} /> : <img src={Send} alt="Send" className={styles.questionInputSendButton} />;
    };

    return (
        <Stack horizontal className={styles.questionInputContainer}>
            <TextField
                styles={{
                    field: {
                        maxHeight: '200px',
                        padding: '20px 8px 10px 8px',
                        overflow: 'auto',
                    },
                }}
                className={styles.questionInputTextArea}
                style={{ minHeight: ui?.show_history ? '70px' : '25px' }}
                placeholder={placeholder}
                multiline
                autoAdjustHeight
                id="chat-input"
                resizable={false}
                borderless
                disabled={disabled}
                value={question}
                onChange={onQuestionChange}
                onKeyDown={onEnterPress}
                componentRef={textFieldRef}
            />
            <div
                className={styles.questionInputSendButtonContainer}
                role="button"
                tabIndex={0}
                aria-label="Ask question button"
                onClick={sendQuestion}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? sendQuestion() : null)}
            >
                {getSendButtonIcon()}
            </div>

            <AlertDialog
                title={'Question is too long'}
                message="This chatbot is designed to handle questions of up to 5000 words in length. Please re-phrase your question and try again. "
                isOpen={isDialogOpen}
                onDismiss={closeDialog}
            />

            <AlertDialog
                title={'Important: Review required'}
                message="You have requested the tool to generate a draft response or similar. If you are creating a draft response, be aware the content may be outdated. 
                Before using the response, you must review the answer to ensure details are factually correct and numerical data is accurate."
                isOpen={isCreateDraftDialogOpen}
                onDismiss={closeCreateDraftDialog}
                actionButtonLabel="Confirm & send"
                onAction={acceptAndSendQuestion}
            />
            <div className={styles.questionInputBottomBorder} />
        </Stack>
    );
};
