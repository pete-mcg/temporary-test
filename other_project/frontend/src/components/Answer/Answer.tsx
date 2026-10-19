import { FormEvent, useEffect, useMemo, useState, useContext, useRef } from 'react';
import { useBoolean } from '@fluentui/react-hooks';
import { CommandBarButton, Checkbox, DefaultButton, Dialog, FontIcon, Stack, Text, TooltipHost } from '@fluentui/react';
import DOMPurify from 'dompurify';
import { AppStateContext } from '../../state/AppProvider';
import { renderToStaticMarkup } from 'react-dom/server';

import styles from './Answer.module.css';

import { AskResponse, Citation, Feedback, historyMessageFeedback, historyMessageCopy, Mode } from '../../api';
import { parseAnswer } from './AnswerParser';
import { linkCaseReferences } from './CaseLinks';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import supersub from 'remark-supersub';
import rehypeRaw from 'rehype-raw';
import { ThumbDislike20Filled, ThumbLike20Filled } from '@fluentui/react-icons';
import { XSSAllowTags } from '../../constants/xssAllowTags';
import { AnswerLoading, AnswerLoadingAnnex } from './AnswerLoading';
import { applyInlineStylesToHtml } from './ClipboardStyles';

interface Props {
    answer: AskResponse;
    onCitationClicked: (citedDocument: Citation) => void;
    isLoading: boolean;
    annexMemberId?: number | null;
    mode?: Mode;
}

export const Answer = ({ answer, onCitationClicked, isLoading, mode, annexMemberId }: Props) => {
    const initializeAnswerFeedback = (answer: AskResponse) => {
        if (answer.message_id === undefined) return undefined;
        if (answer.feedback === undefined) return undefined;
        if (answer.feedback.split(',').length > 1) return Feedback.Negative;
        if (Object.values(Feedback).includes(answer.feedback)) return answer.feedback;
        return Feedback.Neutral;
    };

    const [isRefAccordionOpen, { toggle: toggleIsRefAccordionOpen }] = useBoolean(true);
    const [isRefAdditionalAccordionOpen, { toggle: toggleIsRefAdditionalAccordionOpen }] = useBoolean(false);
    const [isRefWarningAccordionOpen, { toggle: toggleIsRefWarningAccordionOpen }] = useBoolean(false);

    const filePathTruncationLimit = 50;

    const parsedAnswer = useMemo(() => {
        const parsed = parseAnswer(answer);
        parsed.markdownFormatText = linkCaseReferences(parsed.markdownFormatText);
        return parsed;
    }, [answer]);
    const [chevronIsExpanded, setChevronIsExpanded] = useState(isRefAccordionOpen);
    const [chevronIsExpandedAdditionalDocs, setChevronIsExpandedAdditionalDocs] = useState(isRefAdditionalAccordionOpen);
    const [chevronIsExpandedNoCitation, setchevronIsExpandedNoCitation] = useState(isRefWarningAccordionOpen);
    const [feedbackState, setFeedbackState] = useState(initializeAnswerFeedback(answer));
    const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
    const [showReportInappropriateFeedback, setShowReportInappropriateFeedback] = useState(false);
    const [negativeFeedbackList, setNegativeFeedbackList] = useState<Feedback[]>([]);
    const [additionalComment, setAdditionalComment] = useState('');
    const appStateContext = useContext(AppStateContext);
    const FEEDBACK_ENABLED = appStateContext?.state.frontendSettings?.feedback_enabled && appStateContext?.state.isCosmosDBAvailable?.cosmosDB;
    const SHOW_ADDITIONAL_DOCS = appStateContext?.state.frontendSettings?.ui?.show_additional_docs;
    const [isCopied, setIsCopied] = useState(false);

    const handleChevronClick = (type: 'citation' | 'noCitation') => {
        if (type === 'citation') {
            if (isRefAdditionalAccordionOpen) {
                setChevronIsExpandedAdditionalDocs(false);
                toggleIsRefAdditionalAccordionOpen();
            }
            setChevronIsExpanded(!chevronIsExpanded);
            toggleIsRefAccordionOpen();
        } else if (type === 'noCitation') {
            if (isRefAdditionalAccordionOpen) {
                setChevronIsExpandedAdditionalDocs(false);
                toggleIsRefAdditionalAccordionOpen();
            }
            setchevronIsExpandedNoCitation(!chevronIsExpandedNoCitation);
            toggleIsRefWarningAccordionOpen();
        }
    };

    useEffect(() => {
        setChevronIsExpanded(isRefAccordionOpen);
        setchevronIsExpandedNoCitation(isRefWarningAccordionOpen);
    }, [isRefAccordionOpen, isRefWarningAccordionOpen]);

    /* Additional citations which are not referenced */
    const handleChevronClickAdditionalDocs = () => {
        if (isRefAccordionOpen) {
            setChevronIsExpanded(false);
            toggleIsRefAccordionOpen();
        }
        if (isRefWarningAccordionOpen) {
            setchevronIsExpandedNoCitation(false);
            toggleIsRefWarningAccordionOpen();
        }
        setChevronIsExpandedAdditionalDocs(!chevronIsExpandedAdditionalDocs);
        toggleIsRefAdditionalAccordionOpen();
    };

    useEffect(() => {
        setChevronIsExpandedAdditionalDocs(isRefAdditionalAccordionOpen);
    }, [isRefAdditionalAccordionOpen]);

    useEffect(() => {
        if (answer.message_id === undefined) return;

        let currentFeedbackState;
        if (appStateContext?.state.feedbackState && appStateContext?.state.feedbackState[answer.message_id]) {
            currentFeedbackState = appStateContext?.state.feedbackState[answer.message_id];
        } else {
            currentFeedbackState = initializeAnswerFeedback(answer);
        }
        setFeedbackState(currentFeedbackState);
    }, [appStateContext?.state.feedbackState, feedbackState, answer.message_id, answer.feedback, answer]);

    const createCitationFilepath = (citation: Citation, index: number, truncate: boolean = false) => {
        let citationFilename = '';

        if (citation.title) {
            const part_i = citation.part_index ?? (citation.chunk_id ? parseInt(citation.chunk_id) + 1 : '');
            if (truncate && citation.title.length > filePathTruncationLimit) {
                const citationLength = citation.title.length;
                citationFilename = `${citation.title.substring(0, 20)}...${citation.title.substring(citationLength - 20)} - Part ${part_i}`;
            } else {
                citationFilename = `${citation.title} - Part ${part_i}`;
            }
        } else if (citation.title && citation.reindex_id) {
            citationFilename = `${citation.title} - Part ${citation.reindex_id}`;
        } else {
            citationFilename = `Citation ${index}`;
        }
        return citationFilename;
    };

    const onLikeResponseClicked = async () => {
        if (answer.message_id === undefined) return;

        let newFeedbackState = feedbackState;
        // Set or unset the thumbs up state
        if (feedbackState === Feedback.Positive) {
            newFeedbackState = Feedback.Neutral;
        } else {
            newFeedbackState = Feedback.Positive;
        }
        appStateContext?.dispatch({ type: 'SET_FEEDBACK_STATE', payload: { answerId: answer.message_id, feedback: newFeedbackState } });
        setFeedbackState(newFeedbackState);

        // Update message feedback in db
        await historyMessageFeedback(answer.message_id, newFeedbackState, '');
    };

    const onDislikeResponseClicked = async () => {
        if (answer.message_id === undefined) return;

        let newFeedbackState = feedbackState;
        if (feedbackState === undefined || feedbackState === Feedback.Neutral || feedbackState === Feedback.Positive) {
            newFeedbackState = Feedback.Negative;
            setFeedbackState(newFeedbackState);
            setIsFeedbackDialogOpen(true);
        } else {
            // Reset negative feedback to neutral
            newFeedbackState = Feedback.Neutral;
            setFeedbackState(newFeedbackState);
            await historyMessageFeedback(answer.message_id, Feedback.Neutral, '');
        }
        appStateContext?.dispatch({ type: 'SET_FEEDBACK_STATE', payload: { answerId: answer.message_id, feedback: newFeedbackState } });
    };

    const updateFeedbackList = (ev?: FormEvent<HTMLElement | HTMLInputElement>, checked?: boolean) => {
        if (answer.message_id === undefined) return;
        let selectedFeedback = (ev?.target as HTMLInputElement)?.id as Feedback;

        let feedbackList = negativeFeedbackList.slice();
        if (checked) {
            feedbackList.push(selectedFeedback);
        } else {
            feedbackList = feedbackList.filter((f) => f !== selectedFeedback);
        }

        setNegativeFeedbackList(feedbackList);
    };

    const handleAdditionalCommentChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setAdditionalComment(event.target.value);
    };

    const onSubmitNegativeFeedback = async () => {
        if (answer.message_id === undefined) return;
        // Include additional comments in the feedback payload
        await historyMessageFeedback(answer.message_id, 'negative:' + negativeFeedbackList.join(','), additionalComment);
        resetFeedbackDialog();
    };

    const resetFeedbackDialog = () => {
        setIsFeedbackDialogOpen(false);
        setShowReportInappropriateFeedback(false);
        setNegativeFeedbackList([]);
    };

    const UnhelpfulFeedbackContent = () => {
        return (
            <>
                <div>Why wasn't this response helpful?</div>
                <Stack tokens={{ childrenGap: 4 }}>
                    <Checkbox
                        label="Citations are missing"
                        id={Feedback.MissingCitation}
                        defaultChecked={negativeFeedbackList.includes(Feedback.MissingCitation)}
                        onChange={updateFeedbackList}
                    ></Checkbox>
                    <Checkbox label="Citations are wrong" id={Feedback.WrongCitation} defaultChecked={negativeFeedbackList.includes(Feedback.WrongCitation)} onChange={updateFeedbackList}></Checkbox>
                    <Checkbox
                        label="The response is not from my data"
                        id={Feedback.OutOfScope}
                        defaultChecked={negativeFeedbackList.includes(Feedback.OutOfScope)}
                        onChange={updateFeedbackList}
                    ></Checkbox>
                    <Checkbox
                        label="Inaccurate or irrelevant"
                        id={Feedback.InaccurateOrIrrelevant}
                        defaultChecked={negativeFeedbackList.includes(Feedback.InaccurateOrIrrelevant)}
                        onChange={updateFeedbackList}
                    ></Checkbox>
                    <Checkbox label="Other" id={Feedback.OtherUnhelpful} defaultChecked={negativeFeedbackList.includes(Feedback.OtherUnhelpful)} onChange={updateFeedbackList}></Checkbox>
                </Stack>
                <div onClick={() => setShowReportInappropriateFeedback(true)} style={{ color: '#115EA3', cursor: 'pointer' }}>
                    Report inappropriate content
                </div>
            </>
        );
    };

    const ReportInappropriateFeedbackContent = () => {
        return (
            <>
                <div>
                    The content is <span style={{ color: 'red' }}>*</span>
                </div>
                <Stack tokens={{ childrenGap: 4 }}>
                    <Checkbox
                        label="Hate speech, stereotyping, demeaning"
                        id={Feedback.HateSpeech}
                        defaultChecked={negativeFeedbackList.includes(Feedback.HateSpeech)}
                        onChange={updateFeedbackList}
                    ></Checkbox>
                    <Checkbox
                        label="Violent: glorification of violence, self-harm"
                        id={Feedback.Violent}
                        defaultChecked={negativeFeedbackList.includes(Feedback.Violent)}
                        onChange={updateFeedbackList}
                    ></Checkbox>
                    <Checkbox label="Sexual: explicit content, grooming" id={Feedback.Sexual} defaultChecked={negativeFeedbackList.includes(Feedback.Sexual)} onChange={updateFeedbackList}></Checkbox>
                    <Checkbox
                        label="Manipulative: devious, emotional, pushy, bullying"
                        defaultChecked={negativeFeedbackList.includes(Feedback.Manipulative)}
                        id={Feedback.Manipulative}
                        onChange={updateFeedbackList}
                    ></Checkbox>
                    <Checkbox label="Other" id={Feedback.OtherHarmful} defaultChecked={negativeFeedbackList.includes(Feedback.OtherHarmful)} onChange={updateFeedbackList}></Checkbox>
                </Stack>
            </>
        );
    };

    const handleCopyClick = async (text: string) => {
        if (answer.message_id === undefined) return;
        const rendered = renderMarkdownToString(text);
        const styledHtml = applyInlineStylesToHtml(rendered);
        const warningText =
            '(This content was generated by IRiS AI Chatbot: Use this information with caution. It is crucial to review and confirm any data for high-stakes decisions or compliance purposes.)';
        const modifiedText = `${styledHtml}<br></br>${warningText}`;

        if ('clipboard' in navigator) {
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': new Blob([modifiedText], { type: 'text/html' }),
                    'text/plain': new Blob([text], { type: 'text/plain' }), // Fallback for plain text
                }),
            ]);
        }

        // Update copy answer log in db
        await historyMessageCopy(answer.message_id, true);

        // Set local state
        setIsCopied(true);
    };

    function renderMarkdownToString(markdownText: string) {
        const markdownComponent = (
            <ReactMarkdown remarkPlugins={[remarkGfm, supersub]} rehypePlugins={[rehypeRaw]}>
                {markdownText}
            </ReactMarkdown>
        );
        const renderedString = renderToStaticMarkup(markdownComponent);
        return renderedString;
    }

    // Format answer citations into square brackets
    function formatCopiedText(inputText: string): string {
        const regex = /\s*\^(\d+)\^\s*/g;
        return inputText.replace(regex, (_, number) => ` [${number}]`);
    }

    // Reformat response footer based on its width
    const answerFooterRef = useRef<HTMLDivElement>(null);
    const answerDisclaimerRef = useRef<HTMLDivElement>(null);
    const accordionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const answerFooter = answerFooterRef.current;
        const answerDisclaimer = answerDisclaimerRef.current;
        const accordion = accordionRef.current;
        if (!answerFooter || !answerDisclaimer || !accordion) return;

        const handleResize = (entries: ResizeObserverEntry[]) => {
            for (let entry of entries) {
                if (entry.contentRect.width <= 400) {
                    answerFooter.style.flexFlow = 'column nowrap';
                    answerDisclaimer.style.order = '1';
                    accordion.style.order = '2';
                } else {
                    answerFooter.style.flexFlow = 'row nowrap';
                    answerDisclaimer.style.order = '2';
                    accordion.style.order = '1';
                }
            }
        };

        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(answerFooter);

        // Initial check
        if (answerFooter.offsetWidth <= 400) {
            answerFooter.style.flexFlow = 'column nowrap';
            answerDisclaimer.style.order = '1';
            accordion.style.order = '2';
        } else {
            answerFooter.style.flexFlow = 'row nowrap';
            answerDisclaimer.style.order = '2';
            accordion.style.order = '1';
        }

        return () => {
            resizeObserver.unobserve(answerFooter);
        };
    }, []);

    return (
        <>
            <Stack className={styles.answerContainer} id="model-response" tabIndex={0}>
                {isLoading ? (
                    appStateContext?.state.mode === Mode.informationAnnex ? (
                        <AnswerLoadingAnnex />
                    ) : (
                        <AnswerLoading mode={mode} />
                    )
                ) : (
                    <Stack.Item>
                        <Stack horizontal grow>
                            <Stack.Item grow>
                                {annexMemberId && appStateContext?.state.mode === Mode.informationAnnex && !isLoading && (
                                    <div className={styles.annexHeader}>
                                        <img src={`https://members-api.parliament.uk/api/Members/${annexMemberId}/Thumbnail`} alt="MP" className={styles.annexMpImage} />
                                        <h1 className={styles.annexTitle}>Information Annex</h1>
                                    </div>
                                )}
                                <ReactMarkdown
                                    linkTarget="_blank"
                                    remarkPlugins={[remarkGfm, supersub]}
                                    rehypePlugins={[rehypeRaw]}
                                    children={DOMPurify.sanitize(parsedAnswer.markdownFormatText, { ALLOWED_TAGS: XSSAllowTags })}
                                    className={styles.answerText}
                                />
                            </Stack.Item>
                            <Stack.Item className={styles.answerHeader}>
                                {answer.message_id !== undefined && (
                                    <Stack horizontal horizontalAlign="space-between">
                                        {FEEDBACK_ENABLED && (
                                            <Stack horizontal horizontalAlign="space-between" id="feedback-buttons">
                                                <TooltipHost
                                                    content="Good response"
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
                                                    id="thumbsup-tooltip"
                                                >
                                                    <ThumbLike20Filled
                                                        aria-hidden="false"
                                                        aria-label="Like this response"
                                                        onClick={() => onLikeResponseClicked()}
                                                        style={
                                                            feedbackState === Feedback.Positive || appStateContext?.state.feedbackState[answer.message_id] === Feedback.Positive
                                                                ? { color: 'darkgreen', cursor: 'pointer' }
                                                                : { color: 'slategray', cursor: 'pointer' }
                                                        }
                                                    />
                                                </TooltipHost>
                                                <TooltipHost
                                                    content="Bad response"
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
                                                    id="thumbsdown-tooltip"
                                                >
                                                    <ThumbDislike20Filled
                                                        aria-hidden="false"
                                                        aria-label="Dislike this response"
                                                        onClick={() => onDislikeResponseClicked()}
                                                        style={
                                                            feedbackState !== Feedback.Positive && feedbackState !== Feedback.Neutral && feedbackState !== undefined
                                                                ? { color: 'darkred', cursor: 'pointer' }
                                                                : { color: 'slategray', cursor: 'pointer' }
                                                        }
                                                    />
                                                </TooltipHost>
                                            </Stack>
                                        )}
                                        <TooltipHost
                                            content={isCopied ? 'Copied' : 'Copy response'}
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
                                            id="copy-tooltip"
                                        >
                                            <CommandBarButton
                                                role="button"
                                                styles={{
                                                    icon: {
                                                        color: '#d3d3d3',
                                                    },
                                                    iconDisabled: {
                                                        color: '#BDBDBD !important',
                                                    },
                                                    iconHovered: { color: 'slategrey' },
                                                }}
                                                className={styles.copyAnswerIcon}
                                                iconProps={isCopied ? { iconName: 'Checkmark' } : { iconName: 'Copy' }}
                                                onClick={() => handleCopyClick(formatCopiedText(parsedAnswer.markdownFormatText))}
                                                aria-label="copy answer button"
                                                aria-describedby="copyanswer-tooltip"
                                                id="copy-button"
                                            />
                                        </TooltipHost>
                                    </Stack>
                                )}
                            </Stack.Item>
                        </Stack>
                    </Stack.Item>
                )}
                <div ref={answerFooterRef} className={styles.answerFooter}>
                    {!!parsedAnswer.citations.length && (
                        <div
                            ref={accordionRef}
                            className={`${styles.accordionContainer} ${chevronIsExpanded ? styles.accordionContainerSelected : ''}`}
                            onClick={() => handleChevronClick('citation')}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? toggleIsRefAccordionOpen() : null)}
                            role="button"
                            tabIndex={0}
                        >
                            <Stack style={{ width: '100%' }}>
                                <Stack horizontal horizontalAlign="start" verticalAlign="center">
                                    <Text className={styles.accordionTitle} aria-label="Open references">
                                        <span style={{ whiteSpace: 'nowrap' }}>{parsedAnswer.citations.length > 1 ? parsedAnswer.citations.length + ' references' : '1 reference'}</span>
                                    </Text>
                                    <FontIcon className={styles.accordionIcon} iconName={chevronIsExpanded ? 'ChevronDown' : 'ChevronRight'} />
                                </Stack>
                            </Stack>
                        </div>
                    )}
                    {!answer.citationInAnswer && answer.citations.length > 0 && (
                        <div
                            ref={accordionRef}
                            className={`${styles.accordionContainer} ${chevronIsExpandedNoCitation ? styles.accordionContainerSelected : ''}`}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? toggleIsRefWarningAccordionOpen() : null)}
                            onClick={() => handleChevronClick('noCitation')}
                            role="button"
                            tabIndex={0}
                            aria-label="Open warning"
                        >
                            <Stack style={{ width: '100%' }}>
                                <Stack horizontal horizontalAlign="start" verticalAlign="center">
                                    <Text className={styles.accordionTitle}>
                                        <span style={{ whiteSpace: 'nowrap' }}>Warning: No references.</span>
                                    </Text>
                                    <FontIcon className={styles.accordionIcon} iconName={chevronIsExpandedNoCitation ? 'ChevronDown' : 'ChevronRight'} />
                                </Stack>
                            </Stack>
                        </div>
                    )}
                    {SHOW_ADDITIONAL_DOCS && !!parsedAnswer.unreferencedCitations.length && (
                        <div style={{ flex: 1 }}>
                            <TooltipHost
                                content="Additional documents are not referenced in the response. However, they may still be relevant to your query."
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
                            >
                                <div
                                    ref={accordionRef}
                                    className={`${styles.accordionContainer} ${chevronIsExpandedAdditionalDocs ? styles.accordionContainerSelected : ''}`}
                                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? toggleIsRefAdditionalAccordionOpen() : null)}
                                    onClick={() => handleChevronClickAdditionalDocs()}
                                    role="button"
                                    tabIndex={0}
                                    aria-label="Open additional references"
                                >
                                    <Stack style={{ width: '100%' }}>
                                        <Stack horizontal horizontalAlign="start" verticalAlign="center">
                                            <Text className={styles.accordionTitle}>
                                                <span style={{ whiteSpace: 'nowrap' }}>
                                                    {parsedAnswer.unreferencedCitations.length > 1 ? parsedAnswer.unreferencedCitations.length + ' additional documents' : '1 additional document'}
                                                </span>
                                            </Text>
                                            <FontIcon className={styles.accordionIcon} iconName={chevronIsExpandedAdditionalDocs ? 'ChevronDown' : 'ChevronRight'} />
                                        </Stack>
                                    </Stack>
                                </div>
                            </TooltipHost>
                        </div>
                    )}
                    <div ref={answerDisclaimerRef} className={styles.answerDisclaimerContainer}>
                        <FontIcon className={styles.warningIcon} iconName={'ReportHacked'} />
                        <span className={styles.answerDisclaimer}>This tool can make mistakes. Check important information, especially when dealing with numerical data.</span>
                    </div>
                </div>
                {chevronIsExpanded && (
                    <div style={{ marginTop: 8, display: 'flex', flexFlow: 'wrap column', maxHeight: '300px', gap: '4px' }}>
                        {parsedAnswer.citations.map((citation, idx) => {
                            return (
                                <span
                                    title={createCitationFilepath(citation, ++idx)}
                                    tabIndex={0}
                                    role="link"
                                    key={idx}
                                    onClick={() => onCitationClicked(citation)}
                                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? onCitationClicked(citation) : null)}
                                    className={styles.citationContainer}
                                    aria-label={createCitationFilepath(citation, idx)}
                                >
                                    <div className={styles.citation}>{idx}</div>
                                    {createCitationFilepath(citation, idx, true)}
                                </span>
                            );
                        })}
                    </div>
                )}
                {chevronIsExpandedNoCitation && (
                    <div style={{ marginTop: 8, display: 'flex', flexFlow: 'wrap column', maxHeight: '300px', gap: '4px' }}>
                        <span title={'Warning Message'} tabIndex={0} className={styles.citationWarningContainer} aria-label="Warning Message">
                            Please use this answer with caution. The tool may be referencing information from outside the knowledge base.
                        </span>
                    </div>
                )}
                {chevronIsExpandedAdditionalDocs && (
                    <div style={{ marginTop: 8, display: 'flex', flexFlow: 'wrap column', maxHeight: '300px', gap: '4px' }}>
                        {parsedAnswer.unreferencedCitations.map((unreferencedCitations, idx) => {
                            return (
                                <span
                                    title={createCitationFilepath(unreferencedCitations, ++idx)}
                                    tabIndex={0}
                                    role="link"
                                    key={idx}
                                    onClick={() => onCitationClicked(unreferencedCitations)}
                                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? onCitationClicked(unreferencedCitations) : null)}
                                    className={styles.citationContainer}
                                    aria-label={createCitationFilepath(unreferencedCitations, idx)}
                                >
                                    {createCitationFilepath(unreferencedCitations, idx, true)}
                                </span>
                            );
                        })}
                    </div>
                )}
            </Stack>
            <Dialog
                onDismiss={() => {
                    resetFeedbackDialog();
                    setFeedbackState(Feedback.Neutral);
                }}
                hidden={!isFeedbackDialogOpen}
                styles={{
                    main: [
                        {
                            selectors: {
                                ['@media (min-width: 480px)']: {
                                    maxWidth: '600px',
                                    background: '#FFFFFF',
                                    boxShadow: '0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)',
                                    borderRadius: '8px',
                                    maxHeight: '600px',
                                    minHeight: '100px',
                                },
                            },
                        },
                    ],
                }}
                dialogContentProps={{
                    title: 'Submit Feedback',
                    showCloseButton: true,
                }}
            >
                <Stack tokens={{ childrenGap: 4 }}>
                    <div>Your feedback will improve this experience.</div>

                    {!showReportInappropriateFeedback ? <UnhelpfulFeedbackContent /> : <ReportInappropriateFeedbackContent />}

                    <div>Additional Comments:</div>

                    <textarea value={additionalComment} onChange={handleAdditionalCommentChange} rows={4} cols={50} placeholder="Enter your additional comments..." />

                    <div>By pressing submit, your feedback will be visible to the application owner.</div>

                    <DefaultButton disabled={negativeFeedbackList.length < 1} onClick={onSubmitNegativeFeedback}>
                        Submit
                    </DefaultButton>
                </Stack>
            </Dialog>
        </>
    );
};
