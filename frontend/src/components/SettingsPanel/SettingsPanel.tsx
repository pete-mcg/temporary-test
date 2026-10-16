import { Dialog, Icon, Slider, Stack, TextField } from "@fluentui/react";
import { FC, useEffect, useState } from "react";
import { SettingsActionButton } from "../common/Button";
import { SaveSyncRegular } from "@fluentui/react-icons";
import { Model, ModelPayload, models, Settings } from "../../api";
import Checkbox from "../Checkbox/Checkbox";

import styles from "./SettingsPanel.module.css"

interface SettingPanelProps {
    isSettingsPanelOpen: boolean;
    handleSettingsPanelDismiss: () => void;
    isSystemMessageEditable: boolean;
    settings: Settings;
    updateSettings: (settings: Settings) => void;
    defaultSettings: Settings;
}

const SettingPanel: FC<SettingPanelProps> = ({
    isSettingsPanelOpen,
    handleSettingsPanelDismiss,
    isSystemMessageEditable,
    settings,
    updateSettings,
    defaultSettings
}: SettingPanelProps) => {

    const [systemMessage, setSystemMessage] = useState<string | undefined>(defaultSettings.systemMessage);
    const [modelCheckboxes, setModelCheckboxes] = useState<ModelPayload>({ GPT35TURBO: true, GPT4: false });
    const [temperature, setTemperature] = useState<number>(0);

    useEffect(() => {
        // Sets the initial state of the systemMessage after it has been received from the API
        if (isSystemMessageEditable && systemMessage === undefined) {
            setSystemMessage(defaultSettings.systemMessage);
        }
    }, [defaultSettings, isSystemMessageEditable, systemMessage])

    const handleModelChange = (model: Model) => {
        const typedKey = model as keyof ModelPayload;

        // Set all checkboxes to false except the selected one
        const newCheckboxes = Object.keys(modelCheckboxes).reduce((acc, key) => {
            acc[key as keyof ModelPayload] = key === typedKey;
            return acc;
        }, {} as ModelPayload);

        setModelCheckboxes(newCheckboxes);
    }

    const handleTemperatureSliderChange = (value: number) => {
        setTemperature(prev => {
            return value;
        });
    }

    const handleResetSettingsClick = () => {
        setModelCheckboxes(defaultSettings.models)
        setTemperature(defaultSettings.temperature);
        setSystemMessage(defaultSettings.systemMessage);

        updateSettings(defaultSettings);
    }

    const onSettingPanelDismiss = () => {
        setModelCheckboxes(settings.models);
        setTemperature(settings.temperature);
        setSystemMessage(settings.systemMessage);

        handleSettingsPanelDismiss();
    }

    const handleSaveClick = () => {
        const settings: Settings = {
            models: modelCheckboxes,
            temperature: temperature,
            systemMessage: systemMessage,
        }

        updateSettings(settings);
    }

    return (
        <Dialog
            onDismiss={onSettingPanelDismiss}
            hidden={!isSettingsPanelOpen}
            styles={{

                main: [{
                    selectors: {
                        ['@media (min-width: 600px)']: {
                            maxWidth: '500px',
                            background: "#FFFFFF",
                            boxShadow: "0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)",
                            borderRadius: "8px",
                            maxHeight: '90%',
                            minHeight: '100px',
                            border: "0px solid #000000",
                            marginTop: "4px"
                        }
                    },
                }],
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
                    <div>
                        <div className={styles.banner}>
                            <Icon iconName="Settings" className={styles.bannerIcon} />
                            <span className={styles.bannerText} style={{ color: "black", textAlign: "left", fontSize: "25px" }}>
                                Settings
                            </span>
                        </div>
                        <div className={styles.headerBorder}></div>
                    </div>
                ),
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
                    inner: { padding: "10px" }
                }
            }}
        >
            <Stack verticalAlign="center" style={{ gap: "0px", margin: "0.5em 0.5em" }}>
                <div>
                    The default setting has been configured for the optimal use of the tool.
                    Additional funtionalities allow you to fine tune more specific responses.
                </div>

                {isSystemMessageEditable ? (
                    <>
                        <h3>System Instruction</h3>
                        Adding a system instruction allows you to tailor how you would like the model to behave when generating responses.
                        <TextField
                            placeholder="Enter a system instruction"
                            resizable={true}
                            autoAdjustHeight={true}
                            multiline={true}
                            onChange={(e, value) => setSystemMessage(value)}
                            value={systemMessage}
                        />
                    </>
                ) : <></>}

                <h3>Model</h3>
                Currently, this does not change the model - this is a placeholder for future toggle functionality.
                Make sure to either edit or remove this section when the functionality is implemented.
                <Stack horizontal verticalAlign="center" horizontalAlign="center" style={{ justifyContent: "space-evenly", margin: "20px 0px" }}>
                    {models.map((model) => (
                        <Checkbox checked={modelCheckboxes[model]} onChange={() => handleModelChange(model)} label={model} key={model} />
                    ))}
                </Stack>

                <h3>Temperature</h3>
                Choose the temperature you would like to use:
                <div style={{ margin: "20px 0px" }}>
                    <Slider
                        label="Select a value between 0 and 1"
                        min={0}
                        max={1}
                        step={0.01}
                        value={temperature}
                        onChange={(value) => handleTemperatureSliderChange(value)}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-evenly' }}>
                    <SettingsActionButton onClick={handleResetSettingsClick} text={"Revert to Default"} />
                    <SettingsActionButton onClick={handleSaveClick} text={"Save"} />
                </div>

                <div style={{ display: 'flex', marginTop: "20px", color: 'rgb(200,0,0)' }}>
                    <SaveSyncRegular style={{ color: "rgb(200,0,0)", width: "40px", height: "auto" }} />
                    <span style={{ color: "rgb(200,0,0)", fontSize: "14px", paddingLeft: "5px" }}>
                        <i>Please note saving new settings will refresh the chat.</i> <br />
                    </span>
                </div>
            </Stack>
        </Dialog>
    )
}

export default SettingPanel;