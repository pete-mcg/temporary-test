import { Outlet, Link, useNavigate } from 'react-router-dom';
import styles from './Layout.module.css';
import MOD from '../../assets/MOD.svg';
import DES from '../../assets/DES.svg';
import { CopyRegular, PersonFeedbackRegular } from '@fluentui/react-icons';
import { Dialog, Stack, TextField } from '@fluentui/react';
import { useContext, useEffect, useState } from 'react';
import { PanelButton } from '../../components/common/Button';
import { AppStateContext } from '../../state/AppProvider';
import { CosmosDBStatus, frontendSettings } from '../../api';
import Chat from '../chat/Chat';
import { Filters, IrisRoute, Role, MetadataFilters } from '../../api/models';
import FilterPanel from '../../components/FilterPanel/FilterPanel';
import MetadataFilterPanel from '../../components/MetadataFilterPanel/MetadataFilterPanel';
import { InformationPanel } from '../../components/InformationPanel/InformationPanel';
import { AppTour } from '../../components/AppTour/AppTour';
import { areObjectsDifferent } from '../../utils/utils';
import { FeedbackDialog } from '../../components/FeedbackDialog/FeedbackDialog';
import { useAuth } from '../../state/AuthProvider';

enum SidePanelStates {
    Default = 0,
    Expanded = 1,
}

const Layout = () => {
    const appStateContext = useContext(AppStateContext);
    const ui = appStateContext?.state.frontendSettings?.ui;

    const navigate = useNavigate();

    const [isSharePanelOpen, setIsSharePanelOpen] = useState<boolean>(false);
    const [isInfoPanelOpen, setIsInfoPanelOpen] = useState<boolean>(false);
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(false);
    const [isFeedbackPanelOpen, setIsFeedbackPanelOpen] = useState<boolean>(false);
    const [isMetadataFilterPanelOpen, setIsMetadataFilterPanelOpen] = useState<boolean>(false);
    const [copyClicked, setCopyClicked] = useState<boolean>(false);
    const [copyText, setCopyText] = useState<string>('Copy URL');
    const [sidePanelState, setSidePanelState] = useState<number | undefined>(SidePanelStates.Default);
    const [shareLabel, setShareLabel] = useState<string | undefined>(undefined);
    const [infoLabel, setInfoLabel] = useState<string | undefined>(undefined);

    const [filtersLabel, setFiltersLabel] = useState<string | undefined>('Filter');
    const [defaultFilters, setDefaultFilters] = useState<Filters>({
        casetypes: { FOI: true, PQLO: true, PQLW: true, PQN: true, PQO: true, PQW: true },
        monthsCutoff: 24,
    });
    const [filters, setFilters] = useState<Filters>(defaultFilters);

    const defaultMetadataFilters: MetadataFilters = {
        casetypes: { PQ: true, MC: true, FOI: true, TO: true },
        monthsCutoff: 24,
    };
    const [metadataFilters, setMetadataFilters] = useState<MetadataFilters>(defaultMetadataFilters);

    // Check if filters have changed based on the current mode
    const isFiltersChanged = appStateContext?.state.mode === 'metadata_search' ? areObjectsDifferent(metadataFilters, defaultMetadataFilters) : areObjectsDifferent(filters, defaultFilters);

    const [feedbackLabel, setFeedbackLabel] = useState<string | undefined>(undefined);
    const [scriptDashboardLabel, setScriptDashboardLabel] = useState<string | undefined>(undefined);
    const [adminLabel, setAdminLabel] = useState<string | undefined>(undefined);
    const [hideHistoryLabel, setHideHistoryLabel] = useState<string | undefined>('History');
    const [showHistoryLabel, setShowHistoryLabel] = useState<string | undefined>('History');
    const [searchInput, setSearchInput] = useState('');
    const [isCitationPanelOpen, setIsCitationPanelOpen] = useState<boolean>(false);

    const [tourLabel, setTourLabel] = useState<string | undefined>(undefined);
    const [shouldShowTour, setShouldShowTour] = useState<boolean>(false);
    const [firstResponseLoaded, setFirstResponseLoaded] = useState<boolean>(false);
    const [tourFirstStepComplete, setTourFirstStepComplete] = useState<boolean>(false);
    const [tourSecondStepComplete, setTourSecondStepComplete] = useState<boolean>(false);

    const { userAccess } = useAuth();

    const handleSidePanelClick = () => {
        setSidePanelState((currentSidePanelState) => {
            // Toggle between Expanded (with text) and Default (icons only)
            return currentSidePanelState === SidePanelStates.Expanded ? SidePanelStates.Default : SidePanelStates.Expanded;
        });
    };

    const handleShareClick = () => {
        setIsSharePanelOpen(true);
    };

    const handleFeedbackClick = () => {
        setIsFeedbackPanelOpen(true);
    };

    const handleScriptDashboardClick = () => {
        // Open SharePoint page in a new tab
        window.open(
            'https://modgovuk.sharepoint.com/teams/2228/Domains/je/pages/Information%20Page.aspx?title=Supply+Chain+Resilience+Intelligence+Performance+Tool+%28SCRIPT%29+Dashboard&itempath=https%3a//modgovuk.sharepoint.com/teams/2228/Domains/je&author=Cowan%2c+Fiona+Mrs+%28DES+COG-BusChge-015%29&cat=Programme+of+Work&clickparams=eyAiWC1BcHBOYW1lIiA6ICJNaWNyb3NvZnQgT3V0bG9vayIsICJYLUFwcFZlcnNpb24iIDogIjE2LjAuMTg1MjYuMjA2MzQiLCAiT1MiIDogIldpbmRvd3MiIH0%3d',
            '_blank',
        );
    };

    const handleSharePanelDismiss = () => {
        setIsSharePanelOpen(false);
        setCopyClicked(false);
        setCopyText('Copy URL');
    };

    const handleFilterPanelDismiss = () => {
        setIsFilterPanelOpen(false);
    };

    const showFilterPanel = () => {
        // Check if we're in metadata_search mode
        if (appStateContext?.state.mode === 'metadata_search') {
            setIsMetadataFilterPanelOpen(true);
        } else {
            setIsFilterPanelOpen(true);
        }
    };

    const handleFeedbackPanelDismiss = () => {
        setIsFeedbackPanelOpen(false);
    };

    const handleInfoPanelDismiss = () => {
        setIsInfoPanelOpen(false);
    };

    const handleCopyClick = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopyClicked(true);
    };

    const handleHistoryClick = () => {
        appStateContext?.dispatch({ type: 'TOGGLE_CHAT_HISTORY' });
    };

    const clearChat = () => {
        // clear chat / new chat functionality taken from the Chat.tsx file
        if (appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.NotConfigured) {
            // if Cosmos DB available - clear chat (save chat history) (additional if to check there is a current chat)
            if (appStateContext?.state.currentChat?.id && appStateContext?.state.isCosmosDBAvailable.cosmosDB) {
                appStateContext?.dispatch({
                    type: 'DELETE_CURRENT_CHAT_MESSAGES',
                    payload: appStateContext?.state.currentChat.id,
                });
                appStateContext?.dispatch({ type: 'UPDATE_CHAT_HISTORY', payload: appStateContext?.state.currentChat });
            }
        } else {
            // if cosmos DB not available - new chat (don't save the history)
            appStateContext?.dispatch({ type: 'UPDATE_CURRENT_CHAT', payload: null });
        }
    };

    // Create input element as SearchInput (for searching document list)
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        setSearchInput(e.target.value);
    };

    const updateFilters = (filters: Filters) => {
        setFilters(filters);
        setIsFilterPanelOpen(false);
    };

    const resetFilters = () => {
        setFilters({ ...defaultFilters });
        setMetadataFilters({ ...defaultMetadataFilters });
    };

    const updateMetadataFilters = (filters: MetadataFilters) => {
        setMetadataFilters(filters);
    };

    const handleMetadataFilterPanelDismiss = () => {
        setIsMetadataFilterPanelOpen(false);
    };

    useEffect(() => {
        if (copyClicked) {
            setCopyText('Copied URL');
        }
    }, [copyClicked]);

    useEffect(() => {}, [appStateContext?.state.isCosmosDBAvailable.status]);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth <= 600 || isCitationPanelOpen || sidePanelState === SidePanelStates.Default) {
                setShareLabel(undefined);
                setInfoLabel(undefined);
                setFiltersLabel(undefined);
                setFeedbackLabel(undefined);
                setScriptDashboardLabel(undefined);
                setAdminLabel(undefined);
                setTourLabel(undefined);
                setHideHistoryLabel(undefined);
                setShowHistoryLabel(undefined);
            } else {
                setShareLabel('Share');
                setInfoLabel('Info');
                setFiltersLabel('Filter');
                setFeedbackLabel('Feedback');
                setScriptDashboardLabel('SCRIPT');
                setAdminLabel('Manage Users');
                setTourLabel('Tour');
                setHideHistoryLabel(undefined);
                setShowHistoryLabel(undefined);
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, [isCitationPanelOpen, sidePanelState]);

    useEffect(() => {
        if (appStateContext?.state.frontendSettings?.hasAcceptedTerms === false) {
            setIsInfoPanelOpen(true);
        }
    }, [appStateContext?.state.frontendSettings?.hasAcceptedTerms]);

    // Define a function to update isCitationPanelOpen
    const handleCitationPanelStateChange = (isCitationPanelOpen: boolean) => {
        setIsCitationPanelOpen(isCitationPanelOpen);
        if (window.innerWidth <= 600 || isCitationPanelOpen || sidePanelState === SidePanelStates.Default) {
            setShareLabel(undefined);
            setInfoLabel(undefined);
            setFiltersLabel(undefined);
            setFeedbackLabel(undefined);
            setScriptDashboardLabel(undefined);
            setAdminLabel(undefined);
            setTourLabel(undefined);
            setHideHistoryLabel(undefined);
            setShowHistoryLabel(undefined);
        } else {
            setShareLabel('Share');
            setInfoLabel('Info');
            setFiltersLabel('Filter');
            setFeedbackLabel('Feedback');
            setScriptDashboardLabel('SCRIPT');
            setAdminLabel('Manage Users');
            setTourLabel('Tour');
            setHideHistoryLabel(undefined);
            setShowHistoryLabel(undefined);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.layout}>
                <header className={styles.header} role={'banner'}>
                    <Stack horizontal verticalAlign="center" horizontalAlign="space-between">
                        <Stack horizontal verticalAlign="center" className={styles.headerContainerLeft}>
                            <div className={styles.headerIconsContainer}>
                                <img alt="MOD" src={ui?.logo ? ui.logo : MOD} className={styles.headerIcon} aria-hidden="true" />
                                <img alt="DES" src={ui?.logo ? ui.logo : DES} className={styles.headerIcon} aria-hidden="true" style={{ width: '61px' }} />
                            </div>
                            <Link to="/" className={styles.headerTitleContainer}>
                                <h1 className={styles.headerTitle}>IRiS</h1>
                                <h1 className={`${styles.headerTitle} ${styles.headerTitleFull}`}>: AI-Enhanced PQ and Correspondence Process</h1>
                            </Link>
                        </Stack>
                        <div className={styles.headerContainerRight}>
                            <h1 className={styles.classification}>OFFICIAL SENSITIVE</h1>
                        </div>
                    </Stack>
                </header>
                <Outlet />
                <Dialog
                    onDismiss={handleSharePanelDismiss}
                    hidden={!isSharePanelOpen}
                    styles={{
                        main: [
                            {
                                selectors: {
                                    ['@media (min-width: 600px)']: {
                                        maxWidth: '600px',
                                        background: '#FFFFFF',
                                        boxShadow: '0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)',
                                        borderRadius: '8px',
                                        maxHeight: '200px',
                                        minHeight: '100px',
                                    },
                                },
                            },
                        ],
                    }}
                    dialogContentProps={{
                        title: 'Share the web app',
                        showCloseButton: true,
                    }}
                >
                    <Stack horizontal verticalAlign="center" style={{ gap: '8px' }}>
                        <TextField className={styles.urlTextBox} defaultValue={window.location.href} readOnly />
                        <div
                            className={styles.copyButtonContainer}
                            role="button"
                            tabIndex={0}
                            aria-label="Copy"
                            onClick={handleCopyClick}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? handleCopyClick() : null)}
                        >
                            <CopyRegular className={styles.copyButton} />
                            <span className={styles.copyButtonText}>{copyText}</span>
                        </div>
                    </Stack>
                </Dialog>

                <InformationPanel isInfoPanelOpen={isInfoPanelOpen} handleInfoPanelDismiss={handleInfoPanelDismiss} />

                <FilterPanel
                    isFilterPanelOpen={isFilterPanelOpen}
                    handleFilterPanelDismiss={handleFilterPanelDismiss}
                    filters={filters}
                    updateFilters={updateFilters}
                    defaultFilters={defaultFilters}
                />

                <MetadataFilterPanel
                    isOpen={isMetadataFilterPanelOpen}
                    handleDismiss={handleMetadataFilterPanelDismiss}
                    filters={metadataFilters}
                    updateFilters={updateMetadataFilters}
                    defaultFilters={defaultMetadataFilters}
                />

                <FeedbackDialog isFeedbackPanelOpen={isFeedbackPanelOpen} handleFeedbackPanelDismiss={handleFeedbackPanelDismiss} />
            </div>
            <div className={styles.flexContainer}>
                <div className={`${styles.chatSkyscraper} ${isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? styles.reducedWidth : ''}`}>
                    <Stack className={styles.skyscraperContainer}>
                        <Stack.Item grow>
                            <Stack tokens={{ childrenGap: 8 }} style={{ marginTop: '7px' }}>
                                <PanelButton
                                    id="sidebar-button"
                                    onClick={handleSidePanelClick}
                                    text={sidePanelState === SidePanelStates.Expanded && !isCitationPanelOpen ? 'Sidebar' : ''}
                                    icon="SidePanel"
                                    tooltipText={sidePanelState === SidePanelStates.Expanded ? 'Minimize sidebar' : 'Expand sidebar'}
                                    style={{
                                        width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? '48px' : '',
                                        padding: '5px 8px',
                                    }}
                                />
                                <PanelButton
                                    id="info-button"
                                    onClick={() => setIsInfoPanelOpen(true)}
                                    text={infoLabel}
                                    icon="Info"
                                    tooltipText="Information and user guidance"
                                    style={{
                                        width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? 'auto' : '',
                                        padding: '5px 8px',
                                    }}
                                />
                                {ui?.show_share_button && (
                                    <PanelButton
                                        onClick={handleShareClick}
                                        text={shareLabel}
                                        icon="Share"
                                        tooltipText="Share conversation link"
                                        style={{
                                            width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? 'auto' : '',
                                            padding: '5px 8px',
                                        }}
                                    />
                                )}
                                {ui?.show_history && appStateContext?.state.isCosmosDBAvailable?.status !== CosmosDBStatus.NotConfigured && (
                                    <PanelButton
                                        onClick={handleHistoryClick}
                                        text={appStateContext?.state?.isChatHistoryOpen ? hideHistoryLabel : showHistoryLabel}
                                        icon="History"
                                        tooltipText="Chat history"
                                        style={{
                                            border: 'none',
                                            width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? 'auto' : '',
                                            padding: '5px 8px',
                                        }}
                                    />
                                )}

                                <PanelButton
                                    id="tour-button"
                                    onClick={() => setShouldShowTour(true)}
                                    text={tourLabel}
                                    icon="F12DevTools"
                                    tooltipText={
                                        shouldShowTour
                                            ? 'The tool walk through is active. Click through the blue buttons to receive detailed instructions and tips on how to use the tool. Please note that the walkthrough will automatically end once you have completed the chat.'
                                            : 'Interactive tool walk through'
                                    }
                                    style={{
                                        width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? 'auto' : '',
                                        padding: '5px 8px',
                                    }}
                                    styles={{
                                        root: {
                                            background: `${(shouldShowTour || tourFirstStepComplete) && tourSecondStepComplete === false ? '#cea1ee' : '#F2F2F2'} !important`,
                                        },
                                        rootHovered: {
                                            background: 'rgb(200, 200, 200) !important',
                                        },
                                    }}
                                />
                                <AppTour
                                    shouldShowTour={shouldShowTour}
                                    setShouldShowTour={setShouldShowTour}
                                    firstResponseLoaded={firstResponseLoaded}
                                    isInfoPanelOpen={isInfoPanelOpen}
                                    firstStepComplete={tourFirstStepComplete}
                                    setFirstStepComplete={setTourFirstStepComplete}
                                    secondStepComplete={tourSecondStepComplete}
                                    setSecondStepComplete={setTourSecondStepComplete}
                                />

                                <PanelButton
                                    id="script-button"
                                    onClick={handleScriptDashboardClick}
                                    text={scriptDashboardLabel}
                                    icon="CompanyDirectory"
                                    tooltipText="Access to SCRIPT: Supplier information by constituency"
                                    style={{
                                        width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? 'auto' : '',
                                        padding: '5px 8px',
                                    }}
                                />

                                <PanelButton
                                    id="feedback-button"
                                    onClick={handleFeedbackClick}
                                    text={feedbackLabel}
                                    icon="feedback"
                                    tooltipText="Submit feedback, bugs and issues"
                                    style={{
                                        width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? 'auto' : '',
                                        padding: '5px 8px',
                                    }}
                                />

                                {userAccess?.role === Role.Admin && (
                                    <PanelButton
                                        id="admin-button"
                                        onClick={() => navigate(IrisRoute.ADMIN_USERS)}
                                        text={adminLabel}
                                        tooltipText="Manage users"
                                        icon="WorkforceManagement"
                                        style={{
                                            width: isCitationPanelOpen || sidePanelState === SidePanelStates.Default ? 'auto' : '',
                                            padding: '5px 8px',
                                        }}
                                    />
                                )}
                            </Stack>
                        </Stack.Item>
                    </Stack>
                </div>
                <Chat
                    className="chat"
                    isCitationPanelOpen={isCitationPanelOpen}
                    setIsCitationPanelOpen={handleCitationPanelStateChange}
                    sidePanelState={sidePanelState}
                    filters={filters}
                    metadataFilters={metadataFilters}
                    showFilterPanel={showFilterPanel}
                    resetFilters={resetFilters}
                    triggerResponseReceived={() => setFirstResponseLoaded(true)}
                    isFiltersChanged={isFiltersChanged}
                />
            </div>
            <div className={styles.footerContent}>A DE&S-built tool for Defence, powered by DG Transformation</div>
        </div>
    );
};

export default Layout;
