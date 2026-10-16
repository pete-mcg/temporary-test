import { useEffect, useState } from 'react';
import Joyride, { CallBackProps, STATUS, Step, Styles } from 'react-joyride';

const TourStyles: Partial<Styles> = {
    options: {
        arrowColor: '#f2f2f2',
        backgroundColor: '#f2f2f2',
        overlayColor: 'rgba(26, 26, 26, 0.4)',
        primaryColor: '#071D49',
        textColor: '#000',
        width: 400,
        zIndex: 200,
    },
    tooltip: {
        zIndex: 200,
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
        zIndex: 199,
    },
    buttonNext: {
        backgroundColor: '#58247c',
    }
};

type TourProps = {
    shouldShowTour: boolean;
    setShouldShowTour: (value: boolean) => void;
    firstResponseLoaded: boolean;
    setFullTourComplete: (value: boolean) => void;
};

export const AppTour: React.FC<TourProps> = ({ shouldShowTour, setShouldShowTour, firstResponseLoaded, setFullTourComplete }) => {
    const [startupTour, setStartupTour] = useState({
        runInterface: false,
        interfaceComplete: false,
    });
    const [chatTour, setChatTour] = useState({
        runChatResponse: false,
        chatResponseComplete: false,
    });
    const [tourKey, setTourKey] = useState(0);

    const showRunInterfaceTour = () => {
        if (shouldShowTour) {
            setStartupTour({ runInterface: true, interfaceComplete: false });
        } else {
            setStartupTour({ runInterface: false, interfaceComplete: true });
        }
    };

    const showRunChatTour = () => {
        // Only show the chat response tour if the interface tour is completed
        if (startupTour.interfaceComplete) {
            setChatTour({ ...chatTour, runChatResponse: true });
        } else {
            setChatTour({ ...chatTour, runChatResponse: false });
        }
    };

    const stepsInterface: Step[] = [
        {
            target: '#chat-input',
            title: 'Chat Input',
            content: "Enter your HR query here to interact with the chatbot.",
            placement: 'top',
        },
        {
            target: '#prompt-guidance',
            title: 'Query Guidance',
            content: "Find tips here for crafting effective queries.",
            placement: 'top',
        },
        {
            target: 'div[class^="_newChatIconContainer"]',
            title: 'Chat Refresh',
            content: "Click this button to start a new conversation when changing topics, to avoid previous context influencing the chatbot. Please note, your existing chat will not be saved.",
            placement: 'top-start',
        },
        {
            target: '#info-button',
            title: 'Information Panel',
            content: 'Open this panel for more information about the tool and additional resources.',
            placement: 'right',
        },
        {
            target: '#feedback-button',
            title: 'Feedback Panel',
            content: "Use this button to provide feedback on the tool. This helps us make continuous improvements.",
            placement: 'right',
        },
        {
            target: '#example-prompts',
            title: 'Example Prompts',
            content: "These are some example questions to get you started. Click any of these now, to see how the chatbot responds.",
            placement: 'top',
            locale: { last: 'Close' },
          },
    ];

    const stepsChatResponse: Step[] = [
        {
            target: '#model-response',
            title: 'Chatbot Response',
            content: (
                <div>
                    <p>The chatbot responds to your query here, using extracts from HR documents that it thinks are most relevant. Ask follow-up questions to refine the results.</p>
                    <p>Please do verify important information before using it for decision-making.</p>
                </div>
            ),
            placement: 'right',
        },
        {
            target: '#feedback-buttons',
            title: 'Feedback Buttons',
            content: 'Use these buttons to provide feedback on the chatbot response. This helps us further improve the tool.',
            placement: 'bottom',
        },
        {
            target: '#copy-button',
            title: 'Copy Button',
            content: 'Use this button to copy the chatbot response to your clipboard. Do so before closing the window, as the response will otherwise be lost.',
            placement: 'bottom',
            locale: { last: 'Close' },
        },
        {
            target: '#citation-reference',
            title: 'References',
            content: 'Click this button to view any references used by the chatbot in generating its response.',
            placement: 'bottom',
            locale: { last: 'Close' },
        },
    ];

    const handleJoyrideCallbackInterface = (data: CallBackProps) => {
        const { status } = data;

        const isFinishedStatusInterface = (status: CallBackProps['status']): status is 'finished' | 'skipped' => status === STATUS.FINISHED || status === STATUS.SKIPPED;

        if (isFinishedStatusInterface(status)) {
            setStartupTour({ runInterface: false, interfaceComplete: true });
            setShouldShowTour(true);
            setChatTour({ ...chatTour, chatResponseComplete: false });
        }
    };

    const handleJoyrideCallbackChatResponse = (data: CallBackProps) => {
        const { status } = data;

        const isFinishedStatusChatResponse = (status: CallBackProps['status']): status is 'finished' | 'skipped' => status === STATUS.FINISHED || status === STATUS.SKIPPED;

        if (isFinishedStatusChatResponse(status)) {
            setChatTour({ runChatResponse: false, chatResponseComplete: true });
            setShouldShowTour(false);
        }
    };

    useEffect(() => {
        if (shouldShowTour) {
            setTourKey((prevKey) => prevKey + 1); // Increment the key to reset Joyride
            showRunInterfaceTour();
        } else {
            setStartupTour({ runInterface: false, interfaceComplete: false });
            setChatTour({ runChatResponse: false, chatResponseComplete: false });
        }
    }, [shouldShowTour]);

    useEffect(() => {
        if (startupTour.interfaceComplete && firstResponseLoaded) {
            const timer = setTimeout(() => {
                showRunChatTour();
            }, 2000); // 2000 milliseconds delay to ensure the response is fully visually loaded

            // Cleanup the timer if the component unmounts or firstResponseLoaded changes
            return () => clearTimeout(timer);
        }
    }, [startupTour.interfaceComplete, firstResponseLoaded]);

    useEffect(() => {
        setFullTourComplete(chatTour.chatResponseComplete);
    }, [chatTour.chatResponseComplete]);

    return (
        <div>
            <Joyride
                key={`interface-${tourKey}`} // Unique key to reset Joyride
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
                key={`chat-${tourKey}`} // Unique key to reset Joyride
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