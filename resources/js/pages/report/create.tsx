// Refactored with Tailwind styling consistent with CreateRegion

import AppLayout from '@/layouts/app-layout';
import { Head, useForm, usePage } from '@inertiajs/react';
import { FormEvent, useRef, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import axios from 'axios';

export default function CreateReportWizard() {
    const { geojsons, regions, owners, user_id } = usePage<{
        geojsons: { id_geojson: number; source_name?: string }[];
        regions: { id_region: number; name: string }[];
        owners: { id_owner: number; name: string }[];
        user_id: number;
    }>().props;

    const { data, setData, post, processing, errors, transform } = useForm({
        id_geojson: '',
        file_path: null as File | null,
        description: '',
        nomor: '',
        sifat: 'Biasa',
        hal: '',
        kepada: '',
        geojson_file: null as File | null,
        geojson_text: '',
        id_user: user_id,
        id_region: '',
        id_owner: '',
    });

    const [step, setStep] = useState(1);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [selectedGeojsonData, setSelectedGeojsonData] = useState<any>(null);
    const [loadingGeojson, setLoadingGeojson] = useState(false);

    transform(() => {
        const formData = new FormData();
        formData.append('id_geojson', data.id_geojson);
        formData.append('file_path', data.file_path!);
        formData.append('description', data.description);
        formData.append('nomor', data.nomor);
        formData.append('sifat', data.sifat);
        formData.append('hal', data.hal);
        formData.append('kepada', data.kepada);
        if (!data.id_geojson) {
            if (data.geojson_file) formData.append('geojson_file', data.geojson_file);
            if (data.geojson_text) formData.append('geojson_text', data.geojson_text);
            formData.append('id_user', String(data.id_user));
            formData.append('id_region', data.id_region);
            formData.append('id_owner', data.id_owner);
        }
        return formData;
    });

    const nextStep = () => setStep((prev) => prev + 1);
    const prevStep = () => setStep((prev) => prev - 1);

    // Function to calculate bounds and center of GeoJSON
    const calculateMapBounds = (geojsonData: any) => {
        if (!geojsonData || !geojsonData.geometry || !geojsonData.geometry.coordinates) {
            return { center: [1.0, 104.521117], zoom: 11 };
        }

        const coords = geojsonData.geometry.coordinates;
        let allCoords: number[][] = [];

        // Extract all coordinates based on geometry type
        if (geojsonData.geometry.type === 'Polygon') {
            allCoords = coords[0]; // First ring of polygon
        } else if (geojsonData.geometry.type === 'MultiPolygon') {
            coords.forEach((polygon: number[][][]) => {
                allCoords = allCoords.concat(polygon[0]); // First ring of each polygon
            });
        }

        if (allCoords.length === 0) {
            return { center: [1.0, 104.521117], zoom: 11 };
        }

        // Calculate bounds
        const lats = allCoords.map(coord => coord[1]);
        const lngs = allCoords.map(coord => coord[0]);
        
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);

        // Calculate center
        const centerLat = (minLat + maxLat) / 2;
        const centerLng = (minLng + maxLng) / 2;

        // Calculate appropriate zoom level based on bounds
        const latDiff = maxLat - minLat;
        const lngDiff = maxLng - minLng;
        const maxDiff = Math.max(latDiff, lngDiff);
        
        let zoom = 11;
        if (maxDiff < 0.01) zoom = 15;
        else if (maxDiff < 0.05) zoom = 13;
        else if (maxDiff < 0.1) zoom = 12;
        else if (maxDiff < 0.5) zoom = 10;
        else zoom = 9;

        return { center: [centerLat, centerLng], zoom };
    };

    // Fetch GeoJSON data when selected
    useEffect(() => {
        if (data.id_geojson) {
            setLoadingGeojson(true);
            axios.get(`/dashboard/api/geojson/${data.id_geojson}/data`)
                .then(response => {
                    setSelectedGeojsonData(response.data);
                })
                .catch(error => {
                    console.error('Error fetching GeoJSON data:', error);
                    toast.error('Gagal memuat data GeoJSON');
                })
                .finally(() => {
                    setLoadingGeojson(false);
                });
        } else {
            setSelectedGeojsonData(null);
        }
    }, [data.id_geojson]);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        post(route('dashboard.report.store'), {
            onSuccess: () => toast.success('Laporan berhasil ditambahkan!'),
            onError: () => toast.error('Gagal menambahkan laporan'),
        });
    };

    const stepContainer = 'grid grid-cols-1 gap-6 md:grid-cols-2';
    const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300';
    const inputClass = `mt-1 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white`;

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <div className={stepContainer}>
                        <div className="md:col-span-2">
                            <label className={labelClass}>Pilih GeoJSON Lama (Opsional)</label>
                            <select value={data.id_geojson} onChange={(e) => setData('id_geojson', e.target.value)} className={inputClass}>
                                <option value="">-- Pilih GeoJSON --</option>
                                {geojsons.map((g) => (
                                    <option key={g.id_geojson} value={g.id_geojson}>
                                        {g.source_name ?? `GeoJSON ID ${g.id_geojson}`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Map Preview */}
                        {data.id_geojson && (
                            <div className="md:col-span-2">
                                <label className={labelClass}>Preview Map</label>
                                {loadingGeojson ? (
                                    <div className="mt-2 flex h-64 items-center justify-center rounded border bg-gray-50 dark:bg-gray-800">
                                        <div className="text-gray-500">Loading map preview...</div>
                                    </div>
                                ) : selectedGeojsonData && selectedGeojsonData.geojson ? (
                                    <div className="mt-2">
                                        <div className="mb-2 rounded border bg-gray-50 p-2 text-sm dark:bg-gray-800">
                                            <strong>GeoJSON:</strong> {selectedGeojsonData.source_name} | 
                                            <strong> Region:</strong> {selectedGeojsonData.region_name} | 
                                            <strong> Owner:</strong> {selectedGeojsonData.owner_name}
                                        </div>
                                        <div className="h-64 w-full rounded border">
                                            {(() => {
                                                const mapBounds = calculateMapBounds(selectedGeojsonData.geojson);
                                                return (
                                                    <MapContainer 
                                                        center={mapBounds.center as [number, number]} 
                                                        zoom={mapBounds.zoom} 
                                                        style={{ height: '100%', width: '100%' }}
                                                        key={`map-${data.id_geojson}`} // Force re-render when GeoJSON changes
                                                    >
                                                        <TileLayer
                                                            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                        />
                                                        <GeoJSON 
                                                            data={selectedGeojsonData.geojson}
                                                            style={{
                                                                color: '#3388ff',
                                                                weight: 2,
                                                                fillOpacity: 0.2
                                                            }}
                                                        />
                                                    </MapContainer>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}

                        {/* Upload GeoJSON section - only show when no existing GeoJSON is selected */}
                        {!data.id_geojson && (
                            <>
                                <div>
                                    <label className={labelClass}>Upload GeoJSON File</label>
                                    <input
                                        type="file"
                                        accept=".json,.geojson,.txt"
                                        onChange={(e) => setData('geojson_file', e.target.files?.[0] ?? null)}
                                        className={inputClass}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Atau Tempel GeoJSON</label>
                                    <textarea
                                        value={data.geojson_text}
                                        onChange={(e) => setData('geojson_text', e.target.value)}
                                        rows={4}
                                        className={inputClass}
                                    />
                                </div>
                            </>
                        )}

                        {/* Region and Owner selection - always visible */}
                        <div>
                            <label className={labelClass}>Pilih Region</label>
                            <select value={data.id_region} onChange={(e) => setData('id_region', e.target.value)} className={inputClass}>
                                <option value="">-- Pilih Region --</option>
                                {regions.map((r) => (
                                    <option key={r.id_region} value={r.id_region}>
                                        {r.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Pilih Owner</label>
                            <select value={data.id_owner} onChange={(e) => setData('id_owner', e.target.value)} className={inputClass}>
                                <option value="">-- Pilih Owner --</option>
                                {owners.map((o) => (
                                    <option key={o.id_owner} value={o.id_owner}>
                                        {o.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex justify-end md:col-span-2">
                            <button
                                type="button"
                                onClick={nextStep}
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                            >
                                Selanjutnya
                            </button>
                        </div>
                    </div>
                );

            case 2:
                return (
                    <div className={stepContainer}>
                        <div>
                            <label className={labelClass}>Nomor</label>
                            <input value={data.nomor} onChange={(e) => setData('nomor', e.target.value)} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Sifat</label>
                            <select value={data.sifat} onChange={(e) => setData('sifat', e.target.value)} className={inputClass}>
                                <option value="Biasa">Biasa</option>
                                <option value="Penting">Penting</option>
                                <option value="Rahasia">Rahasia</option>
                                <option value="Segera">Segera</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Hal</label>
                            <input value={data.hal} onChange={(e) => setData('hal', e.target.value)} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Kepada</label>
                            <input value={data.kepada} onChange={(e) => setData('kepada', e.target.value)} className={inputClass} />
                        </div>
                        <div className="md:col-span-2">
                            <label className={labelClass}>Deskripsi</label>
                            <textarea
                                value={data.description}
                                onChange={(e) => setData('description', e.target.value)}
                                rows={3}
                                className={inputClass}
                            />
                        </div>
                        <div className="flex justify-between md:col-span-2">
                            <button
                                type="button"
                                onClick={prevStep}
                                className="rounded-md bg-gray-500 px-4 py-2 text-sm text-white hover:bg-gray-600"
                            >
                                Kembali
                            </button>
                            <button
                                type="button"
                                onClick={nextStep}
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                            >
                                Lanjut ke Upload
                            </button>
                        </div>
                    </div>
                );

            case 3:
                return (
                    <div className="space-y-4">
                        <label className={labelClass}>Upload PDF</label>
                        <input
                            type="file"
                            accept="application/pdf"
                            onChange={(e) => setData('file_path', e.target.files?.[0] ?? null)}
                            className={inputClass}
                        />
                        <div className="flex justify-between">
                            <button
                                type="button"
                                onClick={prevStep}
                                className="rounded-md bg-gray-500 px-4 py-2 text-sm text-white hover:bg-gray-600"
                            >
                                Kembali
                            </button>
                            <button
                                type="submit"
                                disabled={processing}
                                className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                            >
                                {processing ? 'Menyimpan...' : 'Simpan Laporan'}
                            </button>
                        </div>
                    </div>
                );
        }
    };

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Dashboard', href: '/dashboard' },
                { title: 'Laporan', href: '/dashboard/tambah-pdf' },
                { title: 'Tambah Laporan', href: '#' },
            ]}
        >
            <Head title="Tambah Laporan" />
            <div className="mx-auto max-w-screen-xl px-4 py-6 md:px-6">
                <h1 className="mb-2 text-2xl font-bold">Tambah Laporan & GeoJSON</h1>
                <form onSubmit={handleSubmit}>{renderStep()}</form>
            </div>
        </AppLayout>
    );
}
