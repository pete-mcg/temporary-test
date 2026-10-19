import { Dropdown, Icon, IDropdownOption, TooltipHost } from '@fluentui/react';
import { FC, useContext, useEffect, useState } from 'react';
import { Mode, modes } from '../../api';

import styles from './DropdownModeSelector.module.css';
import { AlertDialog } from '../AlertDialog/AlertDialog';
import { AppStateContext } from '../../state/AppProvider';

interface DropdownModeSelectorProps {
    onModeSelected: (mode: Mode) => void;
}

export const DropdownModeSelector: FC<DropdownModeSelectorProps> = ({ onModeSelected }) => {
    const appStateContext = useContext(AppStateContext);

    const [isConfirmationDialogOpen, setIsConfirmationDialogOpen] = useState(false);
    const [selectedMode, setSelectedMode] = useState<Mode>();

    useEffect(() => {
        setSelectedMode(appStateContext?.state.mode);
    }, [appStateContext?.state.mode]);

    const handleDropdownChange = (e: React.FormEvent<HTMLDivElement>, option?: IDropdownOption) => {
        if (!option) {
            return;
        }

        const mode = modes.find((mode) => mode.mode === option.key);

        // Prevent changing the mode if it is already selected
        if (mode?.mode === appStateContext?.state.mode) {
            return;
        }

        setSelectedMode(mode?.mode);
        setIsConfirmationDialogOpen(true);
    };

    const changeMode = () => {
        if (!selectedMode) {
            return;
        }

        onModeSelected(selectedMode);

        setIsConfirmationDialogOpen(false);
    };

    const onConfirmationDismiss = () => {
        setSelectedMode(appStateContext?.state.mode);
        setIsConfirmationDialogOpen(false);
    };

    return (
        <TooltipHost
            content="Change task"
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
            id="dropdown-mode-tooltip"
        >
            <div aria-label="dropdown-mode-tooltip" style={{ maxWidth: '350px', minWidth: '350px' }}>
                <Dropdown
                    id="dropdown-mode-selector"
                    className={styles.dropdown}
                    options={modes.map((mode) => ({ key: mode.mode, text: mode.title, data: { icon: mode.icon } }))}
                    onRenderOption={(option) => (
                        <div style={{ display: 'flex' }}>
                            <Icon className={styles.icon} iconName={option?.data.icon} />
                            <span className={styles.title}>{option?.text}</span>
                        </div>
                    )}
                    onRenderTitle={(options) => (
                        <div style={{ display: 'flex' }}>
                            {options && <Icon className={styles.icon} iconName={options[0]?.data.icon} />}
                            {options && <span className={styles.title}>{options[0]?.text}</span>}
                        </div>
                    )}
                    styles={{
                        dropdownItem: {
                            selectors: {
                                ':hover': {
                                    backgroundColor: 'rgb(200, 200, 200)',
                                },
                            },
                        },
                        dropdownItemSelected: {
                            color: 'white',
                            backgroundColor: '#58247c',
                            selectors: {
                                ':hover': {
                                    color: 'white',
                                    backgroundColor: '#58247c',
                                },
                            },
                        },
                    }}
                    selectedKey={selectedMode}
                    onChange={handleDropdownChange}
                />

                <AlertDialog
                    title={'Are you sure?'}
                    message="Changing the task will refresh the chat and your history will be lost."
                    isOpen={isConfirmationDialogOpen}
                    onDismiss={onConfirmationDismiss}
                    actionButtonLabel="Change Mode"
                    onAction={changeMode}
                />
            </div>
        </TooltipHost>
    );
};
