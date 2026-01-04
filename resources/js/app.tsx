import '../css/app.css';
import { geomanReady } from './leaflet-setup';
import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { initializeTheme } from './hooks/use-appearance';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

const startApp = () => {
    createInertiaApp({
        title: (title) => `${title} - ${appName}`,
        resolve: (name) => resolvePageComponent(`./pages/${name}.tsx`, import.meta.glob('./pages/**/*.tsx')),
        setup({ el, App, props }) {
            const root = createRoot(el);

            root.render(
                <>
                    <Toaster position="top-right" reverseOrder={false} />
                    <App {...props} />
                </>,
            );
        },
        progress: {
            color: '#4B5563',
        },
    });
};

// This will set light / dark mode on load...
initializeTheme();
geomanReady.then(startApp).catch(startApp);
