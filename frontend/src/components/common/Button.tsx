import { CommandBarButton, ActionButton as FluentActionButton, IButtonProps, TooltipHost, DirectionalHint } from "@fluentui/react";

import styles from './Button.module.css';

interface ButtonProps extends IButtonProps {
    onClick: () => void;
    text?: string | undefined;
    icon?: string;
    style?: React.CSSProperties;
    modified?: boolean;
    id?: string | undefined;
    tooltipText?: string | undefined;
}

// Button to minimize and close the side panel
export const SidePanelButton: React.FC<ButtonProps> = ({ onClick, text, style, modified = false }) => {

    return (
        <CommandBarButton
            className={`${styles.sidePanelButtonRoot} ${modified ? styles.sidePanelButtonModified : ''}`}
            iconProps={{ iconName: 'SidePanel' }}
            onClick={onClick}
            text={text}
            style={style}
        />
    )
}

// Info panel
export const InfoButton: React.FC<ButtonProps> = ({ onClick, text, style, id }) => {

    return (
        <CommandBarButton
            className={styles.infoButtonRoot}
            iconProps={{ iconName: 'Info' }}
            onClick={onClick}
            text={text}
            style={style}
            id={id}
        />
    )
}

// Settings panel
export const SettingsButton: React.FC<ButtonProps> = ({ onClick, text, style }) => {

    return (
        <CommandBarButton
            className={styles.settingsButtonRoot}
            iconProps={{ iconName: 'Settings' }}
            onClick={onClick}
            text={text}
            style={style}
        />
    )
}

// Share link panel
export const ShareButton: React.FC<ButtonProps> = ({ onClick, text, style }) => {

    return (
        <CommandBarButton
            className={styles.shareButtonRoot}
            iconProps={{ iconName: 'Share' }}
            onClick={onClick}
            text={text}
            style={style}
        />
    )
}

// User history panel
export const HistoryButton: React.FC<ButtonProps> = ({ onClick, text, style }) => {
    return (
        <CommandBarButton
            className={styles.historyButtonRoot}
            text={text}
            iconProps={{ iconName: 'History' }}
            onClick={onClick}
            style={style}
        />
    )
}

// Feedback panel
export const FeedbackButton: React.FC<ButtonProps> = ({ onClick, text, style, id }) => {

    return (
        <CommandBarButton
            className={styles.feedbackButtonRoot}
            iconProps={{ iconName: 'Feedback' }}
            onClick={onClick}
            text={text}
            style={style}
            id={id}
        />
    )
}

export const TourButton: React.FC<ButtonProps> = ({ onClick, text, style, id, icon, tooltipText }) => {

    return (
        <TooltipHost
            content={tooltipText}
            directionalHint={DirectionalHint.rightCenter}
            tooltipProps={{
                styles: {
                    content: {
                        fontSize: "14px",
                        textAlign: "center",
                        color: "black",
                    },
                },
            }}
            calloutProps={{
                isBeakVisible: true,
                beakWidth: 10,
                gapSpace: 2,
                styles: {
                    root: {
                        borderRadius: "4px",
                        border: "1px solid black"
                    },
                    beak: { background: "rgb(255,255,255)" },
                    beakCurtain: { background: "rgb(255,255,255)" },
                    calloutMain: { background: "rgb(255,255,255)" },
                }
            }}
            id={`${id}-tooltip`}>
            <CommandBarButton
                className={styles.feedbackButtonRoot}
                iconProps={{ iconName: 'Nav2DMapView' }}
                onClick={onClick}
                text={text}
                style={style}
                id={id}
            />
        </TooltipHost>
    )
}

// Reset the settings panel to default
export const SettingsActionButton: React.FC<ButtonProps> = ({ onClick, text }) => {

    return (
        <CommandBarButton
            className={styles.settingsActionButtonRoot}
            onClick={onClick}
            text={text}
        />
    )
}

export const ActionButton: React.FC<ButtonProps> = ({ onClick, text, icon, style, id, disabled }) => {

    return (
        <FluentActionButton
            iconProps={{ iconName: icon }}
            className={`${styles.actionButtonRoot} ${disabled ? styles.disabled : ''}`}
            onClick={onClick}
            text={text}
            style={style}
            id={id}
        />
    )
}

// General feedback
export const GeneralFeedbackButton: React.FC<ButtonProps> = ({ onClick, text, style }) => {

    return (
        <CommandBarButton
            className={styles.generalFeedbackButtonRoot}
            iconProps={{ iconName: 'FollowUser' }}
            onClick={onClick}
            text={text}
            style={style}
        />
    )
}

// General feedback
export const ResponseFeedbackButton: React.FC<ButtonProps> = ({ onClick, text, style }) => {

    return (
        <CommandBarButton
            className={styles.responseFeedbackButtonRoot}
            iconProps={{ iconName: 'FollowUser' }}
            onClick={onClick}
            text={text}
            style={style}
        />
    )
}

// Report a bug from feedback panel
export const ReportBugButton: React.FC<ButtonProps> = ({ onClick, text, style }) => {

    return (
        <CommandBarButton
            className={styles.reportBugButtonRoot}
            iconProps={{ iconName: 'Bug' }}
            onClick={onClick}
            text={text}
            style={style}
        />
    )
}

// Report a document suggestion
export const ReportDocumentButton: React.FC<ButtonProps> = ({ onClick, text, style }) => {

    return (
        <CommandBarButton
            className={styles.reportDocumentButtonRoot}
            iconProps={{ iconName: 'FileBug' }}
            onClick={onClick}
            text={text}
            style={style}
        />
    )
}

// Report an error from chat window
export const TryAgainButton: React.FC<ButtonProps> = ({ onClick, text }) => {

    return (
        <CommandBarButton
            className={styles.tryAgainButtonRoot}
            iconProps={{ iconName: 'Refresh' }}
            onClick={onClick}
            text={text}
        />
    )
}

// Document list panel
export const DocsButton: React.FC<ButtonProps> = ({ onClick, text }) => {

    return (
        <CommandBarButton
            className={styles.docsButtonRoot}
            iconProps={{ iconName: 'Documentation' }}
            onClick={onClick}
            text={text}
        />
    )
}

// Link to user guidance documents
export const UserGuidanceButton: React.FC<ButtonProps> = ({ onClick, text }) => {

    return (
        <CommandBarButton
            className={styles.userGuidanceButtonRoot}
            iconProps={{ iconName: 'TextDocument' }}
            onClick={onClick}
            text={text}
        />
    )
}

// Training Portal
export const TrainingButton: React.FC<ButtonProps> = ({ onClick, text }) => {

    return (
        <CommandBarButton
            className={styles.actionButtonRoot}
            iconProps={{ iconName: 'Globe' }}
            onClick={onClick}
            text={text}
        />
    )
}
// HR Portal
export const PortalButton: React.FC<ButtonProps> = ({ onClick, text }) => {

    return (
        <CommandBarButton
            className={styles.actionButtonRoot}
            iconProps={{ iconName: 'Globe' }}
            onClick={onClick}
            text={text}
        />
    )
}

// About Us
export const AboutButton: React.FC<ButtonProps> = ({ onClick, text, id }) => {

    return (
        <CommandBarButton
            className={styles.actionButtonRoot}
            iconProps={{ iconName: 'Unknown' }}
            onClick={onClick}
            text={text}
            id={id}
        />
    )
}
// AI Ethics
export const EthicsButton: React.FC<ButtonProps> = ({ onClick, text, id }) => {

    return (
        <CommandBarButton
            className={styles.actionButtonRoot}
            iconProps={{ iconName: 'Compare' }}
            onClick={onClick}
            text={text}
            id={id}
        />
    )
}

// Glossary Documents
export const GlossaryButton: React.FC<ButtonProps> = ({ onClick, text }) => {

    return (
        <CommandBarButton
            className={styles.actionButtonRoot}
            iconProps={{ iconName: 'Dictionary' }}
            onClick={onClick}
            text={text}
        />
    )
}

// Button to show and submit example prompts
export const ExamplePromptButton: React.FC<ButtonProps> = ({ onClick, text, icon }) => {

    return (
        <CommandBarButton
            className={styles.examplePromptButtonRoot}
            onClick={onClick}
            text={text}
            iconProps={{ iconName: icon }}
        />
    )
}

// Button to open reference links
export const ReferenceLinkButton: React.FC<ButtonProps> = ({ onClick, text }) => {

    return (
        <CommandBarButton
            className={styles.referenceLinkButtonRoot}
            onClick={onClick}
            text={text}
            iconProps={{ iconName: 'TextDocument' }}
        />
    )
}