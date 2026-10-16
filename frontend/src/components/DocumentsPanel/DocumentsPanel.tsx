import { Callout, Dialog, DirectionalHint, Icon, Stack, TooltipHost } from "@fluentui/react";
import React, { useContext, useState } from "react";

import styles from "./DocumentsPanel.module.css";
import { AppStateContext } from "../../state/AppProvider";

interface DocumentsPanelProps {
    isDocsPanelOpen: boolean;
    handleDocsPanelDismiss: () => void;
}

export const DocumentsPanel: React.FC<DocumentsPanelProps> = ({ isDocsPanelOpen, handleDocsPanelDismiss }) => {
    const appStateContext = useContext(AppStateContext);
    const document_list = appStateContext?.state.getDatabaseInfo?.documentList;
    const ui = appStateContext?.state.frontendSettings?.ui;

    const [searchInput, setSearchInput] = useState("");

    // Create input element as SearchInput (for searching document list) 
    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        setSearchInput(e.target.value);
    };

    // Split each of the documents so it shows on a new line and creates document list as an array of objects
    const formattedDocumentContent: { name: string }[] = (document_list ?? []).map((document: string) => ({
        name: document
    }));

    return (
        <Dialog
            onDismiss={handleDocsPanelDismiss}
            hidden={!isDocsPanelOpen}
            styles={{
                main: [{
                    selectors: {
                        ['@media (min-width: 600px)']: {
                            maxWidth: '750px',
                            background: "#FFFFFF",
                            boxShadow: "0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)",
                            borderRadius: "8px",
                            maxHeight: '900px',
                            minHeight: '100px',
                        }
                    }
                }]
            }}
            dialogContentProps={{
                title: "Document List",
                showCloseButton: true
            }}
        >
            <div>
                <input
                    type="search"
                    placeholder="Search here"
                    onChange={handleSearch}
                    value={searchInput}
                    className="searchInput"
                />
                <table className={styles.fileTable}>
                    <tbody>
                        <tr>
                            <td>
                                <br></br>
                                <div className={styles.fileGrid}>
                                    {formattedDocumentContent
                                        .filter((filename) => filename.name.toLowerCase().includes(searchInput.toLowerCase()))
                                        .map((filename, index) => (
                                            <div className={styles.fileItem} key={index}>{filename.name}</div>
                                        ))}
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </Dialog>
    );
}