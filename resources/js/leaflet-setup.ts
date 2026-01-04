import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

export const geomanReady = (async () => {
    if (typeof window === 'undefined') return;
    (window as any).L = L;
    await import('@geoman-io/leaflet-geoman-free');
})();
