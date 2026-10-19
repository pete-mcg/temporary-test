import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dialog, ComboBox, IComboBoxOption, IComboBox, TextField, Spinner, SpinnerSize, Icon, Stack } from '@fluentui/react';
import { ActionButton } from '../common/Button';
import { AnnexMpOption, fetchAnnexMpList } from '../../api';
import { MODAL_DIALOG_STYLES, MODAL_DIALOG_CONTENT_STYLES } from '../../constants/modalDialogStyles';
import styles from './AnnexDialog.module.css';

interface AnnexDialogProps {
    isOpen: boolean;
    onDismiss: () => void;
    onSubmit: (mpNameList: string, mpQuestion: string, memberId: number | null) => void;
    isSubmitting: boolean;
}

export const AnnexDialog: React.FC<AnnexDialogProps> = ({ isOpen, onDismiss, onSubmit, isSubmitting }) => {
    const [mpOptions, setMpOptions] = useState<IComboBoxOption[]>([]);
    const [mpDataMap, setMpDataMap] = useState<Map<string, AnnexMpOption>>(new Map());
    const [selectedMp, setSelectedMp] = useState<string>('');
    const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
    const [question, setQuestion] = useState<string>('');
    const [isLoadingMps, setIsLoadingMps] = useState(false);
    const [error, setError] = useState<string>('');
    const [filterText, setFilterText] = useState<string>('');
    const comboBoxRef = useRef<IComboBox>(null);

    const filteredOptions = useMemo(() => {
        if (!filterText) return mpOptions;
        const lower = filterText.toLowerCase();
        return mpOptions.filter((opt) => opt.text.toLowerCase().includes(lower));
    }, [filterText, mpOptions]);

    useEffect(() => {
        if (isOpen && mpOptions.length === 0) {
            setIsLoadingMps(true);
            fetchAnnexMpList()
                .then((mps: AnnexMpOption[]) => {
                    const options = mps.map((mp) => ({
                        key: mp.name_list,
                        text: mp.name_list,
                    }));
                    const dataMap = new Map(mps.map((mp) => [mp.name_list, mp]));
                    setMpOptions(options);
                    setMpDataMap(dataMap);
                })
                .catch((err) => {
                    setError('Failed to load MP list. Please try again.');
                    console.error(err);
                })
                .finally(() => setIsLoadingMps(false));
        }
    }, [isOpen, mpOptions.length]);

    useEffect(() => {
        if (isOpen) {
            setSelectedMp('');
            setSelectedMemberId(null);
            setQuestion('');
            setError('');
            setFilterText('');
        }
    }, [isOpen]);

    const handleMpChange = useCallback(
        (_event: React.FormEvent<IComboBox>, option?: IComboBoxOption) => {
            if (option) {
                const mpName = option.key as string;
                setSelectedMp(mpName);
                const mpData = mpDataMap.get(mpName);
                setSelectedMemberId(mpData?.member_id || null);
            }
        },
        [mpDataMap],
    );

    const handleInputValueChange = useCallback((text: string) => {
        setFilterText(text);
        if (text) {
            comboBoxRef.current?.focus(true);
        }
    }, []);

    const handleSubmit = () => {
        if (!selectedMp || !question.trim()) return;
        onSubmit(selectedMp, question.trim(), selectedMemberId);
    };

    const handleDismiss = () => {
        setSelectedMp('');
        setSelectedMemberId(null);
        setQuestion('');
        setError('');
        setFilterText('');
        onDismiss();
    };

    const isSubmitDisabled = !selectedMp || !question.trim() || isSubmitting;

    return (
        <Dialog
            onDismiss={handleDismiss}
            hidden={!isOpen}
            modalProps={{ isBlocking: true }}
            styles={MODAL_DIALOG_STYLES}
            dialogContentProps={{
                showCloseButton: true,
                title: (
                    <div className={styles.banner}>
                        <Icon iconName="ContactInfo" className={styles.bannerIcon} />
                        <span style={{ color: 'black', textAlign: 'left', fontSize: '25px', fontWeight: 600 }}>Generate Information Annex</span>
                    </div>
                ),
                styles: MODAL_DIALOG_CONTENT_STYLES,
            }}
        >
            <Stack verticalAlign="center" style={{ gap: '0px', margin: '0.5em 0.5em' }}>
                <hr style={{ border: '2px solid lightgray', width: '100%' }}></hr>
                <div style={{ marginBottom: '12px' }}>
                    Use the drop-down below to search and select the name of the MP who has made the request and type the query in the text box below to generate an information annex that can be
                    appended to your response.
                </div>

                {selectedMemberId && (
                    <div className={styles.mpImageContainer}>
                        <img
                            src={`https://members-api.parliament.uk/api/Members/${selectedMemberId}/Thumbnail`}
                            alt={selectedMp}
                            className={styles.mpImage}
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                        <div className={styles.mpName}>{selectedMp}</div>
                    </div>
                )}

                <div className={styles.form}>
                    {error && <div className={styles.error}>{error}</div>}

                    <div className={styles.field}>
                        <label htmlFor="mp-combobox" className={styles.label}>
                            Member of Parliament
                        </label>
                        {isLoadingMps ? (
                            <Spinner size={SpinnerSize.small} label="Loading MPs..." />
                        ) : (
                            <ComboBox
                                id="mp-combobox"
                                componentRef={comboBoxRef}
                                placeholder="Start typing to search MPs..."
                                options={filteredOptions}
                                onChange={handleMpChange}
                                onInputValueChange={handleInputValueChange}
                                selectedKey={selectedMp}
                                autoComplete="on"
                                allowFreeform
                                useComboBoxAsMenuWidth
                                calloutProps={{
                                    calloutMaxHeight: 300,
                                }}
                            />
                        )}
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="mp-question" className={styles.label}>
                            Question
                        </label>
                        <TextField id="mp-question" placeholder="Enter the question posed by the MP..." multiline rows={4} value={question} onChange={(_ev, val) => setQuestion(val || '')} />
                    </div>

                    <div className={styles.actions}>
                        <ActionButton onClick={handleDismiss} text="Cancel" style={{ marginRight: '8px' }} />
                        <ActionButton onClick={handleSubmit} text={isSubmitting ? 'Generating...' : 'Generate Annex'} disabled={isSubmitDisabled} />
                    </div>
                </div>
            </Stack>
        </Dialog>
    );
};
