import { FC, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authorise } from '../api';
import { useAuth } from '../state/AuthProvider';

export const AuthorisePage: FC = () => {
    const [searchParam] = useSearchParams();
    const [attemptedAuth, setAttemptedAuth] = useState(false);
    const [failedAuth, setFailedAuth] = useState(false);

    const { setAuthenticated } = useAuth();

    useEffect(() => {
        const authoriseCode = async (code: string) => {
            const response = await authorise(code);

            if (response.success === true) {
                setAttemptedAuth(true);
                setAuthenticated(true);
                window.location.href = '/';
            } else {
                setFailedAuth(true);
            }
        }

        if (searchParam.has('code')) {
            const code = searchParam.get('code');

            if (code && !attemptedAuth) {
                authoriseCode(code);
            }
        }
    }, [searchParam]);

    return (
        <>{failedAuth && (
            <div>
                <h1>Failed to authorise</h1>
            </div>
        )}</>
    );
};