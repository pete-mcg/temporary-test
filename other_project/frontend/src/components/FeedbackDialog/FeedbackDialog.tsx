import { Dialog, Stack } from '@fluentui/react';
import { PersonFeedbackRegular } from '@fluentui/react-icons';
import { FC } from 'react';
import { GeneralFeedbackButton, ReportBugButton } from '../common/Button';

interface FeedbackDialogProps {
    isFeedbackPanelOpen: boolean;
    handleFeedbackPanelDismiss: () => void;
}

export const FeedbackDialog: FC<FeedbackDialogProps> = ({ isFeedbackPanelOpen, handleFeedbackPanelDismiss }) => {
    const handleGeneralFeedbackClick = () => {
        window.open('https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=7WB3vlNZS0iuldChbfoJ5fpemqOTwLJCj7M53Q00255UMEM0NEtYNTVJSkNWR0hMTUhXNzBZTkhRSSQlQCN0PWcu', '_blank');
        handleFeedbackPanelDismiss();
    };

    const handleReportBugClick = () => {
        window.open('https://confluence.desdigital.mod.uk/display/ACFD/AI+Chatbot+Front+Door+Home', '_blank');
    };

    return (
        <Dialog
            onDismiss={handleFeedbackPanelDismiss}
            hidden={!isFeedbackPanelOpen}
            styles={{
                main: [
                    {
                        selectors: {
                            ['@media (min-width: 600px)']: {
                                maxWidth: '500px',
                                background: '#FFFFFF',
                                boxShadow: '0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)',
                                borderRadius: '8px',
                                maxHeight: '90%',
                                minHeight: '100px',
                                border: '0px solid #000000',
                                marginTop: '4px',
                            },
                        },
                    },
                ],
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
                    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 10px 0 10px' }}>
                        <PersonFeedbackRegular style={{ color: 'black', width: '40px', fontSize: '40px', marginRight: '5px' }} />
                        <h3 style={{ margin: '0', paddingBottom: '0' }}>Feedback</h3>
                    </div>
                ),
                styles: {
                    title: {
                        margin: '0',
                        marginLeft: '10px',
                        width: '100%',
                        padding: '0',
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
                        paddingTop: '10px',
                    },
                    inner: { padding: '0 10px 10px 10px' },
                },
            }}
        >
            <Stack verticalAlign="center" style={{ gap: '8px', margin: '0.5em 0.5em' }}>
                <div style={{ height: '6px' }}></div>
                <div>We appreciate your feedback to help us improve this tool.</div>
                <div>
                    Use the thumbs up or down feature on chatbot responses to rate how well the tool answered your questions. If you give a thumbs down, please tell us why so we can investigate and
                    make improvements.
                </div>
                <div>For other feedback, please use the forms below. Thank you.</div>
                <div style={{ height: '10px' }}></div>
                <Stack verticalFill horizontalAlign="center" verticalAlign="center" style={{ gap: '22px' }}>
                    <GeneralFeedbackButton onClick={handleGeneralFeedbackClick} text={'General Feedback'} />
                    <ReportBugButton onClick={handleReportBugClick} text={'Report an Issue'} />
                </Stack>
                <div style={{ height: '8px' }}></div>
            </Stack>
        </Dialog>
    );
};
