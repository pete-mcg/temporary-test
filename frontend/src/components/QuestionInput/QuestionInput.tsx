import { useState, useContext } from "react";
import { Stack, TextField, Dialog } from "@fluentui/react";
import { SendRegular, ErrorCircleRegular } from "@fluentui/react-icons";
import Send from "../../assets/Send.svg";
import styles from "./QuestionInput.module.css";
import { AppStateContext } from "../../state/AppProvider";

interface Props {
    onSend: (question: string, id?: string) => void;
    disabled: boolean;
    placeholder?: string;
    clearOnSend?: boolean;
    conversationId?: string;
}

export const QuestionInput = ({ onSend, disabled, placeholder, clearOnSend, conversationId }: Props) => {
    const appStateContext = useContext(AppStateContext)
    const ui = appStateContext?.state.frontendSettings?.ui;
    const [question, setQuestion] = useState<string>("");
    const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
    const maxWordLimit = 1000;

    const sendQuestion = () => {
        if (disabled || !question.trim()) {
            return;
        }

        const wordCount = question.trim().split(/\s+/).length;
        if (wordCount > maxWordLimit) {
            setIsDialogOpen(true);
            return;
        }

        if (conversationId) {
            onSend(question, conversationId);
        } else {
            onSend(question);
        }

        if (clearOnSend) {
            setQuestion("");
        }
    };

    const closeDialog = () => {
        setIsDialogOpen(false);
    };

    const CustomHeader = () => (
        <div style={{ display: 'flex', alignItems: 'center' }}>
            <ErrorCircleRegular style={{ marginRight: '8px', color: "rgba(182, 52, 67, 1)" }} />
            <span>Error: Exceeded maximum input length</span>
        </div>
    );

    const onEnterPress = (ev: React.KeyboardEvent<Element>) => {
        if (ev.key === "Enter" && !ev.shiftKey && !(ev.nativeEvent?.isComposing === true)) {
            ev.preventDefault();
            sendQuestion();
        }
    };

    const onQuestionChange = (_ev: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => {
        setQuestion(newValue || "");
    };

    const sendQuestionDisabled = disabled || !question.trim();

    return (
        <Stack horizontal className={styles.questionInputContainer}>
            <TextField
                styles={{
                    fieldGroup: { minHeight: '25px', height: '100%' },
                    field: {
                        minHeight: '25px',
                        height: '17px',
                        maxHeight: '200px',
                        lineHeight: '17px',
                        padding: '3px 8px 3px 8px',
                        boxSizing: 'border-box',
                        overflow: 'auto',
                    }
                }}
                className={styles.questionInputTextArea}
                style={{ minHeight: ui?.show_history ? "70px" : "25px" }}
                placeholder={placeholder}
                multiline
                autoAdjustHeight
                resizable={false}
                borderless
                value={question}
                onChange={onQuestionChange}
                onKeyDown={onEnterPress}
            />
            <div className={styles.questionInputSendButtonContainer}
                role="button"
                tabIndex={0}
                aria-label="Ask question button"
                onClick={sendQuestion}
                onKeyDown={e => e.key === "Enter" || e.key === " " ? sendQuestion() : null}
                id="chat-input"
            >
                {sendQuestionDisabled ?
                    <SendRegular className={styles.questionInputSendButtonDisabled} />
                    :
                    <img src={Send} alt="Send" className={styles.questionInputSendButton} />
                }
            </div>

            <Dialog
                onDismiss={closeDialog}
                hidden={!isDialogOpen}
                styles={{
                    main: [{
                        selectors: {
                            ['@media (min-width: 480px)']: {
                                maxWidth: '500px',
                                background: "#FFFFFF",
                                boxShadow: "0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)",
                                borderRadius: "8px",
                                maxHeight: '1100px',
                                minHeight: '100px',
                            }
                        }
                    }]
                }}
                dialogContentProps={{
                    title: <CustomHeader />,
                    subText: "This chatbot is designed to handle questions of up to 1000 words in length. Please re-phrase your question and try again. ",
                    showCloseButton: true
                }}
            >
            </Dialog>
            <div className={styles.questionInputBottomBorder} />
        </Stack>
    );
};
