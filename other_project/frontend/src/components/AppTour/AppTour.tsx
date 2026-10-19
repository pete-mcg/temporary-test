import { useCallback, useEffect, useState } from 'react';
import Joyride, { CallBackProps, STATUS, Step, Styles } from 'react-joyride';

const TourStyles: Partial<Styles> = {
    options: {
        arrowColor: '#f2f2f2',
        backgroundColor: '#f2f2f2',
        overlayColor: 'rgba(26, 26, 26, 0.4)',
        primaryColor: '#071D49',
        textColor: '#000',
        width: 400,
        zIndex: 200, // Set a high z-index to render it above other elements
    },
    tooltip: {
        zIndex: 200, // Ensure tooltip has a high z-index
    },
    tooltipContainer: {
        textAlign: 'left',
    },
    tooltipTitle: {
        textAlign: 'center',
    },
    tooltipContent: {
        padding: '5px 10px',
    },
    tooltipFooter: {
        marginTop: 0,
    },
    overlay: {
        zIndex: 199, // Ensure overlay is below the tooltip if needed
    },
};

type TourProps = {
    shouldShowTour: boolean;
    setShouldShowTour: (value: boolean) => void;
    isInfoPanelOpen: boolean;
    firstResponseLoaded: boolean;
    firstStepComplete: boolean;
    setFirstStepComplete: (value: boolean) => void;
    secondStepComplete: boolean;
    setSecondStepComplete: (value: boolean) => void;
};

export const AppTour: React.FC<TourProps> = ({ shouldShowTour, setShouldShowTour, isInfoPanelOpen, firstResponseLoaded, setFirstStepComplete, setSecondStepComplete }) => {
    const [startupTour, setStartupTour] = useState({
        runInterface: false,
        interfaceComplete: false,
    });
    const [chatTour, setChatTour] = useState({
        runChatResponse: false,
        chatResponseComplete: false,
    });

    const showRunInterfaceTour = useCallback(() => {
        if (shouldShowTour) {
            setStartupTour({ runInterface: true, interfaceComplete: false });
        }
    }, [shouldShowTour]);

    const showRunChatTour = useCallback(() => {
        // Only show the chat response tour if the interface tour is completed
        if (startupTour.interfaceComplete) {
            setChatTour({ ...chatTour, runChatResponse: true });
        }
    }, [startupTour.interfaceComplete, chatTour]);

    const stepsInterface: Step[] = [
        {
            target: '#mode-selector',
            title: 'Tool Mode Selection',
            content: (
                <div>
                    <p>
                        Select an option button to choose the specific tool mode you want assistance with. These modes have been designed to ensure high-quality results without requiring detailed
                        prompting skills for AI chatbots.
                    </p>
                    <p>By hovering over each button, you can get more detailed information about each mode.</p>
                </div>
            ),
            placement: 'top',
        },
        {
            target: '[data-testid="related_responses"]',
            title: 'Find and Summarise Related PQs and FOIs',
            content: (
                <p>
                    This tool mode allows you to find and summarise historic PQs and FOIs related to the input query. It will intelligently search the content of the historic cases and pass all of
                    this to an llm to summarise. By default it is searching through the content of all types of PQs and FOIs in the last 24 months, but you can adjust this in the filter panel.
                </p>
            ),
            placement: 'top',
        },
        {
            target: '[data-testid="metadata_search"]',
            title: 'Find Related Responses Across All Case Types',
            content: (
                <p>
                    This tool mode retrieves metadata for the cases that relate to the input query. It will intelligently search through the content of PQs, MCs, FOIs, and TOs, and retrieve the
                    metadata for these cases, displaying them as table in the response. By default it is searching through the content of all correspondence types in the last 24 months, but you can
                    adjust this in the filter panel.
                </p>
            ),
            placement: 'top',
        },
        {
            target: '[data-testid="information_annex"]',
            title: 'Generate Information Annex',
            content: (
                <p>
                    This tool mode takes in the name of a current MP and a query and then runs a pipeline to create an MP profile and metadata tables for the query. it does this using a combination of
                    source, including a dedicated database, the Hansard database, and the historic records contained in the IRiS knowledge base. It should be used to create a supplementary document
                    for responses.
                </p>
            ),
            placement: 'top',
        },
        {
            target: '#chat-input',
            title: 'Chat Input',
            content: (
                <p>
                    Here is where you insert your query, each tool mode has a different input requirement. Please see the Help & Training for more information about how to prompt in each of the modes.
                    <a href="https://modgovuk.sharepoint.com/sites/IntranetHeadOffice/SitePages/IRIS-Your-new-ally-in-PQ-and-FOI-management.aspx" target="_blank" rel="noreferrer">
                        Tool Mode Input Guidance
                    </a>{' '}
                </p>
            ),
            placement: 'top',
        },
        {
            target: 'div[class^="_newChatIconContainer"]',
            title: 'Chat refresh',
            content: 'To ensure a clear transition between topics, use this button to refresh the chat. This prevents previous conversations from influencing the new one.',
            placement: 'top-start',
        },
        {
            target: '#info-button',
            title: 'Information Panel',
            content: 'Use this button to open the information panel, where you can find more information on the tool and best practices when using it.',
            placement: 'right',
        },
        {
            target: '#filter-button',
            title: 'Filter Button',
            content: (
                <div>
                    <p>
                        Use the filter button to filter to the required case types and set a date range for your search. The filter panel is not available in all modes. Where it is available, more
                        results may be found by increasing the date range.
                    </p>
                </div>
            ),
            placement: 'right',
            locale: { last: 'Close' },
        },
        /** Uncomment when feedback panel is enabled  */
        // {
        //   target: '#feedback-button',
        //   title: 'Feedback Panel',
        //   content: "Use this button to provide feedback on the tool. This helps us make continuous improvements.",
        //   placement: 'right',
        //   locale: { last: 'Close' },
        // },
    ];

    const stepsChatResponse: Step[] = [
        {
            target: '#model-response',
            title: 'AI Response',
            content: (
                <div>
                    <p>Here is where IRiS will provide you with a response to your input. Remember to ask follow-up queries to refine the result.</p>
                    <p>Always check important information before using it to inform decisions.</p>
                </div>
            ),
            placement: 'right',
        },
        {
            target: '#feedback-buttons',
            title: 'Feedback Buttons',
            content: 'Use these buttons to provide feedback on the AI response. This helps us further improve the tool.',
            placement: 'bottom',
        },
        {
            target: '#copy-button',
            title: 'Copy Button',
            content: 'Use this button to copy the AI response to your clipboard. Do so before closing the window, as the response will otherwise be lost.',
            placement: 'bottom',
        },
        {
            target: '#ask-next',
            title: 'What to Ask Next?',
            content: (
                <div>
                    <p>
                        Asking follow up questions is important to get more specific answers and to get more details. The tool is limited to returning the top 5 relevant references to inform the
                        response.
                    </p>
                    <p>Asking more questions can get more references in return.</p>
                </div>
            ),
            placement: 'bottom',
        },
        {
            target: '#dropdown-mode-selector',
            title: 'Change the Mode',
            content: 'You can change the mode, which will reset the chat and filter.',
            placement: 'bottom',
        },
        {
            target: '#home-button',
            title: 'Return to Home',
            content: 'If you want more details on each of the modes, the home button takes you back to the homepage.',
            placement: 'bottom',
            locale: { last: 'Close' },
        },
    ];

    const handleJoyrideCallbackInterface = (data: CallBackProps) => {
        const { status } = data;

        const isFinishedStatusInterface = (status: CallBackProps['status']): status is 'finished' | 'skipped' => status === STATUS.FINISHED || status === STATUS.SKIPPED;

        if (isFinishedStatusInterface(status)) {
            setStartupTour({ runInterface: false, interfaceComplete: true });
            setShouldShowTour(false);
            setChatTour({ ...chatTour, chatResponseComplete: false });
        }
    };

    const handleJoyrideCallbackChatResponse = (data: CallBackProps) => {
        const { status } = data;

        const isFinishedStatusChatResponse = (status: CallBackProps['status']): status is 'finished' | 'skipped' => status === STATUS.FINISHED || status === STATUS.SKIPPED;

        if (isFinishedStatusChatResponse(status)) {
            // setStartupTour({ runInterface: true, interfaceComplete: true });
            setChatTour({ runChatResponse: false, chatResponseComplete: true });
            setShouldShowTour(false);
        }
    };

    useEffect(() => {
        if (shouldShowTour) {
            showRunInterfaceTour();
        }
    }, [shouldShowTour, showRunInterfaceTour]);

    // Trigger interface tour when the infopannel is closed
    useEffect(() => {
        setFirstStepComplete(startupTour.interfaceComplete);
        if (isInfoPanelOpen === false && startupTour.interfaceComplete === false) {
            showRunInterfaceTour();
        }
    }, [isInfoPanelOpen, startupTour.interfaceComplete, setFirstStepComplete, showRunInterfaceTour]);

    useEffect(() => {
        if (startupTour.interfaceComplete && firstResponseLoaded) {
            const timer = setTimeout(() => {
                showRunChatTour();
            }, 2000); // 2000 milliseconds delay to ensure the response is fully visually loaded

            // Cleanup the timer if the component unmounts or firstResponseLoaded changes
            return () => clearTimeout(timer);
        }
    }, [startupTour.interfaceComplete, firstResponseLoaded, showRunChatTour]);

    useEffect(() => {
        setSecondStepComplete(chatTour.chatResponseComplete);
    }, [chatTour.chatResponseComplete, setSecondStepComplete]);

    return (
        <div>
            <Joyride
                steps={stepsInterface}
                run={startupTour.runInterface}
                continuous={true}
                scrollToFirstStep
                showSkipButton
                showProgress={false}
                callback={handleJoyrideCallbackInterface}
                styles={TourStyles}
                disableScrollParentFix={true}
            />
            <Joyride
                steps={stepsChatResponse}
                run={chatTour.runChatResponse}
                continuous={true}
                scrollToFirstStep
                showSkipButton
                showProgress={false}
                callback={handleJoyrideCallbackChatResponse}
                styles={TourStyles}
                disableScrollParentFix={true}
            />
        </div>
    );
};
