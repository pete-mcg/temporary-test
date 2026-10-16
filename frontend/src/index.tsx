import React from 'react';
import ReactDOM from 'react-dom/client';
import { Routes, Route, BrowserRouter } from 'react-router-dom';
import { initializeIcons } from '@fluentui/react';
import { Main } from './pages/Main';

import './index.css';

import NoPage from './pages/NoPage';
import { AuthorisePage } from './pages/AuthorisePage';
import { AuthProvider } from './state/AuthProvider';

initializeIcons();

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route path="/" element={<Main />}>
                        <Route path="*" element={<NoPage />} />
                    </Route>
                    <Route path="/authorise" element={<AuthorisePage />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);