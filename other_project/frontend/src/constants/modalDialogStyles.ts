import { IDialogProps, IDialogContentProps } from '@fluentui/react';

export const MODAL_DIALOG_STYLES: IDialogProps['styles'] = {
    main: [
        {
            selectors: {
                background: '#FFFFFF',
                boxShadow: '0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)',
                border: '0px solid #000000',
                borderRadius: '8px',
                ['@media (min-width: 768px)']: {
                    minWidth: '600px',
                    width: '600px',
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
            '.ms-Button-icon': {
                fontSize: '30px',
                color: 'black',
            },
        },
    },
};

export const MODAL_DIALOG_CONTENT_STYLES: IDialogContentProps['styles'] = {
    title: {
        padding: '18px 10px 0 10px',
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
    inner: { padding: '0 10px 15px 10px' },
};
