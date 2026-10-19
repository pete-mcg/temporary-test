import { Dialog, Icon } from '@fluentui/react';
import { FC, useContext } from 'react';
import { UserGuidanceButton } from '../common/Button';
import { AppStateContext } from '../../state/AppProvider';

interface WhatToAskPanelProps {
    isPanelOpen: boolean;
    closePanel: () => void;
}

export const WhatToAskPanel: FC<WhatToAskPanelProps> = ({ isPanelOpen, closePanel }) => {
    const appStateContext = useContext(AppStateContext);
    const USER_GUIDANCE_LINK = appStateContext?.state.frontendSettings?.ui?.user_guidance_link;
    const handleUserGuidanceClick = () => {
        window.open(USER_GUIDANCE_LINK, '_blank');
    };

    return (
        <Dialog
            onDismiss={closePanel}
            hidden={!isPanelOpen}
            styles={{
                main: [
                    {
                        selectors: {
                            ['@media (min-width: 600px)']: {
                                maxWidth: '750px',
                                background: '#FFFFFF',
                                boxShadow: '0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)',
                                borderRadius: '8px',
                                maxHeight: '90%',
                                minHeight: '100px',
                                border: '0px solid #000000',
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
                showCloseButton: true,
                title: (
                    <div style={{ padding: '0 24px', width: '100%' }}>
                        <h1 style={{ fontSize: '30px', display: 'flex', alignItems: 'center', margin: '10px 0' }}>
                            <Icon iconName="Unknown" style={{ paddingTop: '4px' }} />
                            <span style={{ marginLeft: '10px' }}>What to ask next?</span>
                        </h1>
                        <hr style={{ border: '2px solid lightgray', marginBottom: '5px' }}></hr>
                    </div>
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
            <p>
                You can input follow-up queries to build on your initial input. Remember, the tool's interaction will vary in each mode. If you're unsure, refer to the user guidance or interactive
                walk-through for assistance.
            </p>
            <p>
                <b>Copy and paste a follow-up point from the list below into the chat</b> and fill in any missing information, if necessary. You can also experiment with your own follow-up inputs.
            </p>

            <div className="items" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="item" style={{ display: 'flex', marginTop: '10px' }}>
                    <Icon iconName="DocumentSearch" style={{ display: 'flex', alignItems: 'center', fontSize: '40px' }} />
                    <div className="content" style={{ marginLeft: '20px' }}>
                        <h2 style={{ margin: '0' }}>Find Related Responses</h2>
                        <ul style={{ paddingLeft: '15px', margin: '5px' }}>
                            <li>Focus on responses that include [insert topic or context].</li>
                            <li>Only focus on cases by [insert latest drafter or reporting team name]</li>
                            <li>[Change the wording or terminology so that it is different to your first input].</li>
                        </ul>
                    </div>
                </div>

                <div className="item" style={{ display: 'flex', marginTop: '20px' }}>
                    <Icon iconName="EntitlementPolicy" style={{ display: 'flex', alignItems: 'center', fontSize: '40px' }} />
                    <div className="content" style={{ marginLeft: '20px' }}>
                        <h2 style={{ margin: '0' }}>Policy and Guidance Help</h2>
                        <p style={{ margin: '5px 0' }}>The follow-up questions for this mode rely heavily on the context of your request. Examples of follow-up queries that may be helpful:</p>
                        <ul style={{ paddingLeft: '15px', margin: '5px' }}>
                            <li>Provide more detailed information to the previous response.</li>
                            <li>Can you format this information in bullet points with summaries and the headings insert [heading #1], [insert heading #2]?</li>
                        </ul>
                    </div>
                </div>

                <div className="item" style={{ display: 'flex', marginTop: '20px' }}>
                    <Icon iconName="CheckboxComposite" style={{ display: 'flex', alignItems: 'center', fontSize: '40px' }} />
                    <div className="content" style={{ marginLeft: '20px' }}>
                        <h2 style={{ margin: '0' }}>Evaluate a Draft</h2>
                        <p style={{ margin: '5px 0' }}>
                            We are currently testing the 'Evaluate a Draft' mode to enhance its performance. There can be instances where the tool does not provide a response to follow-up questions.
                        </p>
                        <p style={{ margin: '5px 0' }}>
                            We encourage you to test the mode on the types of questions you would ask next, and provide feedback on its functionality. We regularly analyse the logs to make necessary
                            improvements.
                        </p>
                    </div>
                </div>

                <div className="item" style={{ display: 'flex', marginTop: '20px' }}>
                    <Icon iconName="CannedChat" style={{ display: 'flex', alignItems: 'center', fontSize: '40px' }} />
                    <div className="content" style={{ marginLeft: '20px' }}>
                        <h2 style={{ margin: '0' }}>Ask anything</h2>
                        <p style={{ margin: '5px 0' }}>The follow-up questions for this mode rely heavily on the context of your request. Examples of follow-up queries that may be helpful:</p>
                        <ul style={{ paddingLeft: '15px', margin: '5px' }}>
                            <li>Add to your evaluation, include an introduction into the request and a conclusion of the findings.</li>
                            <li>Break down the topics of interest into groups and provide examples requests, where applicable.</li>
                            <li>Provide examples of previous FOIs or PQs where this information has been applied to.</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
                <UserGuidanceButton onClick={handleUserGuidanceClick} text="User Guidance" />
            </div>
        </Dialog>
    );
};
