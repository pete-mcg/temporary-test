import { FC } from 'react';
import { useAuth } from '../state/AuthProvider';
import Layout from './layout/Layout';
import { AppStateProvider } from '../state/AppProvider';

export const Main: FC = () => {
    const { isAuthenticated } = useAuth();

    return !isAuthenticated ? (
        <></>
    ) : (
        <AppStateProvider>
            <Layout />
        </AppStateProvider>
    );
};