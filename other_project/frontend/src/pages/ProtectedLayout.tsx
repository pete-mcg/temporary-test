import { useAuth } from '../state/AuthProvider';
import { AppStateProvider } from '../state/AppProvider';
import { Outlet } from 'react-router-dom';

export const ProtectedLayout = () => {
    const { isAuthenticated } = useAuth();

    return !isAuthenticated ? (
        <></>
    ) : (
        <AppStateProvider>
            <Outlet />
        </AppStateProvider>
    );
};
