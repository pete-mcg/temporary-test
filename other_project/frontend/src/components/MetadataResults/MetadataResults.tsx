import { Dialog, Dropdown, IDropdownOption, TooltipHost, ITooltipHostStyles } from '@fluentui/react';
import { Info16Regular } from '@fluentui/react-icons';
import { FC, useState, useEffect } from 'react';
import { CaseMetadata } from '../../api/models';
import { FiltersActionButton } from '../common/Button';

import styles from './MetadataResults.module.css';

const ECASE_BASE_URL = 'https://mod.ecase.co.uk/view_case?case_ref=';

const generateCaseUrl = (caseRef: string): string => {
    const encodedRef = encodeURIComponent(caseRef);
    return `${ECASE_BASE_URL}${encodedRef}`;
};

interface MetadataResultsProps {
    isOpen: boolean;
    onDismiss: () => void;
    groupedMetadata: { [caseType: string]: CaseMetadata[] };
    loading: boolean;
    error: string | null;
    currentQuery?: string;
    inline?: boolean;
}

const allDisplayCountOptions: IDropdownOption[] = [
    { key: 5, text: '5 per type' },
    { key: 10, text: '10 per type' },
    { key: 20, text: '20 per type' },
    { key: 30, text: '30 per type' },
    { key: 40, text: '40 per type' },
    { key: 50, text: '50 per type' },
    { key: 60, text: '60 per type' },
    { key: 70, text: '70 per type' },
    { key: 80, text: '80 per type' },
    { key: 90, text: '90 per type' },
    { key: 100, text: '100 per type' },
];

type SortColumn = 'case_ref' | 'title' | 'date' | 'team' | 'relevance';

const MetadataResults: FC<MetadataResultsProps> = ({ isOpen, onDismiss, groupedMetadata, loading, error, currentQuery, inline = false }) => {
    const [displayCount, setDisplayCount] = useState<number>(10);
    const [baseMetadata, setBaseMetadata] = useState<{ [caseType: string]: CaseMetadata[] }>({}); // Full merged dataset
    const [sortedMetadata, setSortedMetadata] = useState<{ [caseType: string]: CaseMetadata[] }>({});
    const [sortColumn, setSortColumn] = useState<SortColumn | null>('relevance');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    // Calculate the maximum number of results across all case types (from base data, not sorted)
    const getMaxResultsCount = (): number => {
        const dataToUse = Object.keys(baseMetadata).length > 0 ? baseMetadata : groupedMetadata;
        if (!dataToUse || Object.keys(dataToUse).length === 0) return 0;

        return Math.max(...Object.values(dataToUse).map((results) => results.length));
    };

    // Get the next logical increment above the max results
    const getMaxDisplayOption = (maxResults: number): number => {
        const options = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        for (const option of options) {
            if (maxResults <= option) {
                return option;
            }
        }
        return 100; // Default to 100 if max is over 100
    };

    // Filter display options based on actual max results
    const getDisplayCountOptions = (): IDropdownOption[] => {
        const maxResults = getMaxResultsCount();
        if (maxResults === 0) return allDisplayCountOptions; // Show all if no results yet

        const maxOption = getMaxDisplayOption(maxResults);
        return allDisplayCountOptions.filter((opt) => (opt.key as number) <= maxOption);
    };

    const displayCountOptions = getDisplayCountOptions();

    // Adjust displayCount if it exceeds the maximum available option
    useEffect(() => {
        const maxResults = getMaxResultsCount();
        if (maxResults > 0) {
            const maxOption = getMaxDisplayOption(maxResults);
            if (displayCount > maxOption) {
                setDisplayCount(maxOption);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupedMetadata, baseMetadata]);

    // Merge and reorder metadata when groupedMetadata changes
    useEffect(() => {
        // Merge MCSOS into MC and all PQ variants into PQ
        const mergedMetadata: { [caseType: string]: CaseMetadata[] } = {};

        Object.entries(groupedMetadata).forEach(([caseType, results]) => {
            // Map MCSOS and POA to MC
            if (caseType === 'MCSOS' || caseType === 'POA') {
                if (!mergedMetadata['MC']) {
                    mergedMetadata['MC'] = [];
                }
                mergedMetadata['MC'].push(...results);
            }
            // Map all PQ variants to PQ
            else if (['PQW', 'PQO', 'PQN', 'PQLW', 'PQLO'].includes(caseType)) {
                if (!mergedMetadata['PQ']) {
                    mergedMetadata['PQ'] = [];
                }
                mergedMetadata['PQ'].push(...results);
            }
            // Keep other types as-is
            else {
                if (!mergedMetadata[caseType]) {
                    mergedMetadata[caseType] = [];
                }
                mergedMetadata[caseType].push(...results);
            }
        });

        // Sort merged groups by relevance and cap at 100 results each
        Object.keys(mergedMetadata).forEach((caseType) => {
            // Sort by relevance score (highest first)
            mergedMetadata[caseType].sort((a, b) => {
                const scoreA = a['@search.reranker_score'] ?? a['@search.score'] ?? 0;
                const scoreB = b['@search.reranker_score'] ?? b['@search.score'] ?? 0;
                return scoreB - scoreA; // Descending order
            });

            // Take top 100
            if (mergedMetadata[caseType].length > 100) {
                mergedMetadata[caseType] = mergedMetadata[caseType].slice(0, 100);
            }
        });

        // Apply display order: PQ, MC, FOI, TO
        const orderedMetadata: { [caseType: string]: CaseMetadata[] } = {};
        const displayOrder = ['PQ', 'MC', 'FOI', 'TO'];

        displayOrder.forEach((caseType) => {
            if (mergedMetadata[caseType]) {
                orderedMetadata[caseType] = mergedMetadata[caseType];
            }
        });

        // Store the full merged data
        setBaseMetadata(orderedMetadata);
        setSortedMetadata(orderedMetadata);
        setSortColumn('relevance');
        setSortDirection('desc');
    }, [groupedMetadata]);

    // Re-apply sort when displayCount changes (but not on initial mount)
    useEffect(() => {
        if (sortColumn && sortColumn !== 'relevance') {
            handleSort(sortColumn);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayCount]);

    const handleSort = (column: SortColumn) => {
        // Toggle direction if clicking the same column, otherwise default to desc
        const newDirection = sortColumn === column && sortDirection === 'desc' ? 'asc' : 'desc';
        setSortColumn(column);
        setSortDirection(newDirection);

        const sorted: { [caseType: string]: CaseMetadata[] } = {};
        // Use baseMetadata (the full merged dataset) to ensure we never lose results
        Object.entries(baseMetadata).forEach(([caseType, results]) => {
            // Sort the FULL array, don't slice here
            sorted[caseType] = [...results].sort((a, b) => {
                let valA: any;
                let valB: any;

                switch (column) {
                    case 'case_ref':
                        valA = a.case_ref || '';
                        valB = b.case_ref || '';
                        break;
                    case 'title':
                        valA = a.case_title || '';
                        valB = b.case_title || '';
                        break;
                    case 'date':
                        valA = a.date_received ? new Date(a.date_received).getTime() : 0;
                        valB = b.date_received ? new Date(b.date_received).getTime() : 0;
                        break;
                    case 'team':
                        valA = a.reporting_team || '';
                        valB = b.reporting_team || '';
                        break;
                    case 'relevance':
                        valA = a['@search.reranker_score'] ?? a['@search.score'] ?? 0;
                        valB = b['@search.reranker_score'] ?? b['@search.score'] ?? 0;
                        break;
                }

                // String comparison
                if (typeof valA === 'string') {
                    return newDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                }

                // Numeric comparison
                return newDirection === 'asc' ? valA - valB : valB - valA;
            });
        });
        setSortedMetadata(sorted);
    };

    const formatDateBritish = (dateString: string | null | undefined): string => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const tooltipStyles: Partial<ITooltipHostStyles> = {
        root: { display: 'inline-block', marginLeft: '4px', verticalAlign: 'middle' },
    };

    const scoreTooltipContent = (
        <div style={{ padding: '8px', maxWidth: '400px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid #d1d5db' }}>
                        <th style={{ textAlign: 'left', padding: '6px', fontWeight: 600 }}>Score</th>
                        <th style={{ textAlign: 'left', padding: '6px', fontWeight: 600 }}>Meaning</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style={{ padding: '6px', verticalAlign: 'top', fontWeight: 500 }}>4.0</td>
                        <td style={{ padding: '6px' }}>The document is highly relevant and answers the question completely, though the passage might contain extra text unrelated to the question.</td>
                    </tr>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                        <td style={{ padding: '6px', verticalAlign: 'top', fontWeight: 500 }}>3.0</td>
                        <td style={{ padding: '6px' }}>The document is relevant but lacks details that would make it complete.</td>
                    </tr>
                    <tr>
                        <td style={{ padding: '6px', verticalAlign: 'top', fontWeight: 500 }}>2.0</td>
                        <td style={{ padding: '6px' }}>The document is somewhat relevant; it answers the question either partially or only addresses some aspects of the question.</td>
                    </tr>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                        <td style={{ padding: '6px', verticalAlign: 'top', fontWeight: 500 }}>1.0</td>
                        <td style={{ padding: '6px' }}>The document is related to the question, and it answers a small part of it.</td>
                    </tr>
                    <tr>
                        <td style={{ padding: '6px', verticalAlign: 'top', fontWeight: 500 }}>0.0</td>
                        <td style={{ padding: '6px' }}>The document is irrelevant.</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );

    const getrelevanceScore = (row: CaseMetadata): string => {
        if (row['@search.reranker_score']) {
            return row['@search.reranker_score'].toFixed(3);
        }
        if (row['@search.score']) {
            return row['@search.score'].toFixed(3);
        }
        return '-';
    };

    const downloadCSV = () => {
        const displayMetadata = Object.keys(sortedMetadata).length > 0 ? sortedMetadata : groupedMetadata;
        if (!displayMetadata || Object.keys(displayMetadata).length === 0) return;

        // Define headers
        const headers = ['Case Ref', 'Case Title', 'Date Received', 'Reporting Team', 'Relevance Score', 'Ecase Link'];

        // Flatten grouped data into single array for CSV (up to displayCount per case type)
        const allMetadata: CaseMetadata[] = [];
        Object.values(displayMetadata).forEach((caseTypeResults) => {
            allMetadata.push(...caseTypeResults.slice(0, displayCount));
        });

        // Create CSV content
        const csvContent = [
            headers.join(','),
            ...allMetadata.map((row) =>
                [
                    row.case_ref || '',
                    row.case_title ? `"${row.case_title.replaceAll('"', '""')}"` : '',
                    row.date_received || '',
                    row.reporting_team || '',
                    row['@search.reranker_score']?.toFixed(3) || row['@search.score']?.toFixed(3) || '',
                    row.case_ref ? generateCaseUrl(row.case_ref) : '',
                ].join(','),
            ),
        ].join('\n');

        // Create and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `metadata_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    // Calculate total results displayed
    const displayMetadata = Object.keys(sortedMetadata).length > 0 ? sortedMetadata : groupedMetadata;
    const totalResults = Object.values(displayMetadata || {}).reduce((sum, results) => sum + Math.min(results.length, displayCount), 0);
    const hasResults = totalResults > 0;

    const content = (
        <div className={styles.container} style={inline ? { padding: '20px', backgroundColor: '#faf9f8', borderRadius: '8px', maxHeight: 'none', overflow: 'visible' } : {}}>
            {loading && (
                <div className={styles.emptyState}>
                    <p>Loading metadata...</p>
                </div>
            )}

            {error && (
                <div className={styles.errorState}>
                    <p>Error: {error}</p>
                </div>
            )}

            {!loading && !error && hasResults && (
                <>
                    <div className={styles.controlsContainer} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className={styles.displayCountControl}>
                            <label style={{ fontWeight: 600 }}>
                                <span style={{ marginRight: '8px' }}>Results per case type:</span>
                                <Dropdown
                                    options={displayCountOptions}
                                    selectedKey={displayCount}
                                    onChange={(_, option) => option && setDisplayCount(option.key as number)}
                                    styles={{ dropdown: { width: 150 } }}
                                />
                            </label>
                        </div>
                        {inline && (
                            <div className={styles.downloadButtonContainer}>
                                <FiltersActionButton onClick={downloadCSV} text="Download CSV" />
                            </div>
                        )}
                    </div>

                    <div style={inline ? {} : { maxHeight: '60vh', overflow: 'auto' }}>
                        {Object.entries(displayMetadata).map(
                            ([caseType, results]) =>
                                results.length > 0 && (
                                    <div key={caseType} style={{ marginBottom: '30px' }}>
                                        <h3 className={styles.caseTypeHeader}>
                                            {caseType} (showing {Math.min(results.length, displayCount)} of {results.length} result{results.length === 1 ? '' : 's'})
                                        </h3>
                                        <table className={styles.table}>
                                            <thead>
                                                <tr>
                                                    <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => handleSort('case_ref')}>
                                                        Case Ref{' '}
                                                        {sortColumn === 'case_ref' && (
                                                            <span style={{ fontSize: '1.2em', fontWeight: 'bold', marginLeft: '4px' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                        )}
                                                    </th>
                                                    <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => handleSort('title')}>
                                                        Case Title{' '}
                                                        {sortColumn === 'title' && (
                                                            <span style={{ fontSize: '1.2em', fontWeight: 'bold', marginLeft: '4px' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                        )}
                                                    </th>
                                                    <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => handleSort('date')}>
                                                        Date Received{' '}
                                                        {sortColumn === 'date' && (
                                                            <span style={{ fontSize: '1.2em', fontWeight: 'bold', marginLeft: '4px' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                        )}
                                                    </th>
                                                    <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => handleSort('team')}>
                                                        Reporting Team{' '}
                                                        {sortColumn === 'team' && (
                                                            <span style={{ fontSize: '1.2em', fontWeight: 'bold', marginLeft: '4px' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                        )}
                                                    </th>
                                                    <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => handleSort('relevance')}>
                                                        Relevance Score
                                                        {sortColumn === 'relevance' && (
                                                            <span style={{ fontSize: '1.2em', fontWeight: 'bold', marginLeft: '4px' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                        )}
                                                        <TooltipHost content={scoreTooltipContent} styles={tooltipStyles}>
                                                            <Info16Regular style={{ cursor: 'help', color: '#605e5c', marginLeft: '4px' }} />
                                                        </TooltipHost>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {results.slice(0, displayCount).map((row) => (
                                                    <tr key={row.case_ref || `${row.case_title}-${row.date_received}`}>
                                                        <td>
                                                            {row.case_ref && (
                                                                <a
                                                                    href={generateCaseUrl(row.case_ref)}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    style={{ textDecoration: 'underline', color: '#0078d4' }}
                                                                >
                                                                    {row.case_ref}
                                                                </a>
                                                            )}
                                                            {!row.case_ref && '-'}
                                                        </td>
                                                        <td>{row.case_title}</td>
                                                        <td>{formatDateBritish(row.date_received)}</td>
                                                        <td>{row.reporting_team}</td>
                                                        <td>{getrelevanceScore(row)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ),
                        )}
                    </div>
                </>
            )}

            {!loading && !error && !hasResults && (
                <div className={styles.emptyState}>
                    <p>No metadata found for the selected filters.</p>
                </div>
            )}
        </div>
    );

    // For inline mode, just return the content directly
    if (inline) {
        return content;
    }

    // For dialog mode, wrap in Dialog
    return (
        <Dialog
            hidden={!isOpen}
            onDismiss={onDismiss}
            dialogContentProps={{
                title: 'Metadata Results',
                showCloseButton: true,
            }}
            modalProps={{
                isBlocking: false,
                styles: {
                    main: {
                        maxWidth: '90vw !important',
                        width: '90vw',
                        maxHeight: '90vh',
                    },
                },
            }}
        >
            {content}
        </Dialog>
    );
};

export default MetadataResults;
