import { createContext, FC, ReactNode, useContext, useEffect, useState } from 'react';
import { getUserAuthStatus, getUserInfo, IrisRoute, login, UserAccess } from '../api';
import { useLocation } from 'react-router-dom';

export interface AuthState {
    isAuthenticated: boolean;
    isAttempted: boolean;
    setAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
    redirectAfterUrl?: string;
    userAccess?: UserAccess;
}

const AuthContext = createContext<AuthState>({ isAuthenticated: false, isAttempted: false, setAuthenticated: () => {}, userAccess: undefined });

export const useAuth = () => useContext(AuthContext);

type AuthProviderProps = {
    children: ReactNode;
};

const nonProtectedRoutes = [IrisRoute.AUTHORISE, IrisRoute.DENIED];

export const AuthProvider: FC<AuthProviderProps> = ({ children }) => {
    const [attemptedAuth, setAttemptedAuth] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [redirectAfterUrl, setRedirectAfterUrl] = useState<string | undefined>(undefined);
    const [userAccess, setUserAccess] = useState<UserAccess | undefined>(undefined);

    const location = useLocation();

    useEffect(() => {
        const checkUserAuth = async () => {
            try {
                const statusCode = await getUserAuthStatus();

                if (statusCode === 200) {
                    // User is authenticated
                    const userInfoResponse = await getUserInfo();
                    setUserAccess(userInfoResponse);
                    setIsAuthenticated(true);
                } else if (statusCode === 401) {
                    // User is not authenticated - needs to relogged in
                    const loginResponse = await login();

                    if (loginResponse.success) {
                        const url = loginResponse.url;

                        if (url) {
                            window.location.href = url;
                        }
                    }
                    setAttemptedAuth(true);
                } else if (statusCode === 403) {
                    // User is blocked - redirect them to denied page
                    setAttemptedAuth(true);
                    setIsAuthenticated(false);
                    window.location.href = IrisRoute.DENIED;
                } else {
                    console.error('Unknown error');
                    setAttemptedAuth(true);
                    setIsAuthenticated(false);
                }
            } catch (error) {
                console.error(error);
                setAttemptedAuth(true);
                setIsAuthenticated(false);
            }
        };

        if (!attemptedAuth && !nonProtectedRoutes.includes(location.pathname as IrisRoute)) {
            setRedirectAfterUrl(location.pathname);
            checkUserAuth();
        }
    }, [attemptedAuth, location.pathname]);

    return <AuthContext.Provider value={{ isAuthenticated, isAttempted: attemptedAuth, setAuthenticated: setIsAuthenticated, redirectAfterUrl, userAccess }}>{children}</AuthContext.Provider>;
};
