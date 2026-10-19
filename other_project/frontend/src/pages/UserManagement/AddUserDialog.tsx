import { Dialog, Dropdown, TextField } from '@fluentui/react';
import { Role, UserAccess } from '../../api';
import { useState } from 'react';
import { ActionButton } from '../../components/common/Button';
import { Secretariat } from '../UserManagement/SecretariatList';

interface AddUserDialogProps {
    isOpen: boolean;
    onDismiss: () => void;
    onAddUser: (userAccess: UserAccess) => void;
    error?: string;
}

export const AddUserDialog: React.FC<AddUserDialogProps> = ({ isOpen, onDismiss, onAddUser, error }) => {
    const [puid, setPuid] = useState<string>('');
    const [selectedRole, setSelectedRole] = useState<Role>(Role.Normal);
    const [selectedSecretariat, setSelectedSecretariat] = useState<Secretariat>(Secretariat.Blank);
    const [inputError, setInputError] = useState<string>();

    const addUser = () => {
        setInputError('');

        if (!puid || puid.trim() === '') {
            setInputError('PUID is required');
            return;
        }

        if (puid.includes(',')) {
            setInputError('Invalid format - PUID cannot contain a comma. Please enter one PUID at a time.');
            return;
        }

        if (!selectedRole) {
            setInputError('Role is required');
            return;
        }

        if (!selectedSecretariat) {
            setInputError('Secretariat is required. If unsure, please select "Other".');
            return;
        }

        onAddUser({
            user_id: puid,
            secretariat: selectedSecretariat as Secretariat,
            role: selectedRole as Role,
        });

        setPuid('');
        setSelectedSecretariat(Secretariat.Blank);
        setSelectedRole(Role.Normal);
    };

    const handleRoleChange = (role: Role) => {
        setSelectedRole(role);
    };

    const handleSecretariatChange = (secretariat: Secretariat) => {
        setSelectedSecretariat(secretariat);
    };

    const closeDialog = () => {
        setPuid('');
        setSelectedSecretariat(Secretariat.Blank);
        setSelectedRole(Role.Normal);
        setInputError(undefined);
        onDismiss();
    };

    return (
        <Dialog
            onDismiss={onDismiss}
            hidden={!isOpen}
            modalProps={{
                isBlocking: false,
            }}
            styles={{
                main: [
                    {
                        selectors: {
                            ['@media (min-width: 600px)']: {
                                maxWidth: '400px',
                                background: '#FFFFFF',
                                boxShadow: '0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)',
                                borderRadius: '8px',
                                maxHeight: '90%',
                                minHeight: '100px',
                                border: '0px solid #000000',
                                marginTop: '4px',
                            },
                        },
                    },
                ],
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
                title: <h3 style={{ margin: '0', paddingBottom: '0' }}>Add User</h3>,
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
                    inner: { padding: '10px' },
                },
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <form>
                    <div style={{ marginBottom: '10px' }}>
                        <TextField label="PUID" value={puid} onChange={(event, newText) => setPuid(newText as string)} />
                    </div>
                    Secretariat
                    <Dropdown
                        id="dropdown-secretariat"
                        options={Object.entries(Secretariat).map(([key, value]) => ({ key: value, text: value }))}
                        placeholder="Secretariat"
                        styles={{
                            root: {
                                minWidth: 110,
                            },
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
                        selectedKey={selectedSecretariat}
                        onChange={(e, option) => handleSecretariatChange(option?.key as Secretariat)}
                    />
                    Role
                    <Dropdown
                        id="dropdown-admin-users"
                        options={Object.entries(Role).map(([key, value]) => ({ key: value, text: value }))}
                        placeholder="Role"
                        styles={{
                            root: {
                                minWidth: 110,
                            },
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
                        selectedKey={selectedRole}
                        onChange={(e, option) => handleRoleChange(option?.key as Role)}
                    />
                    {error && <div style={{ color: 'red', marginTop: '10px' }}>{error}</div>}
                    {inputError && <div style={{ color: 'red', marginTop: '10px' }}>{inputError}</div>}
                </form>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                    <ActionButton style={{ marginRight: '5px' }} onClick={closeDialog} text="Cancel" />
                    <ActionButton onClick={addUser} text="Add User" />
                </div>
            </div>
        </Dialog>
    );
};
