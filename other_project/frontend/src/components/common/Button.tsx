import { CommandBarButton, ActionButton as FluentActionButton, IButtonProps, Icon, TooltipHost, IRawStyle, DirectionalHint } from '@fluentui/react';

import styles from './Button.module.css';

interface ButtonProps extends IButtonProps {
    onClick: () => void;
    text?: string | undefined;
    icon?: string;
    style?: React.CSSProperties;
    modified?: boolean;
    id?: string | undefined;
    tooltipText?: string;
    dataTestId?: string | undefined;
}

// Settings panel
export const FilterButton: React.FC<ButtonProps> = ({ onClick, text, style, id }) => {
    return <CommandBarButton className={styles.settingsButtonRoot} iconProps={{ iconName: 'Filter' }} onClick={onClick} text={text} style={style} id={id} />;
};

export const PanelButton: React.FC<ButtonProps> = ({ onClick, text, style, id, icon, tooltipText, styles: buttonStyles }) => {
    return (
        <TooltipHost
            content={tooltipText}
            directionalHint={DirectionalHint.rightCenter}
            tooltipProps={{
                styles: {
                    content: {
                        fontSize: '14px',
                        textAlign: 'center',
                        color: 'black',
                    },
                },
            }}
            calloutProps={{
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
            id={`${id}-tooltip`}
        >
            <CommandBarButton className={styles.feedbackButtonRoot} iconProps={{ iconName: icon }} onClick={onClick} text={text} style={style} styles={buttonStyles} id={id} />
        </TooltipHost>
    );
};

export const FiltersActionButton: React.FC<ButtonProps> = ({ onClick, text }) => {
    return <CommandBarButton className={styles.filtersActionButton} onClick={onClick} text={text} />;
};

export const ActionButton: React.FC<ButtonProps> = ({ onClick, text, icon, iconProps, style, id, disabled, className }) => {
    return (
        <FluentActionButton
            iconProps={iconProps || { iconName: icon }}
            className={`${styles.actionButtonRoot} ${className} ${disabled ? styles.disabled : ''}`}
            onClick={onClick}
            text={text}
            style={style}
            id={id}
        />
    );
};

// General feedback
export const GeneralFeedbackButton: React.FC<ButtonProps> = ({ onClick, text, style }) => {
    return <CommandBarButton className={styles.generalFeedbackButtonRoot} iconProps={{ iconName: 'OfficeChat' }} onClick={onClick} text={text} style={style} />;
};

// Report a bug from feedback panel
export const ReportBugButton: React.FC<ButtonProps> = ({ onClick, text, style }) => {
    return <CommandBarButton className={styles.reportBugButtonRoot} iconProps={{ iconName: 'Bug' }} onClick={onClick} text={text} style={style} />;
};

// Report an error from chat window
export const TryAgainButton: React.FC<ButtonProps> = ({ onClick, text }) => {
    return <CommandBarButton className={styles.tryAgainButtonRoot} iconProps={{ iconName: 'Refresh' }} onClick={onClick} text={text} />;
};

// Document list panel
export const DocsButton: React.FC<ButtonProps> = ({ onClick, text }) => {
    return <CommandBarButton className={styles.docsButtonRoot} iconProps={{ iconName: 'TextDocument' }} onClick={onClick} text={text} />;
};

// Link to user guidance documents
export const UserGuidanceButton: React.FC<ButtonProps> = ({ onClick, text }) => {
    return <CommandBarButton className={styles.userGuidanceButtonRoot} iconProps={{ iconName: 'MiniExpand' }} onClick={onClick} text={text} />;
};

// Button to show and submit example prompts
export const ExamplePromptButton: React.FC<ButtonProps> = ({ onClick, text, icon, modified }) => {
    return <CommandBarButton className={`${styles.examplePromptButtonRoot} ${modified ? styles.selected : ''}`} onClick={onClick} text={text} iconProps={{ iconName: icon }} />;
};

interface ModeButtonProps extends ButtonProps {
    tag?: string;
    small?: boolean;
}

export const ModeButton: React.FC<ModeButtonProps> = ({ onClick, text, icon, modified, tag, small, id, dataTestId }) => {
    return (
        <div className={`${styles.modeButton} ${small ? styles.customAction : ''} ${modified ? styles.selected : ''}`} onClick={onClick} data-testid={dataTestId} id={id}>
            <Icon className={`${styles.modeButtonIcon} ${small ? styles.smallIcon : ''}`} iconName={icon} />
            <span className={styles.modeButtonLabel}>{text}</span>
            {tag ? <div className={styles.modeButtonTag}>{tag}</div> : ''}
        </div>
    );
};

// Button to open reference links
export const ReferenceLinkButton: React.FC<ButtonProps> = ({ onClick, text, id, tooltipText }) => {
    return (
        <TooltipHost
            content={tooltipText}
            tooltipProps={{
                styles: {
                    content: {
                        fontSize: '14px',
                        textAlign: 'center',
                        color: 'black',
                    },
                },
            }}
            calloutProps={{
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
            id={`${id}-tooltip`}
        >
            <CommandBarButton className={styles.referenceLinkButtonRoot} onClick={onClick} text={text} aria-label={`${id} button`} aria-describedby={`${id}-tooltip`} />
        </TooltipHost>
    );
};

interface BannerButtonProps extends ButtonProps {
    tooltipText?: string;
    iconStyles?: IRawStyle;
    buttonStyles?: IRawStyle;
    buttonHoveredStyles?: IRawStyle;
}

export const BannerButton: React.FC<BannerButtonProps> = ({ onClick, text, id, icon, tooltipText, iconStyles, buttonStyles, buttonHoveredStyles, disabled }) => {
    return (
        <TooltipHost
            content={tooltipText}
            tooltipProps={{
                styles: {
                    content: {
                        fontSize: '14px',
                        textAlign: 'center',
                        color: 'black',
                    },
                },
            }}
            calloutProps={{
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
            id={`${id}-tooltip`}
        >
            <CommandBarButton
                role="button"
                text={text}
                styles={{
                    icon: {
                        color: 'rgb(50, 49, 48)',
                        maxHeight: '30px',
                        fontSize: '20px',
                        paddingTop: '1px',
                        ...iconStyles,
                    },
                    root: {
                        background: '#fff',
                        width: '32px',
                        height: '32px',
                        maxWidth: '32px',
                        maxHeight: '32px',
                        border: '1px solid lightgray',
                        marginRight: '5px',
                        borderRadius: '4px',
                        ...buttonStyles,
                    },
                    rootHovered: {
                        background: 'rgb(200,200,200)',
                        selectors: {
                            '.ms-Button-icon': {
                                color: 'rgb(50, 49, 48)',
                            },
                        },
                        ...buttonHoveredStyles,
                    },
                    rootPressed: {
                        background: 'rgb(200,200,200)',
                        selectors: {
                            '.ms-Button-icon': {
                                color: 'rgb(50, 49, 48)',
                            },
                        },
                    },
                    iconDisabled: {
                        color: 'rgb(255, 255, 0)',
                    },
                    rootDisabled: {
                        background: 'rgb(255,255,255,0)',
                    },
                }}
                iconProps={{ iconName: icon }}
                onClick={onClick}
                aria-label={`${id} button`}
                aria-describedby={`${id}-tooltip`}
                id={id}
                disabled={disabled}
            />
        </TooltipHost>
    );
};

export const InlineButton: React.FC<BannerButtonProps> = ({ onClick, text, id, icon, tooltipText, iconStyles, buttonStyles }) => {
    return (
        <TooltipHost
            content={tooltipText}
            tooltipProps={{
                styles: {
                    content: {
                        fontSize: '14px',
                        textAlign: 'center',
                        color: 'black',
                    },
                },
            }}
            calloutProps={{
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
            id={`${id}-tooltip`}
        >
            <CommandBarButton
                role="button"
                text={text}
                styles={{
                    icon: {
                        color: 'rgb(50, 49, 48)',
                        maxHeight: '30px',
                        fontSize: '20px',
                        paddingTop: '1px',
                        ...iconStyles,
                    },
                    root: {
                        background: '#fff',
                        width: '32px',
                        height: '32px',
                        maxWidth: '32px',
                        maxHeight: '32px',
                        border: '1px solid lightgray',
                        marginRight: '5px',
                        borderRadius: '4px',
                        ...buttonStyles,
                    },
                    rootHovered: {
                        background: 'rgb(200,200,200)',
                        selectors: {
                            '.ms-Button-icon': {
                                color: 'rgb(50, 49, 48)',
                            },
                        },
                    },
                    rootPressed: {
                        background: 'rgb(200,200,200)',
                        selectors: {
                            '.ms-Button-icon': {
                                color: 'rgb(50, 49, 48)',
                            },
                        },
                    },
                }}
                iconProps={{ iconName: icon }}
                onClick={onClick}
                aria-label={`${id} button`}
                aria-describedby={`${id}-tooltip`}
                id={id}
            />
        </TooltipHost>
    );
};

interface RelevanceHelpButtonProps {
    tooltipText?: string;
    iconStyles?: IRawStyle;
    icon: string;
    id: string;
}

export const RelevanceHelpButton: React.FC<RelevanceHelpButtonProps> = ({ icon, id, tooltipText, iconStyles }) => {
    return (
        <TooltipHost
            content={tooltipText}
            tooltipProps={{
                styles: {
                    content: {
                        fontSize: '14px',
                        textAlign: 'center',
                        color: 'black',
                    },
                },
            }}
            calloutProps={{
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
            id={`${id}-tooltip`}
        >
            <CommandBarButton
                role="button"
                styles={{
                    icon: {
                        color: 'rgb(50, 49, 48)',
                        maxHeight: '16px',
                        fontSize: '16px',
                        paddingTop: '5px',
                        paddingBottom: '0px',
                        ...iconStyles,
                    },
                    root: {
                        background: 'transparent',
                        border: 'none',
                        marginRight: '0px',
                        borderRadius: '4px',
                        padding: '0px',
                    },
                    rootHovered: {
                        background: 'transparent',
                        selectors: {
                            '.ms-Button-icon': {
                                color: 'rgb(50, 49, 48)',
                            },
                        },
                    },
                }}
                iconProps={{ iconName: icon }}
                aria-label={`${id} button`}
                aria-describedby={`${id}-tooltip`}
            />
        </TooltipHost>
    );
};
