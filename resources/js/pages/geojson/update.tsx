import AppLayout from '@/layouts/app-layout';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { Feature, FeatureCollection, GeoJsonObject, Geometry } from 'geojson';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import { Controller, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import Select from 'react-select';
import OwnerSearchInput from '@/components/OwnerSearchInput';
import RegionSearchInput from '@/components/RegionSearchInput';
import { calculateGeojsonCenter } from '@/utils/geojsonUtils';
import { saveAs } from 'file-saver';
import shp from 'shpjs';
import JSZip from 'jszip';
import * as toGeoJSON from '@tmcw/togeojson';

const CATEGORY_SELECTION_DISABLED = true;

// Custom styles for React Select to support dark/light mode
const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    
const selectStyles = {
    control: (provided: any, state: any) => ({
        ...provided,
        backgroundColor: isDark ? '#374151' : '#ffffff',
        borderColor: state.isFocused ? (isDark ? '#4b5563' : '#d1d5db') : (isDark ? '#4b5563' : '#d1d5db'),
        color: isDark ? '#f3f4f6' : '#111827',
        '&:hover': {
            borderColor: isDark ? '#4b5563' : '#d1d5db',
        },
    }),
    menu: (provided: any) => ({
        ...provided,
        backgroundColor: isDark ? '#374151' : '#ffffff',
    }),
    option: (provided: any, state: any) => ({
        ...provided,
        backgroundColor: state.isSelected 
            ? (isDark ? '#4b5563' : '#f3f4f6') 
            : state.isFocused 
                ? (isDark ? '#4b5563' : '#f3f4f6') 
                : (isDark ? '#374151' : '#ffffff'),
        color: isDark ? '#f3f4f6' : '#111827',
    }),
    singleValue: (provided: any) => ({
        ...provided,
        color: isDark ? '#f3f4f6' : '#111827',
    }),
    placeholder: (provided: any) => ({
        ...provided,
        color: isDark ? '#9ca3af' : '#6b7280',
    }),
    input: (provided: any) => ({
        ...provided,
        color: isDark ? '#f3f4f6' : '#111827',
    }),
};

interface Kategori {
    id_kategori: number;
    orde0: string;
    kode_warna: string;
    ket_warna: string;
    orde1: string;
    orde2: string;
    orde3: string;
    orde4: string;
}

interface Region {
    id_region: number;
    name: string;
}

interface Owner {
    id_owner: number;
    name: string;
}

interface PageProps extends Record<string, any> {
    geojson: {
        id_geojson: number;
        geojson: any;
        id_region?: number;
        id_owner?: number;
        id_kategori?: number;
        source_name?: string;
        main_category?: string;
    };
    user_name: string;
    user_id: number;
    regions: { 
        id_region: number; 
        name: string;
        provinsi?: string;
        kabupaten?: string;
        kecamatan?: string;
        desa?: string;
        detail?: string;
        link?: string;
    }[];
    owner: { 
        id_owner: number; 
        name: string; 
        wali?: string; 
        type?: string; 
        no_hp?: string; 
    }[];
    kategoris: Kategori[];
    flash?: { success?: string; error?: string; upload_errors?: string[] };
}

interface FormValues {
    geojson: string;
    geojson_file?: FileList;
    id_region: string;
    id_owner: string;
    id_kategori: string;
    source_name: string;
    main_category: string;
    orde1?: string;
    orde2?: string;
    orde3?: string;
    orde4?: string;
}

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

export default function GeojsonEdit() {
    const { geojson, user_name, user_id, regions, owner, kategoris, flash } = usePage<PageProps>().props;
    const [fileList, setFileList] = useState<File[]>([]);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const normalizedGeojson = useMemo(() => normalizeGeojsonData(geojson?.geojson), [geojson?.geojson]);
    const mapBounds = useMemo(() => calculateGeojsonCenter(normalizedGeojson), [normalizedGeojson]);

    // SHP/KML/KMZ to GeoJSON states
    const [shpGeojson, setShpGeojson] = useState<any>(null);
    const [previewGeojsons, setPreviewGeojsons] = useState<any[]>([]);
    const [convertedFilename, setConvertedFilename] = useState<string>('converted.geojson');
    const [isConverting, setIsConverting] = useState<boolean>(false);

    // Helper function to calculate file size in MB
    const getFileSizeInMB = (data: any): number => {
        const jsonString = JSON.stringify(data);
        const sizeInBytes = new Blob([jsonString]).size;
        return sizeInBytes / (1024 * 1024); // Convert to MB
    };

    // Helper function to check if file is too large (>10MB)
    const isFileTooLarge = (data: any): boolean => {
        return getFileSizeInMB(data) > 10;
    };

    // Normalize: convert closed LineString/MultiLineString to Polygon/MultiPolygon
    const normalizeClosedLinesToPolygons = (geojson: any) => {
        const isClosed = (coords: number[][]) => {
            if (!coords || coords.length < 4) return false;
            const a = coords[0];
            const b = coords[coords.length - 1];
            const dx = Math.abs((a?.[0] ?? 0) - (b?.[0] ?? 0));
            const dy = Math.abs((a?.[1] ?? 0) - (b?.[1] ?? 0));
            return dx < 1e-7 && dy < 1e-7;
        };
        const stripZ = (coords: any): any => Array.isArray(coords)
            ? coords.map((c: any) => Array.isArray(c) && typeof c[0] === 'number' ? [c[0], c[1]] : stripZ(c))
            : coords;

        const convert = (f: any) => {
            if (!f?.geometry) return f;
            const g = f.geometry;
            if (g.type === 'LineString' && isClosed(g.coordinates)) {
                return { ...f, geometry: { type: 'Polygon', coordinates: [stripZ(g.coordinates)] } };
            }
            if (g.type === 'MultiLineString') {
                const rings = (g.coordinates || []).filter((r: any) => isClosed(r));
                if (rings.length === (g.coordinates?.length || 0) && rings.length > 0) {
                    if (rings.length === 1) {
                        return { ...f, geometry: { type: 'Polygon', coordinates: [stripZ(rings[0])] } };
                    }
                    return { ...f, geometry: { type: 'MultiPolygon', coordinates: rings.map((r: any) => [stripZ(r)]) } };
                }
            }
            if (g.type === 'Polygon') {
                return { ...f, geometry: { type: 'Polygon', coordinates: stripZ(g.coordinates) } };
            }
            if (g.type === 'MultiPolygon') {
                return { ...f, geometry: { type: 'MultiPolygon', coordinates: stripZ(g.coordinates) } };
            }
            return f;
        };

        if (geojson?.type === 'FeatureCollection') {
            return { ...geojson, features: geojson.features.map(convert) };
        }
        if (geojson?.type === 'Feature') {
            return convert(geojson);
        }
        return geojson;
    };

    useEffect(() => {
        if (flash?.success) toast.success(flash.success);
        if (flash?.error) toast.error(flash.error);
        if (flash?.upload_errors) {
            flash.upload_errors.forEach((msg) => toast.error(msg));
        }
    }, [flash]);

    const {
        register,
        handleSubmit,
        setValue,
        control,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        defaultValues: {
            geojson: JSON.stringify(geojson.geojson, null, 2),
            id_region: geojson.id_region?.toString() || '',
            id_owner: geojson.id_owner?.toString() || '',
            id_kategori: geojson.id_kategori?.toString() || '',
            source_name: geojson.source_name || '',
            main_category: geojson.main_category || '',
        },
    });

    // State to hold the selected category and the filtered options for the orders
    const [selectedKat, setSelectedKat] = useState<Kategori | null>(null);

    const [selectedKatId, setSelectedKatId] = useState<string>(geojson.id_kategori?.toString() || '');
    const selectedKatOption = kategoris.find((k) => k.id_kategori.toString() === selectedKatId);

    useEffect(() => {
        if (selectedKatOption) {
            setSelectedKat(selectedKatOption);
            setValue('id_kategori', selectedKatOption.id_kategori.toString());
        }
    }, [selectedKatOption, setValue]);

    useEffect(() => {
        register('id_kategori', {
            onChange: (e: any) => setSelectedKatId(e.target.value),
        });
        return () => {};
    }, [register]);

    // Always get file from react-hook-form
    const files = watch('geojson_file');

    // Sync fileList state for UI, always after file input changes
    useEffect(() => {
        if (files && files.length > 0) {
            setFileList(Array.from(files));
        } else {
            setFileList([]);
        }
    }, [files]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setValue('geojson_file', e.target.files);
            // state fileList diatur otomatis oleh useEffect di atas
        }
    };

    const handleRemoveFile = (idx: number) => {
        if (!files) return;
        const fileArr = Array.from(files);
        fileArr.splice(idx, 1);
        // update file input via DataTransfer
        const dataTransfer = new DataTransfer();
        fileArr.forEach((file) => dataTransfer.items.add(file));
        if (inputRef.current) inputRef.current.files = dataTransfer.files;
        setValue('geojson_file', dataTransfer.files.length ? dataTransfer.files : undefined);
        // fileList diupdate otomatis oleh useEffect di atas
    };

    const handleRemoveAll = () => {
        if (inputRef.current) inputRef.current.value = '';
        setValue('geojson_file', undefined);
        // fileList diupdate otomatis oleh useEffect di atas
    };

    // Drag and Drop handlers
    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles && droppedFiles.length > 0) {
            // Filter only .geojson files
            const geojsonFiles = Array.from(droppedFiles).filter(file =>
                file.name.toLowerCase().endsWith('.geojson')
            );

            if (geojsonFiles.length === 0) {
                toast.error('Hanya file .geojson yang diperbolehkan');
                return;
            }

            // For update, we only allow single file
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(geojsonFiles[0]);

            if (inputRef.current) {
                inputRef.current.files = dataTransfer.files;
            }

            setValue('geojson_file', dataTransfer.files);
            toast.success(`File ${geojsonFiles[0].name} ditambahkan`);
        }
    };

    // Helper function to group SHP files by basename
    const groupShpFiles = (files: FileList) => {
        const groups: { [key: string]: { [ext: string]: File } } = {};
        
        Array.from(files).forEach(file => {
            const name = file.name;
            const lastDot = name.lastIndexOf('.');
            const basename = lastDot > 0 ? name.substring(0, lastDot) : name;
            const extension = lastDot > 0 ? name.substring(lastDot + 1).toLowerCase() : '';
            
            if (!groups[basename]) {
                groups[basename] = {};
            }
            groups[basename][extension] = file;
        });
        
        return groups;
    };

    // Helper function to validate SHP file group
    const validateShpGroup = (group: { [ext: string]: File }) => {
        const hasShp = 'shp' in group;
        const hasDbf = 'dbf' in group;
        const hasShx = 'shx' in group;
        
        return {
            isValid: hasShp && hasDbf,
            hasShp,
            hasDbf,
            hasShx,
            hasPrj: 'prj' in group,
            hasCpg: 'cpg' in group
        };
    };

    // Helper function to create ArrayBuffer from individual SHP files
    const createShpArrayBuffer = async (group: { [ext: string]: File }, includePrj: boolean = true) => {
        const shpBuffer = await group.shp.arrayBuffer();
        const dbfBuffer = await group.dbf.arrayBuffer();
        const shxBuffer = group.shx ? await group.shx.arrayBuffer() : null;
        const prjBuffer = includePrj && group.prj ? await group.prj.arrayBuffer() : null;
        
        // Create a simple object structure that shpjs can understand
        const shpData: any = {
            shp: shpBuffer,
            dbf: dbfBuffer
        };
        
        if (shxBuffer) shpData.shx = shxBuffer;
        if (prjBuffer) shpData.prj = prjBuffer;
        
        return shpData;
    };

    const isProjectionError = (err: unknown) => {
        const message = (err as Error)?.message || String(err || '');
        return /proj4|projcs|projection|could not get proj/i.test(message);
    };

    // SHP to GeoJSON conversion functions
    const handleShpUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length) return;

        setIsConverting(true);
        try {
            // Check if it's a ZIP file
            if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
                // Handle ZIP file (existing logic)
                const arrayBuffer = await files[0].arrayBuffer();
                let result: any;
                try {
                    result = await shp(arrayBuffer);
                } catch (err) {
                    if (isProjectionError(err)) {
                        toast.error(
                            'Gagal membaca proyeksi SHP. Coba unzip dan upload tanpa file .prj, atau ekspor ulang ke WGS84 (EPSG:4326).'
                        );
                        return;
                    }
                    throw err;
                }

                // Multiple parts case
                if (Array.isArray(result) && result.length > 1) {
                    const previewData = result.map((fc: any) => {
                        const name = fc.fileName
                            ? `${fc.fileName.replace(/\.[^/.]+$/, '')}.geojson`
                            : `${files[0].name.replace(/\.[^/.]+$/, '')}_part.geojson`;

                        return {
                            filename: name,
                            data: fc,
                        };
                    });
                    setPreviewGeojsons(previewData);
                    setShpGeojson(null);
                    toast.success(`Berhasil mengkonversi ${previewData.length} file GeoJSON dari ZIP`);
                }
                // Single file case
                else {
                    const fc = Array.isArray(result) ? result[0] : result;
                    setShpGeojson(fc);
                    const name = fc.fileName 
                        ? `${fc.fileName.replace(/\.[^/.]+$/, '')}.geojson` 
                        : `${files[0].name.replace(/\.[^/.]+$/, '')}.geojson`;
                    setConvertedFilename(name);
                    setPreviewGeojsons([]);
                    toast.success('Berhasil mengkonversi SHP ke GeoJSON dari ZIP');
                }
            } else {
                // Handle individual SHP files
                const groups = groupShpFiles(files!);
                const validGroups: Array<{ basename: string; group: { [ext: string]: File } }> = [];
                const invalidGroups: string[] = [];

                // Validate each group
                for (const [basename, group] of Object.entries(groups)) {
                    const validation = validateShpGroup(group);
                    if (validation.isValid) {
                        validGroups.push({ basename, group });
                    } else {
                        const missing = [];
                        if (!validation.hasShp) missing.push('.shp');
                        if (!validation.hasDbf) missing.push('.dbf');
                        invalidGroups.push(`${basename} (missing: ${missing.join(', ')})`);
                    }
                }

                if (invalidGroups.length > 0) {
                    toast.error(`File tidak lengkap: ${invalidGroups.join(', ')}`);
                    return;
                }

                if (validGroups.length === 0) {
                    toast.error('Tidak ada file SHP yang valid ditemukan');
                    return;
                }

                // Convert valid groups
                const results = [];
                for (const { basename, group } of validGroups) {
                    try {
                        let result: any;
                        try {
                            const shpData = await createShpArrayBuffer(group, true);
                            result = await shp(shpData);
                        } catch (err) {
                            if (group.prj && isProjectionError(err)) {
                                const shpData = await createShpArrayBuffer(group, false);
                                result = await shp(shpData);
                            } else {
                                throw err;
                            }
                        }
                        
                        const fc = Array.isArray(result) ? result[0] : result;
                        // Add fileName property for consistency with ZIP file processing
                        fc.fileName = basename;
                        results.push({
                            filename: `${basename}.geojson`,
                            data: fc
                        });
                    } catch (err) {
                        toast.error(`Gagal mengkonversi ${basename}: ${err}`);
                    }
                }

                if (results.length === 1) {
                    // Single result
                    setShpGeojson(results[0].data);
                    setConvertedFilename(results[0].filename);
                    setPreviewGeojsons([]);
                    toast.success(`Berhasil mengkonversi ${results[0].filename}`);
                } else if (results.length > 1) {
                    // Multiple results
                    setPreviewGeojsons(results);
                    setShpGeojson(null);
                    toast.success(`Berhasil mengkonversi ${results.length} file GeoJSON`);
                }
            }
        } catch (err) {
            toast.error('Gagal mengkonversi file: ' + err);
        } finally {
            setIsConverting(false);
        }
    };

    const handleUseConvertedGeoJSON = (geojsonData: any, filename: string) => {
        // Convert GeoJSON object to string and set it to the form
        setValue('geojson', JSON.stringify(geojsonData, null, 2));
        toast.success(`GeoJSON "${filename}" siap untuk disimpan`);
    };

    const handleDownloadGeoJSON = (geojsonData: any, filename: string) => {
        const blob = new Blob([JSON.stringify(geojsonData, null, 2)], { type: 'application/json' });
        saveAs(blob, filename);
    };

    const handleDownloadAllGeoJSON = () => {
        if (previewGeojsons.length > 0) {
            previewGeojsons.forEach(({ filename, data }) => {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                saveAs(blob, filename);
            });
            toast.success(`${previewGeojsons.length} file berhasil didownload`);
        } else if (shpGeojson) {
            const blob = new Blob([JSON.stringify(shpGeojson, null, 2)], { type: 'application/json' });
            saveAs(blob, convertedFilename);
            toast.success('File berhasil didownload');
        }
    };

    const handleClearConversion = () => {
        setShpGeojson(null);
        setPreviewGeojsons([]);
        setConvertedFilename('converted.geojson');
    };

    const onSubmit = (data: FormValues) => {
        const formData = new FormData();
        if (data.geojson_file?.length) {
            formData.append('geojson_file', data.geojson_file[0]);
        } else {
            try {
                formData.append('geojson', JSON.stringify(JSON.parse(data.geojson)));
            } catch {
                toast.error('Format GeoJSON teks tidak valid');
                return;
            }
        }
        formData.append('_method', 'PUT');
        formData.append('id_user', user_id.toString());
        if (data.id_region) formData.append('id_region', data.id_region);
        if (data.id_owner) formData.append('id_owner', data.id_owner);
        if (data.id_kategori) formData.append('id_kategori', data.id_kategori);
        if (data.source_name) formData.append('source_name', data.source_name);
        if (data.main_category) formData.append('main_category', data.main_category);

        router.post(`/dashboard/geojson/${geojson.id_geojson}`, formData, {
            onSuccess: () => toast.success('GeoJSON diperbarui!'),
        });
    };

    const handleDelete = () => {
        if (!confirm('Yakin hapus data ini?')) return;
        router.delete(`/dashboard/geojson/${geojson.id_geojson}`, {
            onSuccess: () => toast.success('GeoJSON berhasil dihapus'),
            onError: () => toast.error('Gagal menghapus GeoJSON'),
        });
    };

    // Format for React Select
    const categoryOptions = kategoris.map((k) => ({
        value: k.id_kategori,
        label: `${k.orde0} / ${k.orde1} / ${k.orde2} / ${k.orde3} / ${k.orde4}`,
        ...k, // Attach the whole category data to the option
    }));

    // KML/KMZ helpers
    const parseKmlTextToGeoJSON = (kmlText: string) => {
        const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
        const gj = toGeoJSON.kml(dom);
        return gj;
    };

    const handleKmlKmzUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length) return;
        setIsConverting(true);
        try {
            const file = files[0];
            const lower = file.name.toLowerCase();
            if (lower.endsWith('.kml')) {
                const text = await file.text();
                const gj = normalizeClosedLinesToPolygons(parseKmlTextToGeoJSON(text));
                setShpGeojson(gj);
                setPreviewGeojsons([]);
                setConvertedFilename(`${file.name.replace(/\.[^/.]+$/, '')}.geojson`);
                toast.success('Berhasil mengkonversi KML ke GeoJSON');
            } else if (lower.endsWith('.kmz')) {
                const buf = await file.arrayBuffer();
                const zip = await JSZip.loadAsync(buf);
                const kmlEntry = zip.file(/doc\.kml$/i)[0] || zip.file(/\.kml$/i)[0];
                if (!kmlEntry) throw new Error('KMZ tidak berisi file KML');
                const kmlText = await kmlEntry.async('text');
                const gj = normalizeClosedLinesToPolygons(parseKmlTextToGeoJSON(kmlText));
                setShpGeojson(gj);
                setPreviewGeojsons([]);
                setConvertedFilename(`${file.name.replace(/\.[^/.]+$/, '')}.geojson`);
                toast.success('Berhasil mengkonversi KMZ ke GeoJSON');
            } else {
                toast.error('Format tidak dikenali. Pilih file .kml atau .kmz');
            }
        } catch (err: any) {
            toast.error(`Gagal mengkonversi KML/KMZ: ${err?.message || err}`);
        } finally {
            setIsConverting(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Dashboard', href: '/dashboard' },
                { title: 'Geojson', href: '/dashboard/geojson' },
                { title: 'Edit Geojson', href: `/dashboard/geojson/${geojson.id_geojson}/edit` },
            ]}
        >
            <Head title="Edit Geojson" />

            <div className="bg-white p-6 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
                <h1 className="mb-4 text-2xl font-bold">Edit Geojson</h1>
                <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Preview Map</h2>
                        <span className="text-xs text-gray-500 dark:text-gray-400">GeoJSON ID: {geojson.id_geojson}</span>
                    </div>
                    {normalizedGeojson ? (
                        <div className="h-64 w-full overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
                            <MapContainer center={mapBounds.center} zoom={mapBounds.zoom} style={{ height: '100%', width: '100%' }}>
                                <TileLayer
                                    attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <GeoJSON data={normalizedGeojson} />
                            </MapContainer>
                        </div>
                    ) : (
                        <div className="rounded-md border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                            Preview GeoJSON tidak tersedia.
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {/* GeoJSON Text */}
                    <div>
                        <label htmlFor="geojson" className="mb-1 block">
                            GeoJSON (Text Format)
                        </label>
                        <textarea
                            id="geojson"
                            rows={4}
                            {...register('geojson')}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 shadow-sm focus:ring focus:ring-indigo-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        />
                        {errors.geojson && <p className="mt-1 text-sm text-red-500">{errors.geojson.message}</p>}
                    </div>

                    {/* File Upload */}
                    <div>
                        <label htmlFor="geojson_file" className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
                            GeoJSON (File Upload)
                        </label>

                        {/* Drag and Drop Zone */}
                        <div
                            onDragEnter={handleDragEnter}
                            onDragLeave={handleDragLeave}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            className={`relative rounded-lg border-2 border-dashed transition-all ${
                                isDragging
                                    ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                                    : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
                            }`}
                        >
                            <input
                                id="geojson_file"
                                type="file"
                                accept=".geojson"
                                {...register('geojson_file')}
                                ref={inputRef}
                                className="hidden"
                                onChange={handleFileChange}
                            />

                            <label
                                htmlFor="geojson_file"
                                className="flex cursor-pointer flex-col items-center justify-center px-6 py-8 text-center"
                            >
                                <svg
                                    className={`mb-3 h-12 w-12 transition-colors ${
                                        isDragging
                                            ? 'text-blue-500 dark:text-blue-400'
                                            : 'text-gray-400 dark:text-gray-500'
                                    }`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                    />
                                </svg>
                                <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    {isDragging ? (
                                        <span className="text-blue-600 dark:text-blue-400">
                                            Drop file di sini
                                        </span>
                                    ) : (
                                        <>
                                            <span className="text-blue-600 dark:text-blue-400">
                                                Click untuk upload
                                            </span>{' '}
                                            atau drag and drop
                                        </>
                                    )}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    File GeoJSON (.geojson)
                                </p>
                            </label>
                        </div>

                        {errors.geojson_file && <p className="mt-1 text-sm text-red-500">{errors.geojson_file.message}</p>}

                        {/* Show selected file */}
                        {fileList.length > 0 && (
                            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                                <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <svg
                                            className="h-5 w-5 flex-shrink-0 text-blue-500"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                            />
                                        </svg>
                                        <span className="truncate text-sm text-gray-700 dark:text-gray-300">
                                            {fileList[0].name}
                                        </span>
                                        <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">
                                            ({(fileList[0].size / 1024).toFixed(2)} KB)
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRemoveAll}
                                        className="flex-shrink-0 rounded bg-red-100 p-1.5 text-red-600 transition hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800"
                                        title="Hapus file"
                                    >
                                        <svg
                                            className="h-4 w-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M6 18L18 6M6 6l12 12"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* User (readonly) */}
                    <div>
                        <label htmlFor="id_user" className="mb-1 block">
                            User
                        </label>
                        <input
                            id="id_user"
                            readOnly
                            value={user_name}
                            className="w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-gray-700 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                        />
                    </div>

                    {/* Source Name */}
                    <div>
                        <label htmlFor="source_name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Source Name
                        </label>
                        <input
                            id="source_name"
                            type="text"
                            {...register('source_name')}
                            placeholder="Masukkan nama sumber data"
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:ring focus:ring-indigo-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        />
                        {errors.source_name && <p className="mt-1 text-sm text-red-500">{errors.source_name.message}</p>}
                    </div>

                    {/* Region */}
                    <div>
                        <label className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Region</label>
                        <Controller
                            name="id_region"
                            control={control}
                            render={({ field, fieldState }) => (
                                <RegionSearchInput
                                    regions={regions}
                                    value={field.value}
                                    onChange={field.onChange}
                                    error={fieldState.error?.message}
                                    placeholder="Cari atau pilih region..."
                                />
                            )}
                        />
                    </div>

                    {/* Owner */}
                    <div>
                        <label className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Owner</label>
                        <Controller
                            name="id_owner"
                            control={control}
                            render={({ field, fieldState }) => (
                                <OwnerSearchInput
                                    owners={owner}
                                    value={field.value}
                                    onChange={field.onChange}
                                    error={fieldState.error?.message}
                                    placeholder="Cari atau pilih owner..."
                                />
                            )}
                        />
                    </div>

                    {/* SHP to GeoJSON Converter */}
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                        <h3 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">
                            SHP to GeoJSON Converter
                        </h3>
                        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                            Upload file ZIP yang berisi SHP atau file-file SHP individual untuk dikonversi ke GeoJSON dan langsung digunakan dalam form ini.
                        </p>
                        
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="shpUpload" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Upload File SHP
                                </label>
                                <input
                                    id="shpUpload"
                                    type="file"
                                    accept=".zip,.shp,.dbf,.shx,.prj,.cpg"
                                    multiple
                                    onChange={handleShpUpload}
                                    disabled={isConverting}
                                    className="mt-2 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm file:mr-4 file:rounded file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700 focus:outline-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Format: <code>.zip</code> berisi SHP files, atau upload file individual <code>.shp</code>, <code>.dbf</code>, <code>.shx</code>, <code>.prj</code>, <code>.cpg</code>
                                </p>
                            </div>

                            {/* KML/KMZ to GeoJSON */}
                            <div className="mt-6">
                                <h4 className="mb-2 text-md font-semibold text-gray-800 dark:text-gray-200">KML/KMZ to GeoJSON</h4>
                                <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">Unggah file .kml atau .kmz untuk dikonversi.</p>
                                <input
                                    id="kmlKmzUpload"
                                    type="file"
                                    accept=".kml,.kmz"
                                    onChange={handleKmlKmzUpload}
                                    disabled={isConverting}
                                    className="mt-2 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                />
                            </div>

                            {isConverting && (
                                <div className="flex items-center space-x-2 text-blue-600">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                                    <span className="text-sm">Mengkonversi file...</span>
                                </div>
                            )}

                            {/* Single GeoJSON Result */}
                            {shpGeojson && (
                                <div className="rounded border border-green-200 bg-green-50 p-3 dark:border-green-700 dark:bg-green-900">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <span className="text-sm font-medium text-green-800 dark:text-green-200">
                                                {convertedFilename}
                                            </span>
                                            <span className="ml-2 text-xs text-gray-600 dark:text-gray-400">
                                                ({getFileSizeInMB(shpGeojson).toFixed(2)} MB)
                                            </span>
                                            {isFileTooLarge(shpGeojson) && (
                                                <div className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                                                    ⚠️ File lebih dari 10MB, hanya bisa download
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex space-x-2">
                                            {!isFileTooLarge(shpGeojson) && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleUseConvertedGeoJSON(shpGeojson, convertedFilename)}
                                                    className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-green-700"
                                                    title="Gunakan GeoJSON ini di form"
                                                >
                                                    Gunakan
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleDownloadGeoJSON(shpGeojson, convertedFilename)}
                                                className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
                                                title="Download file GeoJSON"
                                            >
                                                Download
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Multiple GeoJSON Results */}
                            {previewGeojsons.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                {previewGeojsons.length} file GeoJSON berhasil dikonversi
                                            </span>
                                            {(() => {
                                                const largeFiles = previewGeojsons.filter(file => isFileTooLarge(file.data));
                                                return largeFiles.length > 0 && (
                                                    <div className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                                                        ⚠️ {largeFiles.length} file lebih dari 10MB
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleDownloadAllGeoJSON}
                                                className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
                                                title="Download semua file GeoJSON"
                                            >
                                                Download Semua
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleClearConversion}
                                                className="rounded bg-gray-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-gray-600"
                                                title="Hapus semua hasil konversi"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>
                                    {previewGeojsons.map((file, index) => {
                                        const fileSizeMB = getFileSizeInMB(file.data);
                                        const isTooLarge = isFileTooLarge(file.data);

                                        return (
                                            <div key={index} className="rounded border border-blue-200 bg-blue-50 p-3 dark:border-blue-700 dark:bg-blue-900">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                                                                {file.filename}
                                                            </span>
                                                            <span className="text-xs text-gray-600 dark:text-gray-400">
                                                                ({fileSizeMB.toFixed(2)} MB)
                                                            </span>
                                                        </div>
                                                        {isTooLarge && (
                                                            <div className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                                                                ⚠️ File lebih dari 10MB, hanya bisa download
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex space-x-2">
                                                        {!isTooLarge && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleUseConvertedGeoJSON(file.data, file.filename)}
                                                                className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-green-700"
                                                                title="Gunakan GeoJSON ini di form"
                                                            >
                                                                Gunakan
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDownloadGeoJSON(file.data, file.filename)}
                                                            className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
                                                            title="Download file GeoJSON"
                                                        >
                                                            Download
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {(shpGeojson || previewGeojsons.length > 0) && (
                                <button
                                    type="button"
                                    onClick={handleClearConversion}
                                    className="w-full rounded bg-gray-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-600"
                                >
                                    Clear Semua Konversi
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Category with live-preview (pakai Controller) */}
                    <div>
                            <label className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Category</label>
                            <Controller
                                name="id_kategori"
                                control={control}
                                defaultValue={selectedKatId}
                                render={({ field }) => (
                                    <Select
                                        {...field}
                                        options={categoryOptions}
                                        value={categoryOptions.find((opt) => opt.value.toString() === field.value)}
                                        onChange={(opt) => {
                                            if (CATEGORY_SELECTION_DISABLED) return;
                                            field.onChange(opt?.value.toString() ?? '');
                                            setSelectedKat(opt ?? null);
                                        }}
                                        getOptionLabel={(e) => e.label}
                                        getOptionValue={(e) => e.value.toString()}
                                        placeholder={
                                            CATEGORY_SELECTION_DISABLED ? 'Pengubahan kategori dikunci sementara' : '— Select Category —'
                                        }
                                        isDisabled={CATEGORY_SELECTION_DISABLED}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    />
                                )}
                            />
                            {errors.id_kategori && <p className="mt-1 text-sm text-red-500">{errors.id_kategori.message}</p>}

                            {CATEGORY_SELECTION_DISABLED && (
                                <p className="mt-2 text-sm text-amber-600">
                                    Pengubahan kategori dinonaktifkan sementara. Nilai yang tampil di bawah ini tetap digunakan.
                                </p>
                            )}

                            {selectedKat && (
                                <div className="mt-2 flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                                    <span className="block h-6 w-6 flex-shrink-0 rounded" style={{ backgroundColor: selectedKat.kode_warna }} />
                                    <div className="text-sm">
                                        <p className="font-medium text-gray-900 dark:text-gray-100">{selectedKat.orde0}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Orde 1 = {selectedKat.orde1}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Orde 2 = {selectedKat.orde2}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Orde 3 = {selectedKat.orde3}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Orde 4 = {selectedKat.orde4}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">*Ket {selectedKat.ket_warna}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                    {/* Main Category */}
                    <div>
                        <label className="mb-1 block font-medium text-gray-700 dark:text-gray-300">Main Category</label>
                        <Controller
                            name="main_category"
                            control={control}
                            defaultValue=""
                            render={({ field }) => (
                                <Select
                                    {...field}
                                    options={[
                                        { value: 'RDTR', label: 'RDTR (Rencana Detail Tata Ruang)' },
                                        { value: 'RTRW', label: 'RTRW (Rencana Tata Ruang Wilayah)' },
                                        { value: 'KKPR', label: 'KKPR (Kawasan Konservasi dan Perlindungan)' },
                                        { value: 'GANTI RUGI', label: 'GANTI RUGI' },
                                    ]}
                                    value={
                                        field.value
                                            ? { value: field.value, label: field.value === 'RDTR' ? 'RDTR (Rencana Detail Tata Ruang)' : field.value === 'RTRW' ? 'RTRW (Rencana Tata Ruang Wilayah)' : field.value === 'KKPR' ? 'KKPR (Kawasan Konservasi dan Perlindungan)' : 'GANTI RUGI' }
                                            : null
                                    }
                                    onChange={(opt) => field.onChange(opt?.value ?? '')}
                                    placeholder="— Select Main Category —"
                                    styles={selectStyles}
                                    isClearable
                                    className="react-select-container"
                                    classNamePrefix="react-select"
                                />
                            )}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={handleDelete} className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600">
                            Delete
                        </button>

                        <Link
                            href="/dashboard/geojson"
                            className="rounded-md bg-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-400 dark:bg-gray-600 dark:text-gray-200"
                        >
                            Cancel
                        </Link>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isSubmitting ? 'Updating…' : 'Update'}
                        </button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}
