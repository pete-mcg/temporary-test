import React from 'react';
import ReactDOM from 'react-dom/client';
import { Routes, Route, BrowserRouter } from 'react-router-dom';
import { initializeIcons } from '@fluentui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProtectedLayout } from './pages/ProtectedLayout';

import './index.css';

import NoPage from './pages/NoPage';
import { AuthorisePage } from './pages/AuthorisePage';
import { AuthProvider } from './state/AuthProvider';
import { AccessDeniedPage } from './pages/AccessDeniedPage';
import { IrisRoute } from './api';
import { ManageUsersPage } from './pages/UserManagement/ManageUsersPage';
import Layout from './pages/layout/Layout';

initializeIcons();

const queryClient = new QueryClient();

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <AuthProvider>
                    <Routes>
                        <Route element={<ProtectedLayout />}>
                            <Route index path="/" element={<Layout />} />
                            <Route path={IrisRoute.ADMIN_USERS} element={<ManageUsersPage />} />
                        </Route>

                        <Route path="*" element={<NoPage />} />
                        <Route path={IrisRoute.AUTHORISE} element={<AuthorisePage />} />
                        <Route path={IrisRoute.DENIED} element={<AccessDeniedPage />} />
                    </Routes>
                </AuthProvider>
            </BrowserRouter>
        </QueryClientProvider>
    );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
