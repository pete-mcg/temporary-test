import { Callout, Dialog, DirectionalHint, Icon, Stack, TooltipHost } from '@fluentui/react';
import React, { useContext, useState } from 'react';
import { UserGuidanceButton, ActionButton } from '../common/Button';

import styles from './InformationPanel.module.css';
import { AppStateContext } from '../../state/AppProvider';
import Checkbox from '../Checkbox/Checkbox';
import { acceptTerms, FrontendSettings, frontendSettings } from '../../api';
import { getSasUrl } from '../../utils/utils';

interface InformationPanelProps {
    isInfoPanelOpen: boolean;
    handleInfoPanelDismiss: () => void;
}

export const InformationPanel: React.FC<InformationPanelProps> = ({ isInfoPanelOpen, handleInfoPanelDismiss }) => {
    const appStateContext = useContext(AppStateContext);
    const USER_GUIDANCE_LINK = appStateContext?.state.frontendSettings?.ui?.user_guidance_link;

    const [aboutVisibile, setAboutVisible] = useState(false);
    const [ethicsVisible, setEthicsVisible] = useState(false);

    const [termsAgreed, setTermsAgreed] = useState(false);
    const alreadyAgreed = appStateContext?.state.frontendSettings?.hasAcceptedTerms;

    const last_refresh_date = appStateContext?.state.getDatabaseInfo?.lastRefresh;

    const handleUserGuidanceClick = () => {
        hidePopups();

        window.open(USER_GUIDANCE_LINK, '_blank');
    };

    const handleDocsClick = async () => {
        const container = appStateContext?.state.frontendSettings?.azure_storage_container_name;
        const blob = 'DX4D_eCase_document_list.txt';

        if (!container) {
            console.error('Azure storage container name is missing.');
            return;
        }

        const sasUrl = await getSasUrl(container, blob);
        if (sasUrl) {
            window.open(sasUrl, '_blank');
        }
    };

    const closeInfoPanel = () => {
        hidePopups();

        if (alreadyAgreed) {
            handleInfoPanelDismiss();
            return;
        }

        if (termsAgreed) {
            handleInfoPanelDismiss();
            acceptTerms().then(() => {
                // Update frontend settings which stores the terms agreement
                frontendSettings()
                    .then((response) => {
                        appStateContext?.dispatch({ type: 'FETCH_FRONTEND_SETTINGS', payload: response as FrontendSettings });
                    })
                    .catch((err) => {
                        console.error('There was an issue fetching your data.');
                    });
            });
        }
    };

    const toggleAboutPopup = () => {
        if (!aboutVisibile) {
            hidePopups();

            setAboutVisible(true);
        } else {
            hidePopups();
        }
    };

    const toggleEthicsPopup = () => {
        if (!ethicsVisible) {
            hidePopups();

            setEthicsVisible(true);
        } else {
            hidePopups();
        }
    };

    const hidePopups = () => {
        setAboutVisible(false);
        setEthicsVisible(false);
    };

    return (
        <Dialog
            onDismiss={closeInfoPanel}
            modalProps={{
                isBlocking: !alreadyAgreed,
                responsiveMode: 0,
            }}
            hidden={!isInfoPanelOpen}
            styles={{
                main: [
                    {
                        selectors: {
                            background: '#FFFFFF',
                            boxShadow: '0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)',
                            borderRadius: '8px',
                            border: '0px solid #000000',
                            ['@media (min-width: 768px)']: {
                                minWidth: '700px',
                                width: '700px',
                            },
                            ['@media (max-width: 768px)']: {
                                minWidth: '100%',
                                width: '100%',
                            },
                        },
                    },
                ],
                root: {
                    selectors: {
                        '.ms-Dialog-button--close:hover': {
                            backgroundColor: '#744496',
                        },
                        '.ms-Button-icon': {
                            fontSize: '30px',
                            color: 'black',
                        },
                    },
                },
            }}
            dialogContentProps={{
                showCloseButton: false,
                title: (
                    <>
                        <div onClick={closeInfoPanel} className={`${styles.closeButton} ${!alreadyAgreed && !termsAgreed ? styles.showTooltip : ''}`}>
                            <Icon iconName="ChromeClose" />

                            <div className={styles.closeTooltip}>Please read through all the content and confirm the terms and conditions</div>
                        </div>

                        <div style={{ width: '100%', padding: '0 24px' }}>
                            <h1 style={{ margin: '10px', fontSize: '30px' }}>IRiS</h1>
                            <h2 style={{ fontSize: '20px', margin: '0px', fontWeight: 'normal' }}>AI-Enhanced PQ and Correspondence Process</h2>
                            {last_refresh_date ? (
                                <span style={{ color: 'red', fontSize: '15px', fontWeight: 'normal' }}>
                                    Data was last refreshed on {last_refresh_date}
                                    <div className={styles.documentButton}>
                                        <Icon onClick={handleDocsClick} iconName="TextDocument" />
                                    </div>
                                </span>
                            ) : (
                                ''
                            )}
                            <hr style={{ border: '2px solid lightgray' }}></hr>
                        </div>
                    </>
                ),
                styles: {
                    title: {
                        padding: '0px',
                        flex: '1',
                        display: 'flex',
                        justifyContent: 'center',
                        margin: '0',
                    },
                    header: {
                        display: 'flex',
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        alignContent: 'center',
                        flexWrap: 'nowrap',
                        margin: '0',
                        textAlign: 'center',
                    },
                    topButton: {
                        padding: '0',
                        position: 'absolute',
                        height: 'auto',
                        top: '12px',
                        paddingRight: '15px',
                    },
                },
            }}
        >
            <Stack>
                <div>
                    <div>
                        IRiS is designed to improve the PQ and FOI process. The tool has limitations and should be used alongside eCase. First, review the content on this page, confirmation of your
                        agreement is logged against your profile.
                    </div>
                    <ul className={styles.list}>
                        <li>
                            <Icon iconName="Error" />
                            <b>Accountability. </b>You are responsible for how you utilise the outputs.
                        </li>
                        <li>
                            <Icon iconName="Error" />
                            <b>Official Sensitive. </b>This tool is only appropriate for use up to Official Sensitive.
                        </li>
                        <li>
                            <Icon iconName="Error" />
                            <b>No Personal Data. </b>Do not enter any personal identifiable information about yourself or others.
                        </li>
                        <li>
                            <Icon iconName="Error" />
                            <b>Usage is Logged. </b>All user inputs are recorded and can be tracked back to you.
                        </li>
                        <li>
                            <Icon iconName="Error" />
                            <b>Validate Responses. </b>AI can make mistakes, always check critical information.
                        </li>
                        <li>
                            <Icon iconName="Error" />
                            <b>Missing Data. </b>Text-based images cannot be read, for example responses created from screenshots.
                        </li>
                    </ul>

                    <Stack className={styles.altButtons} horizontal horizontalAlign="center" verticalAlign="center" style={{ marginTop: '10px' }}>
                        <ActionButton className={`aboutButton ${styles.altButton}`} icon="Unknown" id="AboutButton" onClick={toggleAboutPopup} text="About IRiS" />

                        <ActionButton className={`ethicsButton ${styles.altButton}`} icon="PeopleAlert" id="EthicsButton" onClick={toggleEthicsPopup} text="AI Ethics" />

                        <TooltipHost
                            content="Visit the DefNet site for guidance, training and tips on how to use IRiS."
                            tooltipProps={{
                                styles: {
                                    content: {
                                        fontSize: '14px',
                                        textAlign: 'center',
                                        color: 'rgb(0,0,0)',
                                    },
                                },
                            }}
                            calloutProps={{
                                directionalHint: DirectionalHint.topCenter,
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
                            id="userguidancebutton-tooltip"
                        >
                            <UserGuidanceButton onClick={handleUserGuidanceClick} text="Help & Training" />
                        </TooltipHost>
                    </Stack>

                    {aboutVisibile && (
                        <Callout
                            className={styles.callout}
                            role="dialog"
                            gapSpace={0}
                            target={'#AboutButton'}
                            setInitialFocus
                            directionalHint={DirectionalHint.topCenter}
                            styles={{
                                beakCurtain: {
                                    borderRadius: '10px',
                                },
                            }}
                        >
                            <div>
                                <h2 className={styles.calloutHeadings}>
                                    <Icon iconName="Unknown" />
                                    About IRiS
                                </h2>
                                <div onClick={() => setAboutVisible(false)} className={`${styles.closeButton}`}>
                                    <Icon iconName="ChromeClose" />
                                </div>
                                <div className={styles.aboutList}>
                                    <p>
                                        <b>What is IRiS?</b>A tool designed to manage and streamline the process of handling Parliamentary Questions (PQs) and Freedom of Information (FOI) requests
                                        within the Ministry of Defence (MOD). Built by DE&S, powered by DG Transformation, IRiS is an AI tool for Defence.
                                    </p>
                                    <p>
                                        <b>How does IRiS work?</b>It leverages advanced technologies, including Generative Artificial Intelligence (Gen AI), to improve the efficiency, accuracy, and
                                        consistency of responses to PQs and FOI requests.
                                    </p>
                                    <p>
                                        <b>Intelligent Search and Retrieval</b>The tool uses Large Language Model (LLM) and Retrieval Augmented Generation (RAG) to perform intelligent searches accross
                                        previous answers and documents. This helps in quickly finding relevant information and addressing similar incoming questions more effectively.
                                    </p>
                                    <p>
                                        <b>Drafting Support</b>The tool provides assisted drafting features, such as template creation and style or grammar guidance, to streamline drafting and improve
                                        document quality. It also supports quality assurance by identifying inconsistencies and ensuring data accuracy, maintaing high standards in drafted content.
                                    </p>
                                    <p>
                                        <b>User Experience</b>The tool offers a human-like discussion interface for general advice on completing PQs and FOIs, simplifying the process for users and
                                        improving their overall experience.
                                    </p>
                                </div>
                            </div>
                        </Callout>
                    )}

                    {ethicsVisible && (
                        <Callout
                            className={styles.callout}
                            role="dialog"
                            gapSpace={0}
                            target={'#EthicsButton'}
                            setInitialFocus
                            directionalHint={DirectionalHint.topCenter}
                            styles={{
                                beakCurtain: {
                                    borderRadius: '10px',
                                },
                            }}
                        >
                            <div>
                                <h2 className={styles.calloutHeadings}>
                                    <Icon iconName="PeopleAlert" />
                                    Ethical Guidelines
                                </h2>
                                <div onClick={() => setEthicsVisible(false)} className={`${styles.closeButton}`}>
                                    <Icon iconName="ChromeClose" />
                                </div>
                                <div className={styles.ethicsList}>
                                    <p>
                                        <b>Sensitive Data</b>In addition to anything above Official Sensitive, avoid including any personal or otherwise sensitive data.
                                    </p>
                                    <p>
                                        <b>Support, Not Judgement</b>This tool should be used as an assistant, not as a replacement for human judgement.
                                    </p>
                                    <p>
                                        <b>Validate Information</b>Tools of this nature can make mistakes, please double check important information.
                                    </p>
                                    <p>
                                        <b>Potential Bias</b>Be aware that models such as this can inherit biases from large volumes of data they train on.
                                    </p>
                                    <p>
                                        <b>Use Responsibly</b>Do not use the tool for any malicious or harmful purposes.
                                    </p>
                                </div>
                            </div>
                        </Callout>
                    )}

                    <ul className={styles.list}>
                        <li>
                            <Icon iconName="Completed" />
                            <b>Have a Conversation.</b>Ask follow up questions to improve responses.
                        </li>
                        <li>
                            <Icon iconName="Completed" />
                            <b>Refresh the Chat.</b>Change the mode or click the refresh button when changing topic.
                        </li>
                        <li>
                            <Icon iconName="Completed" />
                            <b>Copy Before Closing.</b>The tool doesn't save your conversations. Keep a log of any useful outputs.
                        </li>
                        <li>
                            <Icon iconName="Completed" />
                            <b>Provide Feedback.</b>Utilise the thumbs up and down feature on responses.
                        </li>
                        <li>
                            <Icon iconName="Completed" />
                            <b>Response Limitations.</b>This tool only uses the documents uploaded from the last refresh date.
                        </li>
                    </ul>
                    <div className={styles.confirmationBox} style={{ marginTop: '10px' }}>
                        <Checkbox
                            horizontal={true}
                            style={{ width: '48px' }}
                            checked={alreadyAgreed || termsAgreed}
                            label="Please confirm that you have read and understood this tool's guidance, are aware of its limitations, and consent to having any inputs provided logged, regardless of sensitivity."
                            onChange={(standardType, isChecked) => {
                                if (!alreadyAgreed) {
                                    setTermsAgreed(isChecked);
                                }
                            }}
                        ></Checkbox>
                    </div>
                    {!alreadyAgreed && (
                        <div className={styles.footer}>
                            <ActionButton
                                className={styles.acceptButton}
                                disabled={!termsAgreed}
                                icon="CheckMark"
                                onClick={() => closeInfoPanel()}
                                text="Accept and continue"
                                style={{ marginTop: '15px' }}
                            />
                        </div>
                    )}
                </div>
            </Stack>
            <br></br>
            <i>Please note only MODNet devices can access this tool</i>
        </Dialog>
    );
};
