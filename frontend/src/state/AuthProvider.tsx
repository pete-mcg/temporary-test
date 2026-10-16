import { createContext, FC, ReactNode, useContext, useEffect, useState } from "react";
import { getUserAuthStatus, login } from "../api";
import { useLocation } from "react-router-dom";

export interface AuthState {
    isAuthenticated: boolean;
    isAttempted: boolean;
    setAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
}

const AuthContext = createContext<AuthState>({ isAuthenticated: false, isAttempted: false, setAuthenticated: () => {} });

export const useAuth = () => useContext(AuthContext);

type AuthProviderProps = {
    children: ReactNode;
}

export const AuthProvider: FC<AuthProviderProps> = ({ children }) => {
    const [attemptedAuth, setAttemptedAuth] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    const location = useLocation()

    useEffect(() => {
        const checkUserAuth = async () => {
            const statusResponse = await getUserAuthStatus();

            if (statusResponse.success === false) {
                const loginResponse = await login();

                if (loginResponse.success) {
                    const url = loginResponse.url;
                    setAttemptedAuth(true);
                    if (url) {
                        window.location.href = url;
                    }
                }
            } else {
                setIsAuthenticated(true);
            }
        };

        if (!attemptedAuth && location.pathname !== '/authorise') {
            checkUserAuth();
        }
    }, []);

    return (
        <AuthContext.Provider value={{ isAuthenticated, isAttempted: attemptedAuth, setAuthenticated: setIsAuthenticated }}>
            {children}
        </AuthContext.Provider>
    )
};