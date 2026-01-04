import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { geomanReady } from '@/leaflet-setup';

export default function GeomanControl() {
    const map = useMap();

    useEffect(() => {
        let isActive = true;
        let createHandler: ((e: any) => void) | null = null;

        geomanReady.then(() => {
            if (!isActive || !map.pm) return;

            map.pm.addControls({
                position: 'bottomleft',
                drawMarker: true,
                drawCircle: true,
                drawCircleMarker: true,
                drawRectangle: true,
                dragMode: true,
                cutPolygon: true,
                removalMode: true,
                drawPolyline: true,
                drawPolygon: true,
                editMode: false,
            });

            createHandler = (e) => {
                const layer = e.layer;
                if (e.shape === 'PolyLine') {
                    console.log('Length (m):', (layer as any).pm.getLength());
                }
                if (e.shape === 'Polygon') {
                    console.log('Area (m²):', (layer as any).pm.getArea());
                }
            };

            map.on('pm:create', createHandler);
        });

        return () => {
            isActive = false;
            if (createHandler) {
                map.off('pm:create', createHandler);
            }
        };
    }, [map]);

    return null;
}
