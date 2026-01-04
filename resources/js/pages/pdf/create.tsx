import AppLayout from '@/layouts/app-layout';
import { useForm } from '@inertiajs/react';
import 'leaflet/dist/leaflet.css';
import React, { useMemo } from 'react';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import type { Feature, FeatureCollection, GeoJsonObject, Geometry } from 'geojson';
import { calculateGeojsonCenter } from '@/utils/geojsonUtils';

type CreateProps = {
    geojsonSelected?: {
        id_geojson: number | string;
        source_name?: string;
        region_name?: string;
        owner_name?: string;
        geojson?: GeoJSON.GeoJsonObject;
    };
    regions: Array<{ id_region: number; name: string }>;
    owners: Array<{ id_owner: number; name: string }>;
    user_id: number | null;
};

type FormData = {
    id_geojson: number | string | '';
    nomor: string;
    sifat: string;
    hal: string;
    kepada: string;
    description: string;
    file_path: File | null;
};

const normalizeGeojsonData = (input: any): GeoJsonObject | null => {
    if (!input) return null;

    let data = input;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return null;
        }
    }

    if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
        return data as FeatureCollection;
    }

    if (data.type === 'Feature' && data.geometry) {
        return {
            type: 'FeatureCollection',
            features: [data as Feature],
        };
    }

    if (data.type && data.coordinates) {
        return {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    geometry: data as Geometry,
                    properties: {},
                },
            ],
        };
    }

    if (data.geometry) {
        return {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    geometry: data.geometry as Geometry,
                    properties: data.properties ?? {},
                },
            ],
        };
    }

    return null;
};

export default function Create({ geojsonSelected, regions, owners, user_id }: CreateProps) {
    const { data, setData, post, errors } = useForm<FormData>({
        id_geojson: geojsonSelected?.id_geojson || '',
        nomor: '',
        sifat: 'Biasa',
        hal: '',
        kepada: '',
        description: '',
        file_path: null,
    });

    const submit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        post(route('dashboard.report.store'), { forceFormData: true });
    };
    const normalizedGeojson = useMemo(
        () => normalizeGeojsonData(geojsonSelected?.geojson),
        [geojsonSelected?.geojson]
    );

    // Calculate center coordinates from GeoJSON data
    const mapBounds = useMemo(() => {
        return calculateGeojsonCenter(normalizedGeojson);
    }, [normalizedGeojson]);

    const center = mapBounds.center;
    const zoom = mapBounds.zoom;

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Dashboard', href: '/dashboard' },
                { title: 'PDF', href: '/dashboard/tambah-pdf' },
                { title: 'Create PDF', href: `/dashboard/geojson/${geojsonSelected?.id_geojson || ''}/add` },
            ]}
        >
            <div className="p-6">
                <h1 className="mb-4 text-2xl font-bold">Create PDF</h1>

                {geojsonSelected && (
                    <>
                        <div className="mb-4 rounded border bg-gray-50 p-2 transition-colors dark:border-[#232329] dark:bg-[#18181b]">
                            <p className="text-gray-800 dark:text-gray-200">
                                <strong>GeoJSON Selected:</strong> {geojsonSelected.source_name}
                                {' - '}
                                <span className="font-semibold">Region:</span> {geojsonSelected.region_name}
                                {' - '}
                                <span className="font-semibold">Owner:</span> {geojsonSelected.owner_name}
                            </p>
                        </div>

                        {normalizedGeojson ? (
                            <>
                                {/* Map */}
                                <div className="mb-6 h-64 w-full rounded border">
                                    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
                                        <TileLayer
                                            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        />
                                        <GeoJSON data={normalizedGeojson} />
                                    </MapContainer>
                                </div>
                            </>
                        ) : (
                            <div className="mb-6 rounded border border-dashed px-4 py-6 text-sm text-gray-500">
                                GeoJSON belum tersedia untuk ditampilkan.
                            </div>
                        )}
                    </>
                )}

                <form onSubmit={submit} className="space-y-6">
                    <input type="hidden" value={data.id_geojson} name="id_geojson" />
                    {/* Form Layout: Grid 6:6 */}
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        {/* Nomor */}
                        <div className="flex flex-col">
                            <label className="block text-sm font-semibold">Nomor</label>
                            <input
                                type="text"
                                name="nomor"
                                value={data.nomor}
                                onChange={(e) => setData('nomor', e.target.value)}
                                className="w-full rounded-lg border p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            {errors.nomor && <p className="mt-1 text-xs text-red-600">{errors.nomor}</p>}
                        </div>

                        {/* Sifat */}
                        <div className="flex flex-col">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Sifat</label>
                            <select
                                name="sifat"
                                value={data.sifat}
                                onChange={(e) => setData('sifat', e.target.value)}
                                className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-[#232329] dark:bg-[#18181b] dark:text-gray-100"
                            >
                                <option value="Biasa">Biasa</option>
                                <option value="Rahasia">Rahasia</option>
                                <option value="Penting">Penting</option>
                                <option value="Segera">Segera</option>
                            </select>
                            {errors.sifat && <p className="mt-1 text-xs text-red-600">{errors.sifat}</p>}
                        </div>

                        {/* Hal */}
                        <div className="flex flex-col">
                            <label className="block text-sm font-semibold">Hal</label>
                            <input
                                type="text"
                                name="hal"
                                value={data.hal}
                                onChange={(e) => setData('hal', e.target.value)}
                                className="w-full rounded-lg border p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            {errors.hal && <p className="mt-1 text-xs text-red-600">{errors.hal}</p>}
                        </div>

                        {/* Kepada */}
                        <div className="flex flex-col">
                            <label className="block text-sm font-semibold">Kepada</label>
                            <input
                                type="text"
                                name="kepada"
                                value={data.kepada}
                                onChange={(e) => setData('kepada', e.target.value)}
                                className="w-full rounded-lg border p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            {errors.kepada && <p className="mt-1 text-xs text-red-600">{errors.kepada}</p>}
                        </div>

                        {/* Description */}
                        <div className="flex flex-col">
                            <label className="block text-sm font-semibold">Description</label>
                            <textarea
                                name="description"
                                value={data.description}
                                onChange={(e) => setData('description', e.target.value)}
                                className="w-full rounded-lg border p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
                        </div>

                        {/* File PDF */}
                        <div className="flex flex-col">
                            <label className="block text-sm font-semibold">File PDF</label>
                            <input
                                type="file"
                                name="file_path"
                                accept="application/pdf"
                                onChange={(e) => {
                                    if (e.target.files && e.target.files.length > 0) {
                                        setData('file_path', e.target.files[0]);
                                    }
                                }}
                                className="w-full rounded-lg border p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            {errors.file_path && <p className="mt-1 text-xs text-red-600">{errors.file_path}</p>}
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="mt-6 flex justify-end">
                        <button type="submit" className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700">
                            Submit
                        </button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
