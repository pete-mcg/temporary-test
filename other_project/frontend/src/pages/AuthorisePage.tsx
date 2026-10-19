import { FC, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authorise } from '../api';
import { useAuth } from '../state/AuthProvider';

export const AuthorisePage: FC = () => {
    const [searchParam] = useSearchParams();
    const [attemptedAuth, setAttemptedAuth] = useState(false);
    const [failedAuth, setFailedAuth] = useState(false);

    const { setAuthenticated, redirectAfterUrl } = useAuth();

    useEffect(() => {
        const authoriseCode = async (code: string) => {
            const response = await authorise(code);

            if (response.success === true) {
                setAttemptedAuth(true);
                setAuthenticated(true);
                window.location.href = redirectAfterUrl || '/';
            } else {
                setFailedAuth(true);
            }
        };

        if (searchParam.has('code')) {
            const code = searchParam.get('code');

            if (code && !attemptedAuth) {
                authoriseCode(code);
            }
        }
    }, [searchParam, attemptedAuth, redirectAfterUrl, setAuthenticated]);

    return (
        <>
            {failedAuth && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', height: '100vh' }}>
                    <h1>Access Denied</h1>
                    <p>Failed to login.</p>
                </div>
            )}
        </>
    );
};
