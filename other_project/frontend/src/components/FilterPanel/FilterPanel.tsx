import { Dialog, Icon, Slider, Stack } from '@fluentui/react';
import { FC, useEffect, useState } from 'react';
import { FiltersActionButton, InlineButton } from '../common/Button';
import { SaveSyncRegular } from '@fluentui/react-icons';
import { CaseType, CaseTypePayload, caseTypes, Filters } from '../../api';
import Checkbox from '../Checkbox/Checkbox';
import { MODAL_DIALOG_STYLES, MODAL_DIALOG_CONTENT_STYLES } from '../../constants/modalDialogStyles';

import styles from './FilterPanel.module.css';

interface FilterPanelProps {
    isFilterPanelOpen: boolean;
    handleFilterPanelDismiss: () => void;
    filters: Filters;
    updateFilters: (filters: Filters) => void;
    defaultFilters: Filters;
}

const FilterPanel: FC<FilterPanelProps> = ({ isFilterPanelOpen, handleFilterPanelDismiss, filters, updateFilters, defaultFilters }: FilterPanelProps) => {
    const [foiCaseTypes, setFoiCaseTypes] = useState<Record<CaseType, boolean>>({ FOI: true });
    const [pqCaseTypes, setPqCaseTypes] = useState<Record<CaseType, boolean>>({ PQLO: true, PQLW: true, PQN: true, PQO: true, PQW: true });
    const [expandPqCaseTypes, setExpandPqCaseTypes] = useState(false);
    const isSomeCaseTypeSelected = Object.values(pqCaseTypes).some((caseTypeSelected) => caseTypeSelected === true);
    const [monthsCutoff, setMonthsCutoff] = useState<number | null>(24);

    const caseTypeLabels: Record<CaseType, string> = {
        FOI: 'Freedom of Information (FOI)',
    };

    const handleFoiCaseTypeChange = (caseType: CaseType) => {
        const typedKey = caseType as keyof CaseTypePayload;
        const newCheckboxes = { ...foiCaseTypes, [caseType]: !foiCaseTypes[typedKey] };
        setFoiCaseTypes(newCheckboxes);
    };

    const handlePqCaseTypeChange = (caseType: CaseType) => {
        const typedKey = caseType as keyof CaseTypePayload;
        const newCheckboxes = { ...pqCaseTypes, [caseType]: !pqCaseTypes[typedKey] };
        setPqCaseTypes(newCheckboxes);
    };

    const areNoCaseTypesSelected = () => {
        const trueCount = Object.values({ ...foiCaseTypes, ...pqCaseTypes }).filter((value) => value).length;

        return trueCount === 0;
    };

    const handleParentPqChange = () => {
        const newPqCaseTypes = Object.fromEntries(Object.entries(pqCaseTypes).map(([key, value]) => [key, !isSomeCaseTypeSelected]));
        setPqCaseTypes(newPqCaseTypes);
    };

    const handleMonthsSliderChange = (value: number) => {
        setMonthsCutoff(value === 0 ? null : value);
    };

    const handleResetSettingsClick = () => {
        updateCaseTypeCheckboxes(defaultFilters.casetypes);
        setMonthsCutoff(defaultFilters.monthsCutoff);

        updateFilters(defaultFilters);
    };

    const onFilterPanelDismiss = () => {
        updateCaseTypeCheckboxes(filters.casetypes);
        setMonthsCutoff(filters.monthsCutoff);

        handleFilterPanelDismiss();
    };

    const updateCaseTypeCheckboxes = (caseTypes: Record<CaseType, boolean>) => {
        setFoiCaseTypes({ FOI: caseTypes.FOI });

        const newPqCaseTypes = Object.entries(caseTypes).filter(([key, value]) => key !== 'FOI');
        setPqCaseTypes(Object.fromEntries(newPqCaseTypes));
    };

    const handleSaveClick = () => {
        if (areNoCaseTypesSelected()) {
            alert('At least one case type must be selected.');
            return;
        }

        const filters: Filters = {
            casetypes: { ...foiCaseTypes, ...pqCaseTypes },
            monthsCutoff: monthsCutoff,
        };

        updateFilters(filters);
    };

    // Update the UI checkboxes and slider when the global filters change
    useEffect(() => {
        updateCaseTypeCheckboxes(filters.casetypes);
        setMonthsCutoff(filters.monthsCutoff);
    }, [filters]);

    return (
        <Dialog
            onDismiss={onFilterPanelDismiss}
            hidden={!isFilterPanelOpen}
            styles={MODAL_DIALOG_STYLES}
            dialogContentProps={{
                showCloseButton: true,
                title: (
                    <div className={styles.banner}>
                        <Icon iconName="Filter" className={styles.bannerIcon} />
                        <span style={{ color: 'black', textAlign: 'left', fontSize: '25px', fontWeight: 600 }}>Filter</span>
                    </div>
                ),
                styles: MODAL_DIALOG_CONTENT_STYLES,
            }}
        >
            <Stack verticalAlign="center" style={{ gap: '0px', margin: '0.5em 0.5em' }}>
                <hr style={{ border: '2px solid lightgray', width: '100%' }}></hr>
                <div>The default setting has been configured for the optimal use of the tool. Additional funtionalities allow you to fine tune more specific responses.</div>
                <h3>Case Type</h3>
                Choose the case type(s) you would like to search for:
                <Stack style={{ margin: '5px 0px' }}>
                    {foiCaseTypes &&
                        Object.entries(foiCaseTypes).map(([key, value]) => (
                            <Checkbox style={{ width: '14px', height: '14px' }} horizontal key={key} checked={value} onChange={() => handleFoiCaseTypeChange(key)} label={caseTypeLabels[key]} />
                        ))}

                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Checkbox
                            style={{ width: '14px', height: '14px' }}
                            horizontal
                            key={'Parliamentary Question (PQ)'}
                            checked={isSomeCaseTypeSelected}
                            onChange={() => handleParentPqChange()}
                            label={'Parliamentary Question (PQ)'}
                        />
                        <InlineButton
                            icon="ChevronDownMed"
                            tooltipText="More filters"
                            onClick={() => setExpandPqCaseTypes(!expandPqCaseTypes)}
                            id="more-case-types"
                            buttonStyles={{ minWidth: '0px', padding: '0px', width: '16px', height: '16px', marginLeft: '6px', marginTop: '4px' }}
                            iconStyles={{ padding: '0px', fontSize: '12px !important', margin: '0px' }}
                        />
                    </div>
                    {expandPqCaseTypes &&
                        pqCaseTypes &&
                        Object.entries(pqCaseTypes).map(([key, value]) => (
                            <Checkbox style={{ marginLeft: '30px', width: '14px', height: '14px' }} horizontal key={key} checked={value} onChange={() => handlePqCaseTypeChange(key)} label={key} />
                        ))}
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

export default FilterPanel;
