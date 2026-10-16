import { Outlet, Link } from "react-router-dom";
import styles from "./Layout.module.css";
import MOD from "../../assets/MOD.svg";
import DES from "../../assets/DES.svg";
import { CopyRegular, PersonFeedbackRegular } from "@fluentui/react-icons";
import { Dialog, DirectionalHint, Stack, TextField, TooltipHost } from "@fluentui/react";
import { useContext, useEffect, useState } from "react";
import {
    HistoryButton, ShareButton, InfoButton, SettingsButton, SidePanelButton,
    FeedbackButton, GeneralFeedbackButton, ResponseFeedbackButton, ReportBugButton, ReportDocumentButton,
    DocsButton, UserGuidanceButton, TourButton
} from "../../components/common/Button";
import { AppStateContext } from "../../state/AppProvider";
import { CosmosDBStatus } from "../../api";
import Chat from "../chat/Chat";
import { Settings } from "../../api/models";
import SettingsPanel from "../../components/SettingsPanel/SettingsPanel";
import { InformationPanel } from "../../components/InformationPanel/InformationPanel";
import { DocumentsPanel } from "../../components/DocumentsPanel/DocumentsPanel";
//import { AppTour } from '../../components/AppTour/AppTour';
import { set } from "lodash";

enum SidePanelStates {
    Collapsed = 0,
    Default = 1,
    Expanded = 2,
}

const Layout = () => {
    const [isSharePanelOpen, setIsSharePanelOpen] = useState<boolean>(false);
    const [isInfoPanelOpen, setIsInfoPanelOpen] = useState<boolean>(true);
    const [isDocsPanelOpen, setIsDocsPanelOpen] = useState<boolean>(false);
    const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState<boolean>(false);
    const [isFeedbackPanelOpen, setIsFeedbackPanelOpen] = useState<boolean>(false);
    const [copyClicked, setCopyClicked] = useState<boolean>(false);
    const [copyText, setCopyText] = useState<string>("Copy URL");
    const [sidePanelState, setSidePanelState] = useState<number | undefined>(window.innerWidth <= 600 ? SidePanelStates.Collapsed : SidePanelStates.Expanded);
    const [shareLabel, setShareLabel] = useState<string | undefined>("Share");
    const [infoLabel, setInfoLabel] = useState<string | undefined>("Info");
    const [settingsLabel, setSettingsLabel] = useState<string | undefined>("Settings");
    const [historyLabel, setHistoryLabel] = useState<string | undefined>("History");
    const [defaultSettings, setDefaultSettings] = useState<Settings>({
        models: { GPT35TURBO: true, GPT4: false },
        temperature: 0,
        systemMessage: undefined,
    });
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [feedbackLabel, setFeedbackLabel] = useState<string | undefined>("Feedback");
    const [isCitationPanelOpen, setIsCitationPanelOpen] = useState<boolean>(false);
    const appStateContext = useContext(AppStateContext)
    const ui = appStateContext?.state.frontendSettings?.ui;

    const [tourLabel, setTourLabel] = useState<string | undefined>('Tour');
    const [shouldShowTour, setShouldShowTour] = useState<boolean>(false);
    const [firstResponseLoaded, setFirstResponseLoaded] = useState<boolean>(false);
    const [tourFullyComplete, setTourFullyComplete] = useState<boolean>(false);

    const handleSidePanelClick = () => {
        setSidePanelState((currentSidePanelState) => {
            if ((window.innerWidth <= 600 || isCitationPanelOpen) && currentSidePanelState === SidePanelStates.Expanded) {
                return SidePanelStates.Collapsed;
            }

            switch (currentSidePanelState) {
                case SidePanelStates.Expanded:
                    return SidePanelStates.Default;
                case SidePanelStates.Default:
                    return SidePanelStates.Collapsed;
                case SidePanelStates.Collapsed:
                    return SidePanelStates.Expanded;
                default:
                    return currentSidePanelState;
            }
        });
    };

    const handleShareClick = () => {
        setIsSharePanelOpen(true);
    };

    const handleInfoClick = () => {
        setIsInfoPanelOpen(true);
    };

    const handleSettingsClick = () => {
        setIsSettingsPanelOpen(true);
    };

    const handleTourClick = () => {
        setShouldShowTour((prev) => !prev);
    };

    const handleFeedbackClick = () => {
        setIsFeedbackPanelOpen(true);
    };

    const handleSharePanelDismiss = () => {
        setIsSharePanelOpen(false);
        setCopyClicked(false);
        setCopyText("Copy URL");
    };

    const handleInfoPanelDismiss = () => {
        setIsInfoPanelOpen(false);
    };

    const handleSettingsPanelDismiss = () => {
        setIsSettingsPanelOpen(false);
    };

    const handleFeedbackPanelDismiss = () => {
        setIsFeedbackPanelOpen(false);
    };

    const handleCopyClick = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopyClicked(true);
    };

    const handleHistoryClick = () => {
        appStateContext?.dispatch({ type: 'TOGGLE_CHAT_HISTORY' })
    };

    const handleDocsPanelClick = () => {
        setIsDocsPanelOpen(true);
        setIsInfoPanelOpen(false);
    };

    const handleDocsPanelDismiss = () => {
        setIsDocsPanelOpen(false);
        setIsInfoPanelOpen(true);
    };


    const clearChat = () => {
        // clear chat / new chat functionality taken from the Chat.tsx file 
        if (appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.NotConfigured) {
            // if Cosmos DB available - clear chat (save chat history) (additional if to check there is a current chat)
            if (appStateContext?.state.currentChat?.id && appStateContext?.state.isCosmosDBAvailable.cosmosDB) {
                appStateContext?.dispatch({ type: 'DELETE_CURRENT_CHAT_MESSAGES', payload: appStateContext?.state.currentChat.id });
                appStateContext?.dispatch({ type: 'UPDATE_CHAT_HISTORY', payload: appStateContext?.state.currentChat });
            }
        }
        else {
            // if cosmos DB not available - new chat (don't save the history)
            appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: null });
        }
    }

    const handleGeneralFeedbackClick = () => {
        window.open('https://forms.office.com/e/W0E5xBxCp5', '_blank');
    };

    const handleResponseFeedbackClick = () => {
        window.open('', '_blank');
    };

    const handleReportBugClick = () => {
        window.open('https://confluence.desdigital.mod.uk/display/ACFD/AI+Chatbot+Front+Door+Home', '_blank');
    }

    // Link to be updated
    const handleReportDocumentClick = () => {
        window.open('https://forms.office.com/e/fCZ45fbnCy', '_blank');
    }

    const updateSettings = (settings: Settings) => {
        setSettings(settings);
        clearChat();
        setIsSettingsPanelOpen(false);
    }

    useEffect(() => {
        if (copyClicked) {
            setCopyText("Copied URL");
        }
    }, [copyClicked]);

    useEffect(() => { }, [appStateContext?.state.isCosmosDBAvailable.status]);

    useEffect(() => {
        if (ui?.show_editable_system_message) {
            setDefaultSettings((previousSettings) => ({
                ...previousSettings,
                systemMessage: ui?.default_system_message,
            }));
        }
    }, [ui?.default_system_message, ui?.show_editable_system_message])

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth <= 600 || isCitationPanelOpen) {
                setShareLabel(undefined)
                setInfoLabel(undefined)
                setSettingsLabel(undefined)
                setFeedbackLabel(undefined)
                setHistoryLabel(undefined)
                setTourLabel(undefined)
            }
            else if (sidePanelState === SidePanelStates.Default) {
                setShareLabel(undefined)
                setInfoLabel(undefined)
                setSettingsLabel(undefined)
                setFeedbackLabel(undefined)
                setHistoryLabel(undefined)
                setTourLabel(undefined)
            }
            else {
                setShareLabel("Share")
                setInfoLabel("Info")
                setSettingsLabel("Settings")
                setFeedbackLabel("Feedback")
                setHistoryLabel("History")
                setTourLabel("Tour")
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, [isCitationPanelOpen, sidePanelState]);

    // Define a function to update isCitationPanelOpen
    const handleCitationPanelStateChange = (isCitationPanelOpen: boolean) => {
        setIsCitationPanelOpen(isCitationPanelOpen);
        if (window.innerWidth <= 600 || isCitationPanelOpen || sidePanelState === SidePanelStates.Default) {
            setShareLabel(undefined)
            setInfoLabel(undefined)
            setSettingsLabel(undefined)
            setFeedbackLabel(undefined)
            setHistoryLabel(undefined)
            setTourLabel(undefined)
        }
        else {
            setShareLabel("Share")
            setInfoLabel("Info")
            setSettingsLabel("Settings")
            setFeedbackLabel("Feedback")
            setHistoryLabel("History")
            setTourLabel("Tour")
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.layout}>
                <header className={styles.header} role={"banner"}>
                    <Stack horizontal verticalAlign="center" horizontalAlign="space-between">
                        <Stack horizontal verticalAlign="center" className={styles.headerContainerLeft}>
                            <div className={styles.headerIconsContainer}>
                                <img
                                    alt="MOD"
                                    src={ui?.logo ? ui.logo : MOD}
                                    className={styles.headerIcon}
                                    aria-hidden="true"
                                />
                                <img
                                    alt="DES"
                                    src={ui?.logo ? ui.logo : DES}
                                    className={styles.headerIcon}
                                    aria-hidden="true"
                                    style={{ width: "61px" }}
                                />
                            </div>
                            <Link to="/" className={styles.headerTitleContainer}>
                                <h1 className={styles.headerTitle}>{ui?.title}</h1>
                            </Link>
                        </Stack>
                        <div className={styles.headerContainerRight}>
                            <h1 className={styles.classification}>OFFICIAL SENSITIVE</h1>
                            <span className={styles.appVersion}>{import.meta.env.VITE_APP_VERSION} | {import.meta.env.VITE_BUILD_NUMBER} | {import.meta.env.VITE_ENVIRONMENT}</span>
                        </div>
                    </Stack>
                </header>
                <Outlet />
                <Dialog
                    onDismiss={handleSharePanelDismiss}
                    hidden={!isSharePanelOpen}
                    styles={{

                        main: [{
                            selectors: {
                                ['@media (min-width: 600px)']: {
                                    maxWidth: '600px',
                                    background: "#FFFFFF",
                                    boxShadow: "0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)",
                                    borderRadius: "8px",
                                    maxHeight: '200px',
                                    minHeight: '100px',
                                }
                            }
                        }]
                    }}
                    dialogContentProps={{
                        title: "Share the web app",
                        showCloseButton: true
                    }}
                >
                    <Stack horizontal verticalAlign="center" style={{ gap: "8px" }}>
                        <TextField className={styles.urlTextBox} defaultValue={window.location.href} readOnly />
                        <div
                            className={styles.copyButtonContainer}
                            role="button"
                            tabIndex={0}
                            aria-label="Copy"
                            onClick={handleCopyClick}
                            onKeyDown={e => e.key === "Enter" || e.key === " " ? handleCopyClick() : null}
                        >
                            <CopyRegular className={styles.copyButton} />
                            <span className={styles.copyButtonText}>{copyText}</span>
                        </div>
                    </Stack>
                </Dialog>
                {/* Information Panel */}
                <InformationPanel
                    isInfoPanelOpen={isInfoPanelOpen}
                    handleInfoPanelDismiss={handleInfoPanelDismiss}
                    handleDocsPanelClick={handleDocsPanelClick}
                />
                {/* Document List Panel */}
                <DocumentsPanel
                    isDocsPanelOpen={isDocsPanelOpen}
                    handleDocsPanelDismiss={handleDocsPanelDismiss}
                />
                {/* Settings Panel */}
                <SettingsPanel
                    isSettingsPanelOpen={isSettingsPanelOpen}
                    handleSettingsPanelDismiss={handleSettingsPanelDismiss}
                    isSystemMessageEditable={ui?.show_editable_system_message || false}
                    settings={settings}
                    updateSettings={updateSettings}
                    defaultSettings={defaultSettings}
                />
                {/* Feedback Panel */}
                <Dialog
                    onDismiss={handleFeedbackPanelDismiss}
                    hidden={!isFeedbackPanelOpen}
                    styles={{

                        main: [{
                            selectors: {
                                ['@media (min-width: 600px)']: {
                                    maxWidth: '500px',
                                    background: "#FFFFFF",
                                    boxShadow: "0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)",
                                    borderRadius: "8px",
                                    maxHeight: '90%',
                                    minHeight: '100px',
                                    border: "0px solid #000000",
                                    marginTop: "4px"
                                }
                            },
                        }],
                        root: {
                            selectors: {
                                '.ms-Button-icon': {
                                    fontSize: '30px',
                                    color: 'black',
                                },
                            },
                        },
                    }}
                    dialogContentProps={{
                        showCloseButton: true,
                        title: (
                            <div>
                                <div className={styles.banner}>
                                    <PersonFeedbackRegular className={styles.bannerIcon} style={{ color: "black", width: "40px" }} />
                                    <span className={styles.bannerText} style={{ color: "black", textAlign: "left", fontSize: "25px" }}>
                                        Feedback
                                    </span>
                                </div>
                                <div className={styles.headerBorder}></div>
                            </div>
                        ),
                        styles: {
                            title: {
                                padding: '10px',
                            },
                            header: {
                                display: 'flex',
                                alignItems: 'center',
                                flexDirection: 'row',
                                flexWrap: 'nowrap',
                                justifyContent: 'space-between',
                            },
                            topButton: {
                                padding: '0',
                                position: 'relative',
                                height: 'auto',
                                paddingRight: '15px',
                            },
                            inner: { padding: "10px" }
                        }
                    }}
                >
                    <Stack verticalAlign="center" style={{ gap: "8px", margin: "0.5em 0.5em" }}>
                        <div>We appreciate your feedback to help us improve this tool.</div>
                        <div>
                            Use the thumbs up or down feature on chatbot responses to rate how well the tool answered your questions.
                            If you give a thumbs down, please tell us why so we can investigate and make improvements.
                            For other feedback, please use the forms below.
                        </div>
                        <br></br>
                        <Stack verticalFill horizontalAlign="center" verticalAlign="center" style={{ gap: "22px" }}>
                            <GeneralFeedbackButton onClick={handleGeneralFeedbackClick} text={"General Feedback"} />
                            <ReportBugButton onClick={handleReportBugClick} text={"Report an Issue"} />
                            <ReportDocumentButton onClick={handleReportDocumentClick} text={"Suggest a Document Update"} />
                        </Stack>
                        <br></br>
                    </Stack>
                </Dialog>
            </div>
            <div className={styles.flexContainer}>
                {sidePanelState === SidePanelStates.Collapsed && (
                    <div className={styles.chatSkyscraper} style={{ width: "20px" }}>
                        <TooltipHost
                            content="Show sidebar"
                            tooltipProps={{
                                styles: {
                                    content: {
                                        fontSize: "14px",
                                        textAlign: "center",
                                        color: "rgb(0,0,0)",
                                    },
                                },
                            }}
                            calloutProps={{
                                directionalHint: DirectionalHint.bottomCenter,
                                isBeakVisible: true,
                                beakWidth: 10,
                                gapSpace: 2,
                                doNotLayer: false,
                                styles: {
                                    root: {
                                        borderRadius: "4px",
                                        border: "1px solid black",
                                    },
                                    beak: { marginLeft: "31px", background: "rgb(255,255,255)" },
                                    beakCurtain: { background: "rgb(255,255,255)" },
                                    calloutMain: { background: "rgb(255,255,255)" },
                                },
                            }}
                            delay={0}
                        >
                            <SidePanelButton
                                onClick={handleSidePanelClick}
                                text={""}
                                style={{
                                    width: isCitationPanelOpen ? '48px' : '48px',
                                    padding: '5px 8px',
                                    margin: '20px 0px 5px 25px',
                                }}
                                modified={true} />
                        </TooltipHost>
                    </div>
                )}
                {sidePanelState !== SidePanelStates.Collapsed && (
                    <div className={`${styles.chatSkyscraper} ${isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? styles.reducedWidth : ''}`}>
                        <Stack className={styles.skyscraperContainer}>
                            <Stack.Item style={{ marginTop: "20px", marginBottom: "5px" }}>
                                <TooltipHost
                                    content={
                                        (window.innerWidth > 600 && !isCitationPanelOpen && sidePanelState === SidePanelStates.Expanded) ? "Minimize sidebar" :
                                            (((window.innerWidth <= 600 || isCitationPanelOpen) && sidePanelState === SidePanelStates.Expanded) || sidePanelState === SidePanelStates.Default) ? "Hide sidebar" :
                                                "Show sidebar"
                                    }
                                    tooltipProps={{
                                        styles: {
                                            content: {
                                                fontSize: "14px",
                                                textAlign: "center",
                                                color: "rgb(0,0,0)",
                                            },
                                        },
                                    }}
                                    calloutProps={{
                                        directionalHint: DirectionalHint.bottomCenter,
                                        isBeakVisible: true,
                                        beakWidth: 10,
                                        gapSpace: 2,
                                        doNotLayer: false,
                                        styles: {
                                            root: {
                                                border: "1px solid black",
                                                borderRadius: "4px",
                                            },
                                            beak: { background: "rgb(255,255,255)" },
                                            beakCurtain: { background: "rgb(255,255,255)" },
                                            calloutMain: { backgroundColor: "rgb(255,255,255)" },
                                        },
                                    }}
                                    delay={0}
                                >
                                    <SidePanelButton
                                        onClick={handleSidePanelClick}
                                        text={""}
                                        style={{ width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? '48px' : '', padding: '5px 8px' }} />
                                </TooltipHost>
                            </Stack.Item>
                            <Stack.Item grow>
                                <Stack tokens={{ childrenGap: 8 }}>
                                    <InfoButton
                                        id="info-button"
                                        onClick={handleInfoClick}
                                        text={infoLabel}
                                        style={{ width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? 'auto' : '', padding: '5px 8px' }} />
                                    {(ui?.show_settings) &&
                                        <SettingsButton
                                            onClick={handleSettingsClick}
                                            text={settingsLabel}
                                            style={{ width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? 'auto' : '', padding: '5px 8px' }} />
                                    }
                                    {(ui?.show_share_button) &&
                                        <ShareButton
                                            onClick={handleShareClick}
                                            text={shareLabel}
                                            style={{ width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? 'auto' : '', padding: '5px 8px' }} />
                                    }
                                    {(ui?.show_history) && (appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.NotConfigured) &&
                                        <HistoryButton
                                            onClick={handleHistoryClick}
                                            text={historyLabel}
                                            style={{ width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? 'auto' : '', padding: '5px 8px' }} />
                                    }
                                    {/* {(ui?.show_tour) &&
                                        <TourButton
                                            id="tour-button"
                                            onClick={handleTourClick}
                                            text={tourLabel}
                                            tooltipText={shouldShowTour ? 'The tool walkthrough is active. Click through the buttons to receive instructions and tips on how to use the tool. Please note that the walkthrough will automatically end once you have completed the tour, or if you click here again.' : ''}
                                            style={{
                                                width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? 'auto' : '',
                                                padding: '5px 8px',
                                                background: (shouldShowTour === true && tourFullyComplete === false) ? '#cea1ee' : '#F2F2F2',
                                            }}
                                        />
                                    } */}
                                    {(ui?.show_feedback) &&
                                        <FeedbackButton
                                            id="feedback-button"
                                            onClick={handleFeedbackClick}
                                            text={feedbackLabel}
                                            style={{ width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? 'auto' : '', padding: '5px 8px' }} />
                                    }
                                    {/* <AppTour 
                                        shouldShowTour={shouldShowTour} 
                                        setShouldShowTour={setShouldShowTour} 
                                        firstResponseLoaded={firstResponseLoaded} 
                                        setFullTourComplete={setTourFullyComplete}
                                    /> */}
                                </Stack>
                            </Stack.Item>
                        </Stack>
                    </div>
                )}
                <Chat
                    className="chat"
                    isCitationPanelOpen={isCitationPanelOpen}
                    setIsCitationPanelOpen={handleCitationPanelStateChange}
                    sidePanelState={sidePanelState}
                    settings={settings}
                    triggerResponseReceived={() => setFirstResponseLoaded(true)}
                />
            </div>
        </div >
    );
};

export default Layout;