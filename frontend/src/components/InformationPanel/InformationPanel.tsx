import { Callout, Dialog, DirectionalHint, Icon, Stack, TooltipHost } from "@fluentui/react";
import React, { useContext, useState } from "react";
import { UserGuidanceButton, ActionButton, DocsButton, AboutButton, EthicsButton } from "../common/Button";

import styles from "./InformationPanel.module.css";
import { AppStateContext } from "../../state/AppProvider";
import Checkbox from "../Checkbox/Checkbox";
import { downloadFileToBrowser } from "../../utils/fileDownload";

interface InformationPanelProps {
    isInfoPanelOpen: boolean;
    handleInfoPanelDismiss: () => void;
    handleDocsPanelClick: () => void;
}

export const InformationPanel: React.FC<InformationPanelProps> = ({ isInfoPanelOpen, handleInfoPanelDismiss, handleDocsPanelClick }) => {
    const appStateContext = useContext(AppStateContext);
    const ui = appStateContext?.state.frontendSettings?.ui;

    const [aboutVisibile, setAboutVisible] = useState(false);
    const [ethicsVisible, setEthicsVisible] = useState(false);

    const [termsAgreed, setTermsAgreed] = useState(false);
    const [alreadyAgreed, setAlreadyAgreed] = useState(true);

    const last_refresh_date = appStateContext?.state.getDatabaseInfo?.lastRefresh;

    const handleUserGuidanceClick = async () => {
        hidePopups();

        const container = "user-guidance";
        const blob = "HR Chatbot _CHRIS_ - User Guidance and Best Practices v1.0.pdf";

       downloadFileToBrowser(container, blob, blob);

    };

    const closeInfoPanel = () => {
        hidePopups();

        if (alreadyAgreed) {
            handleInfoPanelDismiss();
            return;
        }

        if (termsAgreed) {
            setAlreadyAgreed(true);
            handleInfoPanelDismiss();
        }
    }

    const toggleAboutPopup = () => {
        if (!aboutVisibile) {
            hidePopups();

            setAboutVisible(true);
        } else {
            hidePopups();
        }
    }

    const toggleEthicsPopup = () => {
        if (!ethicsVisible) {
            hidePopups();

            setEthicsVisible(true);
        } else {
            hidePopups();
        }
    }

    const hidePopups = () => {
        setAboutVisible(false);
        setEthicsVisible(false);
    }

    return (
        <Dialog
            onDismiss={closeInfoPanel}
            modalProps={{
                isBlocking: !alreadyAgreed
            }}
            hidden={!isInfoPanelOpen}
            styles={{
                main: [{
                    selectors: {
                        ['@media (min-width: 600px)']: {
                            maxWidth: '750px',
                            background: "#FFFFFF",
                            boxShadow: "0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)",
                            borderRadius: "8px",
                            maxHeight: '90%',
                            minHeight: '100px',
                            border: "0px solid #000000"
                        }
                    }
                }],
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

                        <div style={{ width: '100%', padding: '0 24x' }}>
                            <h1 style={{ margin: '10px', fontSize: '28px' }}>{ui?.title}</h1>
                            <h2 style={{ fontSize: '20px', margin: '0px', fontWeight: 'normal' }}>Quickly access information from HR Policy, Procedure and Guidance</h2>

                            {last_refresh_date ? (
                                <span style={{ color: 'red', fontSize: '15px', fontWeight: 'normal' }}>Document List was last refreshed on {last_refresh_date}
                                </span>
                            ) : ''}
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
                }
            }}
        >
            <Stack>
                <div>
                <h2>Important Notice Regarding Tool Usage</h2>
                    <ul className={styles.list}>
                        <li><Icon iconName="Error" /><b>Official Sensitive. </b>This tool is only appropriate for use up to Official-Sensitive. No personal data.</li>
                        <li><Icon iconName="Error" /><b>Usage is Logged. </b>All use is recorded and can be tracked back to the user.</li>
                        <li><Icon iconName="Error" /><b>Responsibility. </b>Responses are for information only and do not constitute HR or legal advice.</li>
                        <li><Icon iconName="Error" /><b>Validate Responses. </b>This tool can make mistakes. Users are responsible for verifying responses.</li>
                        <li><Icon iconName="Error" /><b>Knowledge. </b>This tool only searches text (not images), in DE&S HR Policy, procedure or guidance.</li>  
                        <li style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                            <Icon iconName="Error" />
                            <span className={styles.inlineBlock}>
                                <b>People Coach. </b>
                                Anyone who does not have a People Coach, where People Coach is mentioned please refer to another appropriate reporting manager.
                            </span>
                        </li>
                    </ul>

                    {aboutVisibile && (
                        <Callout
                            className={styles.callout}
                            role="dialog"
                            gapSpace={0}
                            target={"#AboutButton"}
                            setInitialFocus
                            directionalHint={DirectionalHint.topCenter}
                            styles={{
                                beakCurtain: {
                                    borderRadius: '10px',
                                },
                            }}
                        >
                            <div>
                                <h2 className={styles.calloutHeadings}><Icon iconName="Unknown" />About This Tool</h2>
                                <div className={styles.aboutList}>
                                    <p><b>What is this tool?</b>The HR Policy Chatbot is designed to streamline the retrieval of HR-related policy, procedure and guidance within DE&S. By leveraging AI, the chatbot provides users with quick responses to queries regarding HR policies, ensuring that personnel can access information efficiently.</p>
                                    <p><b>How does it work?</b><span>The tool uses a Large Language Model (LLM) and Retrieval Augmented Generation (RAG). When you ask a question, the chatbot intelligently searches a set of<a href="#" onClick={handleDocsPanelClick}>HR documents</a>to find the most relevant extracts of information. Based on the selected extracts that it finds, the chatbot will then craft a response that is contextually appropriate and tailored to your specific question.</span></p>
                                    </div>


                            </div>
                        </Callout>
                    )}

                    {ethicsVisible && (
                        <Callout
                            className={styles.callout}
                            role="dialog"
                            gapSpace={0}
                            target={"#EthicsButton"}
                            setInitialFocus
                            directionalHint={DirectionalHint.topCenter}
                            styles={{
                                beakCurtain: {
                                    borderRadius: '10px',
                                },
                            }}
                        >
                            <div>
                                <h2 className={styles.calloutHeadings}><Icon iconName="PeopleAlert" />Ethical Guidelines</h2>
                                <div className={styles.ethicsList}>
                                    <p><b>Sensitive Data</b>In addition to anything above Official Sensitive, avoid including any personal or otherwise sensitive data.</p>
                                    <p><b>Support, Not Judgement</b>This tool should be used as an assistant, not as a replacement for human judgement.</p>
                                    <p><b>Validate Information</b>Tools of this nature can make mistakes, please double check important information.</p>
                                    <p><b>Potential Bias</b>Be aware that models such as this can inherit biases from large volumes of data they train on.</p>
                                    <p><b>Use Responsibly</b>Do not use the tool for any malicious or harmful purposes.</p>
                                </div>
                            </div>
                        </Callout>
                    )}

                    <h2>How to Use This Tool Effectively</h2>
                    <ul className={styles.list}>
                        <li><Icon iconName="Completed" /><b>Be specific.</b>Provide clear instructions and use action verbs such as: Create, Explain and Summarise.</li>
                        <li><Icon iconName="Completed" /><b>Copy before Closing.</b>This tool doesn't save conversations, please copy before closing.</li>
                        <li><Icon iconName="Completed" /><b>Feedback.</b>Use the thumbs up and down feature to rate responses or the feedback panel for comments.</li>
                        <li><Icon iconName="Completed" /><b>Refresh the Chat.</b>To change topic, click the refresh button before asking a new question.</li>
                        <li><Icon iconName="Completed" /><b>More Information.</b>Click the buttons below for more information and full user guidance.</li>

                    </ul>

                   


                <Stack horizontal horizontalAlign="center" verticalAlign="center" style={{ gap: "25px", marginTop: '15px' }}>
                    <AboutButton onClick={toggleAboutPopup} text="About" id="AboutButton"/>
                    <EthicsButton onClick={toggleEthicsPopup} text="AI Ethics" id="EthicsButton"/>
                    <DocsButton onClick={handleDocsPanelClick} text="Document List" />
                    <UserGuidanceButton onClick={handleUserGuidanceClick} text="User Guidance" />
                </Stack>                                 


                    {!alreadyAgreed ? (
                        <>
                            <div className={styles.confirmationBox} style={{ marginTop: '10px' }}>
                                <Checkbox horizontal={true} style={{ width: '48px' }} checked={termsAgreed} label="Please confirm that you have read and understood this tool's guidance, are aware of its limitations, and consent to having any inputs provided logged, regardless of sensitivity." onChange={(standardType, isChecked) => setTermsAgreed(isChecked)}></Checkbox>
                            </div>

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
                        </>
                    ) : ''}

                </div>
            </Stack>
            <br></br>
            <div style={{ textAlign: 'center'}}>
                <span style={{ color: 'red', fontSize: '15px', fontWeight: 'normal', fontStyle: 'italic' }}>By closing this information panel, you confirm that you have read and understood how to use this tool and are aware of its limitations.
                </span>
                </div>
        </Dialog>
    );
}