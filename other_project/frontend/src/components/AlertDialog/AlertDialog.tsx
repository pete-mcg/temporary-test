import { Dialog } from '@fluentui/react';
import { ActionButton } from '../common/Button';
import { ReactNode } from 'react';

interface AlertDialogProps {
    isOpen: boolean;
    title: string;
    message?: string | ReactNode;
    onDismiss: () => void;
    actionButtonLabel?: string;
    onAction?: () => void;
}

export const AlertDialog: React.FC<AlertDialogProps> = ({ isOpen, title, message, onDismiss, onAction, actionButtonLabel }) => {
    return (
        <Dialog
            onDismiss={onDismiss}
            hidden={!isOpen}
            modalProps={{
                isBlocking: true,
            }}
            styles={{
                main: [
                    {
                        selectors: {
                            ['@media (min-width: 100px)']: {
                                maxWidth: '200px',
                                background: '#FFFFFF',
                                boxShadow: '0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)',
                                borderRadius: '8px',
                                maxHeight: '90%',
                                minHeight: '100px',
                                border: '0px solid #000000',
                                marginTop: '4px',
                            },
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
                showCloseButton: false,
                title: <h3 style={{ margin: '0', paddingBottom: '0' }}>{title}</h3>,
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
                    inner: { padding: '10px' },
                },
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {message && <p>{message}</p>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                    <ActionButton style={{ marginRight: '5px' }} onClick={onDismiss} text="Cancel" />
                    {actionButtonLabel && onAction && <ActionButton onClick={onAction} text={actionButtonLabel} />}
                </div>
            </div>
        </Dialog>
    );
};
