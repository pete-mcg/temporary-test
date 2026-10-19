import { Dialog, Icon, Slider, Stack } from '@fluentui/react';
import { FC, useEffect, useState } from 'react';
import { FiltersActionButton } from '../common/Button';
import { MetadataCaseType, MetadataCaseTypePayload, MetadataFilters } from '../../api';
import Checkbox from '../Checkbox/Checkbox';
import { MODAL_DIALOG_STYLES, MODAL_DIALOG_CONTENT_STYLES } from '../../constants/modalDialogStyles';

import styles from './MetadataFilterPanel.module.css';

interface MetadataFilterPanelProps {
    isOpen: boolean;
    handleDismiss: () => void;
    filters: MetadataFilters;
    updateFilters: (filters: MetadataFilters) => void;
    defaultFilters: MetadataFilters;
}

const MetadataFilterPanel: FC<MetadataFilterPanelProps> = ({ isOpen, handleDismiss, filters, updateFilters, defaultFilters }: MetadataFilterPanelProps) => {
    const [foiCaseTypes, setFoiCaseTypes] = useState<Record<MetadataCaseType, boolean>>({ FOI: true });
    const [pqCaseTypes, setPqCaseTypes] = useState<Record<MetadataCaseType, boolean>>({ PQ: true });
    const [otherCaseTypes, setOtherCaseTypes] = useState<Record<MetadataCaseType, boolean>>({
        MC: true,
        TO: true,
    });
    const [monthsCutoff, setMonthsCutoff] = useState<number | null>(24);

    const caseTypeLabels: Record<string, string> = {
        FOI: 'Freedom of Information (FOI)',
        PQ: 'Parliamentary Question (PQ)',
        MC: 'Ministerial Correspondence (MC)',
        TO: 'Treat Official (TO)',
    };

    const handleCaseTypeChange = (caseType: MetadataCaseType, category: 'foi' | 'pq' | 'other') => {
        const stateMap = {
            foi: { state: foiCaseTypes, setState: setFoiCaseTypes },
            pq: { state: pqCaseTypes, setState: setPqCaseTypes },
            other: { state: otherCaseTypes, setState: setOtherCaseTypes },
        };

        const { state, setState } = stateMap[category];
        const newCheckboxes = { ...state, [caseType]: !state[caseType] };
        setState(newCheckboxes);
    };

    const areNoCaseTypesSelected = () => {
        const trueCount = Object.values({ ...foiCaseTypes, ...pqCaseTypes, ...otherCaseTypes }).filter(Boolean).length;
        return trueCount === 0;
    };

    const renderCaseTypeCheckbox = (caseType: MetadataCaseType, checked: boolean, category: 'foi' | 'pq' | 'other') => (
        <Checkbox style={{ width: '14px', height: '14px' }} horizontal key={caseType} checked={checked} onChange={() => handleCaseTypeChange(caseType, category)} label={caseTypeLabels[caseType]} />
    );

    const handleMonthsSliderChange = (value: number) => {
        setMonthsCutoff(value === 0 ? null : value);
    };

    const updateCaseTypeCheckboxes = (casetypes: MetadataCaseTypePayload) => {
        setFoiCaseTypes({ FOI: casetypes.FOI || false });
        setPqCaseTypes({ PQ: casetypes.PQ || false });

        const otherTypes = Object.entries(casetypes).filter(([key]) => ['MC', 'TO'].includes(key));
        setOtherCaseTypes(Object.fromEntries(otherTypes) as Record<MetadataCaseType, boolean>);
    };

    const handleResetSettingsClick = () => {
        updateCaseTypeCheckboxes(defaultFilters.casetypes);
        setMonthsCutoff(defaultFilters.monthsCutoff);
        updateFilters(defaultFilters);
    };

    const onPanelDismiss = () => {
        updateCaseTypeCheckboxes(filters.casetypes);
        setMonthsCutoff(filters.monthsCutoff);
        handleDismiss();
    };

    const handleSaveClick = () => {
        if (areNoCaseTypesSelected()) {
            alert('At least one case type must be selected.');
            return;
        }

        const newFilters: MetadataFilters = {
            casetypes: { ...foiCaseTypes, ...pqCaseTypes, ...otherCaseTypes },
            monthsCutoff: monthsCutoff,
        };

        updateFilters(newFilters);
        handleDismiss();
    };

    // Update the UI checkboxes and slider when the global filters change
    useEffect(() => {
        updateCaseTypeCheckboxes(filters.casetypes);
        setMonthsCutoff(filters.monthsCutoff);
    }, [filters]);

    return (
        <Dialog
            onDismiss={onPanelDismiss}
            hidden={!isOpen}
            styles={MODAL_DIALOG_STYLES}
            dialogContentProps={{
                showCloseButton: true,
                title: (
                    <div className={styles.banner}>
                        <Icon iconName="DocumentSearch" className={styles.bannerIcon} />
                        <span className={styles.bannerText} style={{ color: 'black', textAlign: 'left', fontSize: '25px' }}>
                            Metadata Retriever
                        </span>
                    </div>
                ),
                styles: MODAL_DIALOG_CONTENT_STYLES,
            }}
        >
            <Stack verticalAlign="center" style={{ gap: '0px', margin: '0.5em 0.5em' }}>
                <hr style={{ border: '2px solid lightgray', width: '100%' }}></hr>
                <div>Select the case types you want to retrieve metadata for and optionally filter by date range.</div>
                <h3>Case Type</h3>
                Choose the case type(s) you would like to retrieve:
                <Stack style={{ margin: '5px 0px' }}>
                    {/* PQ */}
                    {pqCaseTypes && Object.entries(pqCaseTypes).map(([key, value]) => renderCaseTypeCheckbox(key, value, 'pq'))}

                    {/* MC */}
                    {otherCaseTypes?.MC !== undefined && renderCaseTypeCheckbox('MC', otherCaseTypes.MC, 'other')}

                    {/* FOI */}
                    {foiCaseTypes && Object.entries(foiCaseTypes).map(([key, value]) => renderCaseTypeCheckbox(key, value, 'foi'))}

                    {/* TO */}
                    {otherCaseTypes?.TO !== undefined && renderCaseTypeCheckbox('TO', otherCaseTypes.TO, 'other')}
                </Stack>
                <h3>Date Range</h3>
                Choose how far back to search (in months):
                <div style={{ margin: '20px 0px' }}>
                    <Slider
                        label={monthsCutoff === null ? 'All time' : `Last ${monthsCutoff} months`}
                        min={0}
                        max={60}
                        step={1}
                        value={monthsCutoff ?? 0}
                        onChange={handleMonthsSliderChange}
                        showValue={false}
                    />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-evenly' }}>
                    <FiltersActionButton onClick={handleResetSettingsClick} text={'Revert to Default'} />
                    <FiltersActionButton onClick={handleSaveClick} text={'Save'} />
                </div>
            </Stack>
        </Dialog>
    );
};

export default MetadataFilterPanel;
