import { Icon, Stack } from '@fluentui/react';
import { useContext } from 'react';
import { AppStateContext } from '../../state/AppProvider';
import { Mode } from '../../api';

interface Props {
    mode?: Mode;
}

export const AnswerLoading: React.FC<Props> = ({ mode }) => {
    const appStateContext = useContext(AppStateContext);
    const threshold = appStateContext?.state.frontendSettings?.azure_search_score_threshold_find_all || '1.8';
    const searchConfig = appStateContext?.state.frontendSettings?.search_config!;
    const isMetadataSearch = mode === Mode.metadataSearch;

    // Get top_k value based on mode
    const getTopK = () => {
        switch (mode) {
            case Mode.relatedResponses:
                return searchConfig.related_responses.top_k;
            case Mode.policyAndGuidance:
                return searchConfig.policy_and_guidance.top_k;
            case Mode.evaluateDraft:
                return searchConfig.evaluate_draft.top_k;
            case Mode.askAnything:
                return searchConfig.ask_anything.top_k;
            default:
                return 10;
        }
    };

    const topK = getTopK();

    return (
        <>
            <div style={{ margin: '5px 10px' }}>
                <h3 style={{ fontWeight: 'normal', fontSize: '16px' }}>Generating answer...</h3>

                <hr />

                <Stack className="list">
                    <ul style={{ padding: '0px' }}>
                        <li style={{ listStyleType: 'none', padding: '0px', display: 'flex', alignItems: 'center' }}>
                            <span style={{ fontSize: '25px' }}>
                                <Icon iconName="timer" />
                            </span>
                            <span style={{ marginLeft: '10px', fontSize: '14px' }}>
                                Wait time up to <b>30 seconds</b>.
                            </span>
                        </li>
                        <li style={{ listStyleType: 'none', padding: '0px', display: 'flex', alignItems: 'center', marginTop: '5px' }}>
                            <span style={{ fontSize: '25px' }}>
                                <Icon iconName="documentation" />
                            </span>
                            <span style={{ marginLeft: '10px', fontSize: '14px' }}>
                                {isMetadataSearch ? (
                                    <>
                                        The number of results retrieved is dependent on the relevance score, <b>the current threshold is set to {threshold}</b>.
                                    </>
                                ) : (
                                    <>
                                        <b>Up to {topK}</b> best match documents will be referenced in the response.
                                    </>
                                )}
                            </span>
                        </li>
                    </ul>
                </Stack>
            </div>
        </>
    );
};

export const AnswerLoadingAnnex: React.FC = () => {
    return (
        <>
            <div style={{ margin: '5px 10px' }}>
                <h3 style={{ fontWeight: 'normal', fontSize: '16px' }}>Generating answer...</h3>

                <hr />

                <Stack className="list">
                    <ul style={{ padding: '0px' }}>
                        <li style={{ listStyleType: 'none', padding: '0px', display: 'flex', alignItems: 'center' }}>
                            <span style={{ fontSize: '25px' }}>
                                <Icon iconName="timer" />
                            </span>
                            <span style={{ marginLeft: '10px', fontSize: '14px' }}>
                                Wait time up to <b>30 seconds</b>.
                            </span>
                        </li>
                    </ul>
                </Stack>
            </div>
        </>
    );
};
