import { FC, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addUser, changeUserRole, getAdminUsers, IrisRoute, removeUser, Role, UserAccess } from '../../api';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../state/AuthProvider';
import { Dropdown } from '@fluentui/react';
import { AddUserDialog } from './AddUserDialog';
import { AlertDialog } from '../../components/AlertDialog/AlertDialog';
import { ActionButton, BannerButton } from '../../components/common/Button';
import { Secretariat } from '../UserManagement/SecretariatList';

export const ManageUsersPage: FC = () => {
    const { userAccess } = useAuth();
    const [showAddUserDialog, setShowAddUserDialog] = useState(false);
    const [addError, setAddError] = useState<string>();

    const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false);
    const [userToRemove, setUserToRemove] = useState<UserAccess>();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const { isPending, error, data, refetch } = useQuery<UserAccess[]>({
        queryKey: ['userAccess'],
        queryFn: () => getAdminUsers(),
    });

    const updateRoleMutation = useMutation({
        mutationFn: (userAccess: UserAccess) => {
            return changeUserRole(userAccess);
        },
        onMutate: async (userAccess: UserAccess) => {
            await queryClient.cancelQueries({ queryKey: ['userAccess'] });
            const oldData = queryClient.getQueryData<UserAccess[]>(['userAccess']);

            queryClient.setQueryData<UserAccess[]>(['userAccess'], (oldData) => {
                return oldData?.map((user) => {
                    if (user.user_id === userAccess.user_id) {
                        return userAccess;
                    }

                    return user;
                });
            });

            return { oldData };
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['userAccess'] });
        },
    });

    const addUserMutation = useMutation({
        mutationFn: addUser,
        onMutate: async (userAccess: UserAccess) => {
            setAddError(undefined);
            await queryClient.cancelQueries({ queryKey: ['userAccess'] });
            const oldData = queryClient.getQueryData<UserAccess[]>(['userAccess']);

            queryClient.setQueryData<UserAccess[]>(['userAccess'], (oldData) => {
                return [...(oldData as UserAccess[]), userAccess];
            });

            return { oldData };
        },
        onError: (error, variables, context) => {
            if (error?.message) {
                setAddError(error.message);
            }
        },
    });

    const removeUserMutation = useMutation({
        mutationFn: removeUser,
        onMutate: async (userAccess: UserAccess) => {
            await queryClient.cancelQueries({ queryKey: ['userAccess'] });
            const oldData = queryClient.getQueryData<UserAccess[]>(['userAccess']);

            queryClient.setQueryData<UserAccess[]>(['userAccess'], (oldData) => {
                return oldData?.filter((user) => user.user_id !== userAccess.user_id);
            });

            return { oldData };
        },
    });

    if (userAccess?.role !== Role.Admin) {
        return <Navigate to="/" replace />;
    }

    const handleRoleChange = (puid: string, secretariat: Secretariat, role: Role) => {
        updateRoleMutation.mutate({ user_id: puid, secretariat, role });
    };

    const onAddUser = async (userAccess: UserAccess) => {
        setAddError(undefined);

        addUserMutation.mutate(userAccess);

        setShowAddUserDialog(false);
    };

    const onRemoveUser = () => {
        if (!userToRemove) {
            setShowDeleteUserDialog(false);
            return;
        }

        removeUserMutation.mutate(userToRemove);

        setShowDeleteUserDialog(false);
        setUserToRemove(undefined);
    };

    const convertToCSV = (data: UserAccess[]) => {
        const headers = ['PUID', 'Secretariat', 'Role'];
        const rows = data.map((user) => [user.user_id, user.secretariat, user.role]);
        let csvContent = 'data:text/csv;charset=utf-8,';
        csvContent += headers.join(',') + '\n';
        rows.forEach((row) => {
            csvContent += row.join(',') + '\n';
        });

        return encodeURI(csvContent);
    };

    const downloadCSV = (data: UserAccess[]) => {
        const csvContent = convertToCSV(data);
        const link = document.createElement('a');

        const now = new Date();
        const formattedDate = now.toISOString().slice(0, 19).replace(/:/g, '-');
        const fileName = `Iris_User_Data_${formattedDate}.csv`;

        link.setAttribute('href', csvContent);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div style={{ marginLeft: '20px', marginRight: '20px' }}>
            <h1>Manage Users</h1>

            <div style={{ marginBottom: '20px', maxWidth: '850px', backgroundColor: '#cea1ee', padding: '10px' }}>
                <span style={{ fontWeight: 'bold' }}>Important Note: </span>
                Ensure that the PUIDs you enter are accurate as the system will not verify this for you. To check if a user has already been added, use the CTRL-F function to search. To change a
                user's Secretariat, you will need to remove and re-add the user with the correct Secretariat. Any changes made to a user's access rights will take effect within 24 hours. Click
                Download Table for further analysis.
            </div>

            <ActionButton style={{ marginBottom: '20px', marginRight: '10px' }} iconProps={{ iconName: 'Home' }} onClick={() => navigate(IrisRoute.MAIN)} />
            <ActionButton style={{ marginBottom: '20px', marginRight: '10px' }} iconProps={{ iconName: 'Refresh' }} text="Refresh Table" onClick={() => refetch()} />
            <ActionButton style={{ marginBottom: '20px', marginRight: '10px' }} iconProps={{ iconName: 'Add' }} text="Add User" onClick={() => setShowAddUserDialog(true)} />
            <ActionButton
                style={{ marginBottom: '20px', marginRight: '10px' }}
                iconProps={{ iconName: 'Download' }}
                text="Download Table"
                onClick={() => {
                    if (data) {
                        downloadCSV(data);
                    } else {
                        console.error('Data is not available for download');
                    }
                }}
            />

            {data && (
                <table style={{ borderSpacing: '0 10px' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left' }}>PUID</th>
                            <th style={{ textAlign: 'left' }}>Secretariat</th>
                            <th style={{ textAlign: 'left' }}>Role</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.map((user) => (
                            <tr key={user.user_id}>
                                <td style={{ minWidth: '150px' }}>{user.user_id}</td>
                                <td style={{ minWidth: '150px', paddingRight: '20px' }}>{user.secretariat}</td>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <Dropdown
                                            id="dropdown-admin-users"
                                            options={Object.entries(Role).map(([key, value]) => ({ key: value, text: value }))}
                                            placeholder="Role"
                                            styles={{
                                                root: {
                                                    minWidth: 110,
                                                    marginRight: '10px',
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
                                            disabled={user.user_id === userAccess?.user_id}
                                            selectedKey={user.role}
                                            onChange={(e, option) => handleRoleChange(user.user_id, user.secretariat, option?.key as Role)}
                                        />

                                        <BannerButton
                                            icon="delete"
                                            disabled={user.user_id === userAccess?.user_id}
                                            onClick={() => {
                                                if (user.user_id === userAccess?.user_id) {
                                                    return;
                                                }
                                                setUserToRemove(user);
                                                setShowDeleteUserDialog(true);
                                            }}
                                        />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <AddUserDialog isOpen={showAddUserDialog} onDismiss={() => setShowAddUserDialog(false)} onAddUser={onAddUser} error={addError} />

            <AlertDialog
                title={'Are you sure?'}
                message={`Are you sure you want to remove ${userToRemove?.user_id}.`}
                isOpen={showDeleteUserDialog}
                onDismiss={() => setShowDeleteUserDialog(false)}
                actionButtonLabel="Remove User"
                onAction={onRemoveUser}
            />
        </div>
    );
};
