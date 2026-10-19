import { useContext, useState } from 'react';
import { Mode, modes } from '../../api';
import { ModeButton } from '../common/Button';
import { TooltipHost } from '@fluentui/react';
import { AppStateContext } from '../../state/AppProvider';

type ModeSelectorProps = {
    onModeSelected: (mode: Mode) => void;
};

const ModeSelector: React.FC<ModeSelectorProps> = ({ onModeSelected }) => {
    const appStateContext = useContext(AppStateContext);

    const buttons = modes.map((mode) => ({ ...mode, selected: appStateContext?.state.mode === mode.mode }));

    const setMode = (mode: Mode) => {
        onModeSelected(mode);
    };

    return (
        <>
            {buttons.map((button) => (
                <div style={{ flex: '0 1 calc(33.33% - 10px)', minWidth: '200px', maxWidth: '350px' }} key={button.mode}>
                    <TooltipHost
                        content={button.tooltip}
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
                        id="mode-button-tooltip"
                    >
                        <ModeButton
                            key={button.mode}
                            onClick={() => setMode(button.mode)}
                            text={button.title}
                            dataTestId={button.mode}
                            tag={button.tag}
                            icon={button.icon}
                            modified={button.selected}
                        />
                    </TooltipHost>
                </div>
            ))}
        </>
    );
};

export default ModeSelector;
