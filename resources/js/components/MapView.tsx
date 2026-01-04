import BaseLayers from '@/components/BaseLayer';
import SidebarFilter from '@/components/SidebarFilter';
import { Feature, FeatureCollection } from 'geojson';
import L, { Map as LeafletMap } from 'leaflet';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// Tree-shakeable icon imports for better bundle size
import { FaMapMarkedAlt } from 'react-icons/fa';
import { FaFilePdf } from 'react-icons/fa6';
import { IoAddCircleOutline } from 'react-icons/io5';
import { GeoJSON, LayersControl, MapContainer, Popup, ScaleControl, useMap } from 'react-leaflet';
import GeomanControl from './GeomanControl';

const { BaseLayer, Overlay } = LayersControl;

const COLOR_STORAGE_KEY = 'dashboard.layerColors.v1';
const COLOR_STORAGE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const isHexColor = (value: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);

const normalizeColorForPicker = (color: string, fallback = '#3388ff') =>
    isHexColor(color) ? color : fallback;

const readStoredColors = (): Record<string, string> => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(COLOR_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, { color: string; updatedAt?: number }>;
        const now = Date.now();
        const cleaned: Record<string, string> = {};
        let needsPersist = false;
        for (const [key, entry] of Object.entries(parsed || {})) {
            if (!entry || typeof entry.color !== 'string') {
                needsPersist = true;
                continue;
            }
            const updatedAt = typeof entry.updatedAt === 'number' ? entry.updatedAt : 0;
            if (updatedAt && now - updatedAt > COLOR_STORAGE_TTL_MS) {
                needsPersist = true;
                continue;
            }
            cleaned[key] = entry.color;
            if (!updatedAt) needsPersist = true;
        }
        if (needsPersist) {
            try {
                const payload: Record<string, { color: string; updatedAt: number }> = {};
                const timestamp = Date.now();
                Object.entries(cleaned).forEach(([key, color]) => {
                    payload[key] = { color, updatedAt: timestamp };
                });
                window.localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(payload));
            } catch {
                /* ignore persist errors */
            }
        }
        return cleaned;
    } catch {
        return {};
    }
};

const persistStoredColors = (colors: Record<string, string>) => {
    if (typeof window === 'undefined') return;
    try {
        const timestamp = Date.now();
        const payload: Record<string, { color: string; updatedAt: number }> = {};
        Object.entries(colors).forEach(([key, color]) => {
            payload[key] = { color, updatedAt: timestamp };
        });
        window.localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(payload));
    } catch {
        /* ignore persist errors */
    }
};

// Helper function untuk build properties preview
const buildPropertiesPreview = (properties: Record<string, any>): string => {
    const entries = Object.entries(properties || {})
        .filter(([k]) => k !== 'id_geojson')
        .map(([k, v]) => `${k}: ${v}`)
        .slice(0, 3); // Limit to first 3 properties for performance
    return entries.length > 0 ? entries.join(', ') : '';
};

// Debounce helper
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    return function (this: any, ...args: Parameters<T>) {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const renameParentKey = <T,>(
    state: Record<string, Record<string, T>>,
    oldName: string,
    newName: string
): Record<string, Record<string, T>> => {
    let changed = false;
    const next: Record<string, Record<string, T>> = {};
    Object.entries(state || {}).forEach(([category, parents]) => {
        if (parents && Object.prototype.hasOwnProperty.call(parents, oldName)) {
            changed = true;
            const updatedParents = { ...parents };
            updatedParents[newName] = updatedParents[oldName];
            delete updatedParents[oldName];
            next[category] = updatedParents;
        } else {
            next[category] = parents;
        }
    });
    return changed ? next : state;
};

const replaceParentSegmentInKey = (key: string, oldName: string, newName: string) => {
    const needle = `-${oldName}-`;
    if (!key.includes(needle)) return key;
    return key.replace(needle, `-${newName}-`);
};

const renameLayerKeyCollection = (record: Record<string, string>, oldName: string, newName: string) => {
    let changed = false;
    const next: Record<string, string> = {};
    Object.entries(record || {}).forEach(([key, value]) => {
        if (key.includes(`-${oldName}-`)) {
            changed = true;
            next[replaceParentSegmentInKey(key, oldName, newName)] = value;
        } else {
            next[key] = value;
        }
    });
    return { changed, next };
};

interface MapViewProps {
    geojsonData: Array<{
        id_geojson: number | string;
        geojson: {
            geometry?: GeoJSON.Geometry;
            properties: Record<string, any>;
        };
        kode_warna: string;
        main_category?: string | null;
        kategori?: {
            layer_order: number;
            orde0?: string;
            kode_warna?: string;
            kode?: string;
        };
        source_name: string;
        geojson_bbox?: {
            min_lng: number;
            min_lat: number;
            max_lng: number;
            max_lat: number;
        } | null;
    }>;
    // Optional: daftar id yang ingin ditampilkan secara default
    initialVisibleIds?: Array<string | number>;
    fetchGeojsonBatch?: (ids: Array<string | number>) => Promise<Record<string, GeoJSON.Feature | null>>;
    readOnly?: boolean;
    showLayerControls?: boolean;
    filterSearch?: string;
    onFilterSearch?: (value: string) => void;
    filterPagination?: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
    onFilterPageChange?: (page: number) => void;
    filterPerPageOptions?: number[];
    onFilterPerPageChange?: (value: number) => void;
    isMetaLoading?: boolean;
    mainCategoryOptions?: string[];
    activeMainCategory?: string | null;
    categoryLoadState?: Record<string, CategoryLoadState>;
    onCategoryLoad?: (category: string) => void;
}

type PolygonDisplayMode = 'fill' | 'outline';
type CategoryLoadState = 'idle' | 'loading' | 'loaded';
const FEATURE_BATCH_SIZE = 50;
const USER_LAYER_STYLE = {
    color: '#ff1f8f',
    weight: 2.5,
    dashArray: '6 4',
    opacity: 0.9,
    fillColor: '#ff1f8f',
    fillOpacity: 0.05,
};

// Component to set mapRef after map is ready
const MapRefSetter: React.FC<{ mapRef: React.MutableRefObject<LeafletMap | null> }> = ({ mapRef }) => {
    const map = useMap();
    useEffect(() => {
        mapRef.current = map;
    }, [map, mapRef]);
    return null;
};

interface PopupAddPropertyRowProps {
    onAdd: (key: string, value: string) => void;
    onPendingChange?: (pending: boolean) => void;
}

const PopupAddPropertyRow: React.FC<PopupAddPropertyRowProps> = ({ onAdd, onPendingChange }) => {
    const [k, setK] = useState('');
    const [v, setV] = useState('');

    useEffect(() => {
        onPendingChange?.(Boolean(k.trim() || v.trim()));
    }, [k, v, onPendingChange]);

    const handleAdd = () => {
        const key = k.trim();
        const value = v.trim();
        if (!key || !value) return;
        onAdd(key, value);
        setK('');
        setV('');
    };

    return (
        <div className="space-y-2" onMouseDown={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-2 gap-2 items-center">
                <input
                    className="border rounded px-2 py-1 text-sm"
                    placeholder="Nama properti"
                    value={k}
                    onChange={(e) => setK(e.target.value)}
                />
                <input
                    className="border rounded px-2 py-1 text-sm"
                    placeholder="Nilai"
                    value={v}
                    onChange={(e) => setV(e.target.value)}
                />
            </div>
            <div className="flex justify-end">
                <button
                    type="button"
                    className="rounded bg-green-600 text-white px-3 py-1 text-xs font-semibold disabled:bg-green-300"
                    disabled={!k.trim() || !v.trim()}
                    onClick={handleAdd}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    Tambah
                </button>
            </div>
        </div>
    );
};

const MapView: React.FC<MapViewProps> = ({
    geojsonData,
    initialVisibleIds = [],
    fetchGeojsonBatch,
    readOnly = false,
    showLayerControls = false,
    filterSearch = '',
    onFilterSearch,
    filterPagination,
    onFilterPageChange,
    filterPerPageOptions,
    onFilterPerPageChange,
    isMetaLoading = false,
    mainCategoryOptions,
    activeMainCategory = null,
    categoryLoadState,
    onCategoryLoad,
}) => {
    const center: [number, number] = [1.0, 104.521117];
    const zoom = 11;
    const mapRef = useRef<LeafletMap | null>(null);
    // Untuk simpan ref tiap fitur
    const geoJsonRefs = useRef<Record<string, L.GeoJSON>>({});
    const layerDefaultColors = useRef<Record<string, string>>({});

    // State for inline editing in Popup
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<Record<string, any>>({});
    const [baseValues, setBaseValues] = useState<Record<string, any>>({});
    const [hasPendingNewKV, setHasPendingNewKV] = useState<boolean>(false);
    // Cache perubahan properti per id agar tidak perlu reload
    const [updatedProps, setUpdatedProps] = useState<Record<string, Record<string, any>>>({});
    const featureCacheRef = useRef<Record<string, Feature | null>>({});
    const pendingFeatureIdsRef = useRef<Set<string>>(new Set());
    const isBatchFetchingRef = useRef(false);
    const isMountedRef = useRef(true);
    const [, forceFeatureCacheUpdate] = useState(0);
    const [layerOrder, setLayerOrder] = useState<string[]>([]);
    const [customColors, setCustomColors] = useState<Record<string, string>>(() => readStoredColors());
    const [userLayer, setUserLayer] = useState<FeatureCollection | null>(null);
    const [userLayerSummary, setUserLayerSummary] = useState<{ fileName: string; featureCount: number } | null>(null);
    const userLayerRef = useRef<L.GeoJSON | null>(null);
    const startEdit = (item: (typeof geojsonData)[0]) => {
        setEditingId(String(item.id_geojson));
        const props = { ...(item.geojson?.properties || {}) } as Record<string, any>;
        delete props['id_geojson'];
        // merge dengan perubahan lokal jika ada
        const merged = { ...props, ...(updatedProps[String(item.id_geojson)] || {}) };
        setBaseValues(merged);
        setEditValues(merged);
        setHasPendingNewKV(false);
    };
    const cancelEdit = () => {
        setEditingId(null);
        setEditValues({});
    };
    const saveEdit = async (id: string | number) => {
        try {
            const token = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content;
            const res = await fetch(`/dashboard/geojson/${id}/properties`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'X-CSRF-TOKEN': token } : {}),
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({ properties: editValues }),
            });
            if (!res.ok) throw new Error('Gagal menyimpan properti');
            // Tanpa reload: simpan perubahan ke cache lokal dan tetap buka popup
            setUpdatedProps((prev) => ({ ...prev, [String(id)]: { ...editValues } }));
            setEditingId(null);
        } catch (e) {
            alert((e as Error).message);
        }
    };

    // Data sumber dapat dimodifikasi lokal (misal rename source_name) tanpa reload
    const [sourceData, setSourceData] = useState<typeof geojsonData>(() => (Array.isArray(geojsonData) ? geojsonData : []));
    useEffect(() => {
        setSourceData(Array.isArray(geojsonData) ? geojsonData : []);
    }, [geojsonData]);

    // Sort & Group data
    const sortedData = useMemo(() => {
        return [...sourceData].sort((a, b) => {
            const aOrder = a.kategori?.layer_order ?? 0;
            const bOrder = b.kategori?.layer_order ?? 0;
            return aOrder - bOrder;
        });
    }, [sourceData]);

    const uniqueSourceNames = useMemo(() => {
        const set = new Set<string>();
        sourceData.forEach((item) => set.add(item.source_name));
        return Array.from(set);
    }, [sourceData]);

    const groupedBySourceName = useMemo(() => {
        const groups: Record<string, typeof geojsonData> = {};
        sortedData.forEach((item) => {
            const key = item.source_name || 'Unknown';
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return groups;
    }, [sortedData]);

    // Helper to normalize displayed main category
    const getDisplayMainCategory = useCallback(
        (mainCategory?: string | null) => {
            const trimmed = (mainCategory ?? '').trim();
            return trimmed !== '' ? trimmed : 'Uncategorized';
        },
        []
    );

    // Grouped children per main category: Main category > parent > child
    const groupedByCategory = useMemo(() => {
        const groups: Record<string, Record<string, Array<{ id: string; label: string }>>> = {};

        // Define the order of main categories
        const mainCategoryOrder = (() => {
            if (mainCategoryOptions && mainCategoryOptions.length > 0) {
                const normalized = Array.from(
                    new Set(mainCategoryOptions.map((item) => getDisplayMainCategory(item)).filter(Boolean))
                );
                if (!normalized.includes('Uncategorized')) {
                    normalized.push('Uncategorized');
                }
                return normalized;
            }
            return ['KKPR', 'GANTI RUGI', 'RTRW', 'RDTR', 'Uncategorized'];
        })();

        sourceData.forEach((item) => {
            const mainCategory = getDisplayMainCategory(item.main_category);
            const parent = item.source_name || 'Unknown';

            // Level 3: Individual GeoJSON items - use helper for performance
            const label = buildPropertiesPreview(item.geojson.properties) || String(item.id_geojson || 'Unknown');
            const id = String(item.id_geojson || label);

            // Build hierarchy
            if (!groups[mainCategory]) groups[mainCategory] = {};
            if (!groups[mainCategory][parent]) groups[mainCategory][parent] = [];
            if (!groups[mainCategory][parent].find((c) => c.id === id)) {
                groups[mainCategory][parent].push({ id, label });
            }
        });

        // Sort groups by predefined main category order
        const sortedGroups: typeof groups = {};
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const aIndex = mainCategoryOrder.indexOf(a);
            const bIndex = mainCategoryOrder.indexOf(b);
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return a.localeCompare(b);
        });

        sortedKeys.forEach(key => {
            sortedGroups[key] = groups[key];
        });

        return sortedGroups;
    }, [sourceData, getDisplayMainCategory, mainCategoryOptions]);

    // Create category to unique code mapping for better performance
    const categoryToCodes = useMemo(() => {
        const mapping: Record<string, string> = {};
        sourceData.forEach((item) => {
            const mainCategory = getDisplayMainCategory(item.main_category);
            const uniqueCode = item.kategori?.kode;
            if (!mapping[mainCategory]) {
                mapping[mainCategory] = uniqueCode || 'N/A';
            }
        });
        return mapping;
    }, [sourceData, getDisplayMainCategory]);

    // Create category colors mapping (still needed for visual indicators)
    const categoryColors = useMemo(() => {
        const colors: Record<string, string> = {};
        sourceData.forEach((item) => {
            const mainCategory = getDisplayMainCategory(item.main_category);
            if (!colors[mainCategory]) {
                // Use kode_warna from kategori if available, otherwise from item
                colors[mainCategory] = item.kategori?.kode_warna || item.kode_warna || '#3388ff';
            }
        });
        return colors;
    }, [sourceData, getDisplayMainCategory]);

    // Utility functions for using unique codes as differentiators
    const getCategoryByCode = useCallback((code: string): string => {
        return Object.keys(categoryToCodes).find(cat => categoryToCodes[cat] === code) || 'Uncategorized';
    }, [categoryToCodes]);

    const getCodeByCategory = useCallback((categoryName: string): string => {
        return categoryToCodes[categoryName] || 'N/A';
    }, [categoryToCodes]);

    // Get unique category names
    const uniqueCategoryNames = useMemo(() => {
        const dataKeys = Object.keys(groupedByCategory);
        if (!mainCategoryOptions || mainCategoryOptions.length === 0) {
            return dataKeys;
        }
        const ordered = Array.from(
            new Set(mainCategoryOptions.map((item) => getDisplayMainCategory(item)).filter(Boolean))
        );
        const extras = dataKeys.filter((key) => !ordered.includes(key)).sort((a, b) => a.localeCompare(b));
        return [...ordered, ...extras];
    }, [groupedByCategory, getDisplayMainCategory, mainCategoryOptions]);

    const groupedChildren = useMemo(() => {
        const groups: Record<string, Array<{ id: string; label: string }>> = {};
        sourceData.forEach((item) => {
            const parent = item.source_name;
            const label = buildPropertiesPreview(item.geojson.properties) || String(item.id_geojson || 'Unknown');
            const id = String(item.id_geojson || label);

            if (!groups[parent]) groups[parent] = [];
            if (!groups[parent].find((c) => c.id === id)) {
                groups[parent].push({ id, label });
            }
        });
        return groups;
    }, [sourceData]);

    const geojsonLookup = useMemo(() => {
        const map = new Map<string, (typeof sourceData)[0]>();
        sourceData.forEach((item) => {
            map.set(String(item.id_geojson), item);
        });
        return map;
    }, [sourceData]);

    // State
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [polygonDisplayMode, setPolygonDisplayMode] = useState<PolygonDisplayMode>('fill');
    const [fillOpacity, setFillOpacity] = useState<number>(0.5);
    const [outlineHidden, setOutlineHidden] = useState<boolean>(false);
    const toggleSidebar = () => setSidebarOpen((open) => !open);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            pendingFeatureIdsRef.current.clear();
        };
    }, []);

    const processFeatureQueue = useCallback(() => {
        if (!fetchGeojsonBatch || isBatchFetchingRef.current || !isMountedRef.current) return;
        const ids = Array.from(pendingFeatureIdsRef.current).slice(0, FEATURE_BATCH_SIZE);
        if (ids.length === 0) return;
        isBatchFetchingRef.current = true;

        fetchGeojsonBatch(ids)
            .then((features) => {
                if (!isMountedRef.current) return;
                const received = new Set(Object.keys(features || {}));
                ids.forEach((id) => {
                    const key = String(id);
                    pendingFeatureIdsRef.current.delete(key);
                    if (!received.has(key) && featureCacheRef.current[key] === undefined) {
                        featureCacheRef.current[key] = null;
                    }
                });
                Object.entries(features || {}).forEach(([id, feature]) => {
                    if (feature && feature.geometry) {
                        featureCacheRef.current[id] = feature as Feature;
                    } else {
                        featureCacheRef.current[id] = null;
                    }
                });
                forceFeatureCacheUpdate((prev) => prev + 1);
            })
            .catch(() => {
                if (!isMountedRef.current) return;
                ids.forEach((id) => {
                    pendingFeatureIdsRef.current.delete(String(id));
                    featureCacheRef.current[String(id)] = null;
                });
            })
            .finally(() => {
                isBatchFetchingRef.current = false;
                if (!isMountedRef.current) {
                    return;
                }
                if (pendingFeatureIdsRef.current.size > 0) {
                    processFeatureQueue();
                }
            });
    }, [fetchGeojsonBatch]);

    const ensureFeatureForItem = useCallback(
        (item?: (typeof sourceData)[0]) => {
            if (!item || !fetchGeojsonBatch) return;
            const id = String(item.id_geojson);
            if (item.geojson?.geometry || featureCacheRef.current[id] || pendingFeatureIdsRef.current.has(id)) return;
            pendingFeatureIdsRef.current.add(id);
            processFeatureQueue();
        },
        [fetchGeojsonBatch, processFeatureQueue]
    );

    const allowLayerControls = showLayerControls || !readOnly;

    const ensureFeatureById = useCallback(
        (id: string | number) => {
            const item = geojsonLookup.get(String(id));
            ensureFeatureForItem(item);
        },
        [geojsonLookup, ensureFeatureForItem]
    );

    const getFeatureForItem = useCallback(
        (item: (typeof sourceData)[0]) => {
            if (item.geojson?.geometry) {
                return item.geojson as Feature;
            }
            const cached = featureCacheRef.current[String(item.id_geojson)];
            return cached || null;
        },
        []
    );

    // Loading effect when data changes
    useEffect(() => {
        if (geojsonData.length > 0) {
            setIsLoading(true);
            // Simulate processing time for large datasets
            const timer = setTimeout(() => {
                setIsLoading(false);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [geojsonData]);

    // State for three-level hierarchy: category > parent > child
    const [activeCategoryFilters, setActiveCategoryFilters] = useState<Record<string, boolean>>({});
    const [activeParentFilters, setActiveParentFilters] = useState<Record<string, Record<string, boolean>>>({});
    const [activeChildFilters, setActiveChildFilters] = useState<Record<string, Record<string, Record<string, boolean>>>>({});

    const initialFiltersAppliedRef = useRef(false);

    // Auto-initialize filter state for three levels
    useEffect(() => {
        const hasInitial = Array.isArray(initialVisibleIds) && initialVisibleIds.length > 0;

        if (initialFiltersAppliedRef.current && !hasInitial) {
            return;
        }

        const initialSet = new Set(initialVisibleIds.map((v) => String(v)));

        const categoryState: Record<string, boolean> = {};
        for (const category of uniqueCategoryNames) {
            const hasCategoryData = Object.keys(groupedByCategory[category] || {}).length > 0;
            categoryState[category] = hasCategoryData && !hasInitial;
        }

        const parentState: Record<string, Record<string, boolean>> = {};
        const childState: Record<string, Record<string, Record<string, boolean>>> = {};
        const initialOrder: string[] = [];

        for (const [category, parents] of Object.entries(groupedByCategory)) {
            parentState[category] = {};
            childState[category] = {};

            for (const [parent, children] of Object.entries(parents)) {
                parentState[category][parent] = !hasInitial;
                childState[category][parent] = {};

                for (const child of children) {
                    const idStr = String(child.id);
                    const visible = hasInitial ? initialSet.has(idStr) : false;
                    childState[category][parent][child.id] = visible;
                    if (visible) {
                        initialOrder.push(`${category}-${parent}-${child.id}`);
                    }
                }
            }
        }

        setActiveCategoryFilters(categoryState);
        setActiveParentFilters(parentState);
        setActiveChildFilters(childState);
        setLayerOrder(initialOrder);
        initialFiltersAppliedRef.current = true;
    }, [groupedByCategory, uniqueCategoryNames, initialVisibleIds]);

    useEffect(() => {
        const validKeys = new Set<string>();
        Object.entries(groupedByCategory).forEach(([category, parents]) => {
            Object.entries(parents || {}).forEach(([parent, children]) => {
                children.forEach((child) => {
                    validKeys.add(`${category}-${parent}-${child.id}`);
                });
            });
        });
        setLayerOrder((prev) => {
            const next = prev.filter((key) => validKeys.has(key));
            if (next.length === prev.length) return prev;
            return next;
        });
    }, [groupedByCategory]);

    const applyLayerColor = useCallback(
        (key: string, color: string) => {
            const layer = geoJsonRefs.current[key];
            if (layer && typeof layer.setStyle === 'function') {
                layer.setStyle({
                    color,
                    weight: outlineHidden ? 0 : 2,
                    opacity: outlineHidden ? 0 : 0.8,
                    fillColor: color,
                    fillOpacity: polygonDisplayMode === 'fill' ? fillOpacity : 0,
                });
            }
        },
        [polygonDisplayMode, fillOpacity, outlineHidden]
    );

    // Track previous customColors to only update changed layers
    const prevCustomColorsRef = useRef<Record<string, string>>({});
    const currentCustomColorsRef = useRef<Record<string, string>>({});
    const previewColorsRef = useRef<Record<string, string>>({});

    useEffect(() => {
        const prev = prevCustomColorsRef.current;
        const changedKeys = Object.keys(customColors).filter(key => customColors[key] !== prev[key]);
        const removedKeys = Object.keys(prev).filter(key => !(key in customColors));

        // Only update layers that actually changed
        changedKeys.forEach(key => {
            const defaultColor = layerDefaultColors.current[key];
            const color = customColors[key] ?? defaultColor;
            if (color) applyLayerColor(key, color);
        });

        // Reset removed keys to default
        removedKeys.forEach(key => {
            const defaultColor = layerDefaultColors.current[key];
            if (defaultColor) applyLayerColor(key, defaultColor);
        });

        prevCustomColorsRef.current = { ...customColors };
    }, [customColors, applyLayerColor]);

    useEffect(() => {
        currentCustomColorsRef.current = customColors;
    }, [customColors]);

    useEffect(() => {
        Object.keys(geoJsonRefs.current).forEach((key) => {
            const color =
                previewColorsRef.current[key] ??
                currentCustomColorsRef.current[key] ??
                layerDefaultColors.current[key] ??
                '#3388ff';
            applyLayerColor(key, color);
        });
    }, [polygonDisplayMode, fillOpacity, outlineHidden, applyLayerColor]);

    // Debounce persist to avoid too many localStorage writes
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            persistStoredColors(customColors);
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [customColors]);

    const closeLayerPopup = useCallback((key: string) => {
        const layer = geoJsonRefs.current[key];
        layer?.closePopup();
    }, []);

    const moveLayerToFront = useCallback((key: string) => {
        setLayerOrder((prev) => {
            if (!prev.includes(key)) return [...prev, key];
            const filtered = prev.filter((k) => k !== key);
            return [...filtered, key];
        });
    }, []);

    const moveLayerToBack = useCallback((key: string) => {
        setLayerOrder((prev) => {
            if (!prev.includes(key)) return [key, ...prev];
            const filtered = prev.filter((k) => k !== key);
            return [key, ...filtered];
        });
    }, []);

    const moveLayerForward = useCallback((key: string) => {
        setLayerOrder((prev) => {
            const idx = prev.indexOf(key);
            if (idx === -1 || idx === prev.length - 1) return prev;
            const next = [...prev];
            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
            return next;
        });
    }, []);

    const moveLayerBackward = useCallback((key: string) => {
        setLayerOrder((prev) => {
            const idx = prev.indexOf(key);
            if (idx <= 0) return prev;
            const next = [...prev];
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            return next;
        });
    }, []);

    const removeLayerKeys = useCallback((keys: string[]) => {
        if (!keys.length) return;
        const toRemove = new Set(keys);
        setLayerOrder((prev) => prev.filter((key) => !toRemove.has(key)));
    }, []);

    const previewLayerColor = useCallback(
        (key: string, color: string | null) => {
            if (!color || !isHexColor(color)) return;
            previewColorsRef.current[key] = color;
            applyLayerColor(key, color);
        },
        [applyLayerColor]
    );

    const revertPreviewColor = useCallback(
        (key: string) => {
            delete previewColorsRef.current[key];
            const base = customColors[key] ?? layerDefaultColors.current[key] ?? '#3388ff';
            applyLayerColor(key, base);
        },
        [customColors, applyLayerColor]
    );

    const updateLayerColor = useCallback(
        (key: string, color: string | null, fallback?: string) => {
            delete previewColorsRef.current[key];
            setCustomColors((prev) => {
                const next = { ...prev };
                if (color) {
                    next[key] = color;
                } else {
                    delete next[key];
                }
                return next;
            });

            const base = fallback ?? layerDefaultColors.current[key] ?? '#3388ff';
            applyLayerColor(key, color ?? base);
        },
        [applyLayerColor]
    );

    const handleUserLayerUpload = useCallback(
        ({ data, fileName }: { data: FeatureCollection; fileName: string }) => {
            setUserLayer(data);
            setUserLayerSummary({
                fileName,
                featureCount: Array.isArray(data?.features) ? data.features.length : 0,
            });

            if (mapRef.current) {
                try {
                    const tempLayer = L.geoJSON(data as any);
                    const bounds = tempLayer.getBounds();
                    if (bounds.isValid()) {
                        mapRef.current.fitBounds(bounds, { padding: [24, 24] });
                    }
                } catch {
                    /* ignore fit errors */
                }
            }
        },
        []
    );

    const handleUserLayerClear = useCallback(() => {
        setUserLayer(null);
        setUserLayerSummary(null);
        userLayerRef.current = null;
    }, []);

    const handleUserLayerBringToFront = useCallback(() => {
        if (userLayerRef.current && typeof userLayerRef.current.bringToFront === 'function') {
            userLayerRef.current.bringToFront();
        }
    }, []);

    const handleParentRenameStateUpdate = useCallback(
        (oldName: string, newName: string) => {
            if (!oldName || !newName || oldName === newName) return;
            setSourceData((prev) =>
                prev.map((item) => (item.source_name === oldName ? { ...item, source_name: newName } : item))
            );
            setActiveParentFilters((prev) => renameParentKey(prev, oldName, newName));
            setActiveChildFilters((prev) => renameParentKey(prev, oldName, newName));
            setLayerOrder((prev) => {
                const needle = `-${oldName}-`;
                if (!prev.some((key) => key.includes(needle))) return prev;
                return prev.map((key) => (key.includes(needle) ? replaceParentSegmentInKey(key, oldName, newName) : key));
            });
            setCustomColors((prev) => {
                const { changed, next } = renameLayerKeyCollection(prev, oldName, newName);
                return changed ? next : prev;
            });
            const renamedPreview = renameLayerKeyCollection(previewColorsRef.current, oldName, newName);
            if (renamedPreview.changed) {
                previewColorsRef.current = renamedPreview.next;
            }
        },
        [setSourceData, setActiveParentFilters, setActiveChildFilters, setLayerOrder, setCustomColors, previewColorsRef]
    );

    const applyLayerOrder = useCallback(
        (order: string[]) => {
            order.forEach((key) => {
                const layer = geoJsonRefs.current[key];
                if (layer && typeof layer.bringToFront === 'function') {
                    layer.bringToFront();
                }
            });
        },
        []
    );

    // Debounce applyLayerOrder to batch multiple rapid changes
    const debouncedApplyLayerOrder = useMemo(
        () => debounce(applyLayerOrder, 100),
        [applyLayerOrder]
    );

    useEffect(() => {
        if (layerOrder.length > 0) {
            debouncedApplyLayerOrder(layerOrder);
        }
    }, [layerOrder, debouncedApplyLayerOrder]);

    // Category toggle logic: toggle ALL parents and children in category
    const toggleCategoryFilter = (category: string) => {
        if (!groupedByCategory[category] || Object.keys(groupedByCategory[category]).length === 0) {
            return;
        }
        setActiveCategoryFilters((prev) => {
            const newCategoryState = !prev[category];
            const updated = { ...prev, [category]: newCategoryState };
            
            // Also update all parents and children in this category
            setActiveParentFilters((prevParents) => {
                const updatedParents = { ...prevParents };
                if (!updatedParents[category]) updatedParents[category] = {};
                
                for (const parent of Object.keys(groupedByCategory[category] || {})) {
                    updatedParents[category][parent] = newCategoryState;
                }
                
                return updatedParents;
            });
            
            setActiveChildFilters((prevChildren) => {
                const updatedChildren = { ...prevChildren };
                if (!updatedChildren[category]) updatedChildren[category] = {};

                for (const [parent, children] of Object.entries(groupedByCategory[category] || {})) {
                    if (!updatedChildren[category][parent]) updatedChildren[category][parent] = {};
                    for (const child of children) {
                        updatedChildren[category][parent][child.id] = newCategoryState;
                    }
                }

                return updatedChildren;
            });

            if (newCategoryState) {
                Object.entries(groupedByCategory[category] || {}).forEach(([parentKey, children]) => {
                    children.forEach((child) => {
                        const refKey = `${category}-${parentKey}-${child.id}`;
                        moveLayerToFront(refKey);
                    });
                });
            } else {
                const keysToRemove: string[] = [];
                Object.entries(groupedByCategory[category] || {}).forEach(([parentKey, children]) => {
                    children.forEach((child) => {
                        keysToRemove.push(`${category}-${parentKey}-${child.id}`);
                    });
                });
                removeLayerKeys(keysToRemove);
            }

            return updated;
        });
    };

    // Parent toggle logic: toggle ALL children in parent
    const toggleParentFilter = (category: string, parent: string) => {
        setActiveParentFilters((prev) => {
            const currentState = prev[category]?.[parent] || false;
            const newState = !currentState;
            
            const updated = {
                ...prev,
                [category]: {
                    ...prev[category],
                    [parent]: newState,
                },
            };
            
            // Also update all children in this parent to match parent state
            setActiveChildFilters((prevChildren) => {
                const updatedChildren = { ...prevChildren };
                if (!updatedChildren[category]) updatedChildren[category] = {};
                if (!updatedChildren[category][parent]) updatedChildren[category][parent] = {};
                
                for (const child of groupedByCategory[category]?.[parent] || []) {
                    updatedChildren[category][parent][child.id] = newState;
                }
                
                return updatedChildren;
            });
            
            // If parent is being activated, also activate the category
            if (newState) {
                setActiveCategoryFilters((prevCategories) => {
                    const updatedCategories = { ...prevCategories, [category]: true };
                    return updatedCategories;
                });
                const children = groupedByCategory[category]?.[parent] || [];
                children.forEach((child) => {
                    ensureFeatureById(child.id);
                    const refKey = `${category}-${parent}-${child.id}`;
                    moveLayerToFront(refKey);
                });
            } else {
                const keysToRemove = (groupedByCategory[category]?.[parent] || []).map(
                    (child) => `${category}-${parent}-${child.id}`
                );
                removeLayerKeys(keysToRemove);
            }

            return updated;
        });
    };

    // Child toggle logic
    const toggleChildFilter = (category: string, parent: string, childId: string) => {
        setActiveChildFilters((prev) => {
            const currentState = prev[category]?.[parent]?.[childId] || false;
            const newState = !currentState;
            
            const updated = {
                ...prev,
                [category]: {
                    ...prev[category],
                    [parent]: {
                        ...prev[category]?.[parent],
                        [childId]: newState,
                    },
                },
            };
            
            // If child is being activated, also activate parent and category
            if (newState) {
                setActiveParentFilters((prevParents) => {
                    const updatedParents = { 
                        ...prevParents,
                        [category]: {
                            ...prevParents[category],
                            [parent]: true
                        }
                    };
                    return updatedParents;
                });
                
                setActiveCategoryFilters((prevCategories) => {
                    const updatedCategories = { ...prevCategories, [category]: true };
                    return updatedCategories;
                });
                ensureFeatureById(childId);
                const refKey = `${category}-${parent}-${childId}`;
                moveLayerToFront(refKey);
            } else {
                removeLayerKeys([`${category}-${parent}-${childId}`]);
            }

            return updated;
        });
    };

    // Check if category is checked (all parents and children are active)
    const isCategoryChecked = (category: string) => {
        const parents = groupedByCategory[category];
        if (!parents || Object.keys(parents).length === 0) {
            return false;
        }
        
        // Category is checked if it's active AND all its parents and children are active
        const categoryActive = !!activeCategoryFilters[category];
        const allParentsAndChildrenActive = Object.keys(parents).every((parent) => {
            const parentActive = !!activeParentFilters[category]?.[parent];
            const children = parents[parent];
            const allChildrenActive = children.every((child) => !!activeChildFilters[category]?.[parent]?.[child.id]);
            
            return parentActive && allChildrenActive;
        });
        
        const result = categoryActive && allParentsAndChildrenActive;
        return result;
    };

    // Check if parent is checked (parent is active AND all children are active)
    const isParentChecked = (category: string, parent: string) => {
        const children = groupedByCategory[category]?.[parent];
        if (!children || children.length === 0) {
            return false;
        }
        
        // Parent is checked if it's active AND all its children are active
        const parentActive = !!activeParentFilters[category]?.[parent];
        const allChildrenActive = children.every((child) => !!activeChildFilters[category]?.[parent]?.[child.id]);
        
        const result = parentActive && allChildrenActive;
        return result;
    };

    // Show/Hide all
    const handleShowAll = () => {
        const allCategories: { [key: string]: boolean } = {};
        const allParents: { [category: string]: { [parent: string]: boolean } } = {};
        const allChildren: { [category: string]: { [parent: string]: { [childId: string]: boolean } } } = {};
        const newKeys: string[] = [];

        Object.keys(groupedByCategory).forEach(category => {
            allCategories[category] = true;
            allParents[category] = {};
            allChildren[category] = {};

            Object.keys(groupedByCategory[category]).forEach(parent => {
                allParents[category][parent] = true;
                allChildren[category][parent] = {};

                groupedByCategory[category][parent].forEach(child => {
                    allChildren[category][parent][child.id] = true;
                    newKeys.push(`${category}-${parent}-${child.id}`);
                    ensureFeatureById(child.id);
                });
            });
        });

        setActiveCategoryFilters(allCategories);
        setActiveParentFilters(allParents);
        setActiveChildFilters(allChildren);
        if (newKeys.length > 0) {
            setLayerOrder((prev) => {
                const filtered = prev.filter((key) => !newKeys.includes(key));
                return [...filtered, ...newKeys];
            });
        }
    };

    const handleHideAll = () => {
        setActiveCategoryFilters({});
        setActiveParentFilters({});
        setActiveChildFilters({});
        setLayerOrder([]);
    };

    // Overlay visibility per child
    const renderPopupContent = (
        item: (typeof geojsonData)[0],
        meta: { refKey: string; categoryKey: string; parentKey: string; childId: string }
    ) => {
        const { refKey } = meta;
        const layerIndex = layerOrder.indexOf(refKey);
        const layerCount = layerOrder.length;
        const layerExists = layerIndex !== -1;
        const canMoveForward = layerExists && layerIndex < layerCount - 1;
        const canMoveBackward = layerExists && layerIndex > 0;

        const defaultColorRaw =
            layerDefaultColors.current[refKey] ||
            (typeof item.kategori?.kode_warna === 'string' ? item.kategori?.kode_warna : undefined) ||
            (typeof item.kode_warna === 'string' ? item.kode_warna : undefined) ||
            '#3388ff';
        const defaultColor = typeof defaultColorRaw === 'string' ? defaultColorRaw : '#3388ff';
        const pickerDefault = normalizeColorForPicker(defaultColor);
        const currentPickerValue = normalizeColorForPicker(customColors[refKey] ?? defaultColor, pickerDefault);
        const isCustomColor = Boolean(customColors[refKey]);

        const renderLayerControls = () => (
            <div className="mb-3 space-y-2">
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                        type="button"
                        className="rounded bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!canMoveForward}
                        onClick={(e) => {
                            e.stopPropagation();
                            moveLayerForward(refKey);
                            closeLayerPopup(refKey);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Majukan satu posisi"
                    >
                        Majukan
                    </button>
                    <button
                        type="button"
                        className="rounded bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!layerExists || layerCount <= 1}
                        onClick={(e) => {
                            e.stopPropagation();
                            moveLayerToFront(refKey);
                            closeLayerPopup(refKey);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Kirim ke posisi paling depan"
                    >
                        Majukan Semua
                    </button>
                    <button
                        type="button"
                        className="rounded bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!canMoveBackward}
                        onClick={(e) => {
                            e.stopPropagation();
                            moveLayerBackward(refKey);
                            closeLayerPopup(refKey);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Mundurkan satu posisi"
                    >
                        Mundurkan
                    </button>
                    <button
                        type="button"
                        className="rounded bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!layerExists || layerCount <= 1}
                        onClick={(e) => {
                            e.stopPropagation();
                            moveLayerToBack(refKey);
                            closeLayerPopup(refKey);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Kirim ke posisi paling belakang"
                    >
                        Mundurkan Semua
                    </button>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-gray-600">
                    <span className="font-semibold">Warna</span>
                    <input
                        type="color"
                        value={currentPickerValue}
                        className="h-7 w-10 cursor-pointer rounded border border-gray-300 bg-white p-0"
                        onInput={(e) => {
                            e.stopPropagation();
                            const newColor = (e.target as HTMLInputElement).value;
                            previewLayerColor(refKey, newColor);
                        }}
                        onChange={(e) => {
                            e.stopPropagation();
                            const newColor = e.target.value;
                            if (isHexColor(newColor)) {
                                updateLayerColor(refKey, newColor, defaultColor);
                            }
                        }}
                        onBlur={(e) => {
                            e.stopPropagation();
                            revertPreviewColor(refKey);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Pilih warna polygon"
                    />
                    {isCustomColor && (
                        <button
                            type="button"
                            className="rounded bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700"
                            onClick={(e) => {
                                e.stopPropagation();
                                updateLayerColor(refKey, null, defaultColor);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            title="Kembalikan warna default"
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>
        );

        const isEditing = !readOnly && editingId === String(item.id_geojson);
        if (isEditing) {
            const entries = Object.entries(editValues);
            const norm = (o: Record<string, any>) =>
                Object.keys(o || {})
                    .sort()
                    .reduce((acc: Record<string, any>, k: string) => {
                        acc[k] = String(o[k] ?? '');
                        return acc;
                    }, {});
            const hasChanges = JSON.stringify(norm(editValues)) !== JSON.stringify(norm(baseValues));
            // Hanya blokir jika nilai yang DIUBAH menjadi kosong, bukan yang memang kosong sejak awal
            const hasEmpty = Object.entries(editValues).some(([key, v]) => {
                const now = String(v ?? '').trim();
                const before = String((baseValues as any)[key] ?? '').trim();
                return now === '' && now !== before; // baru dikosongkan
            });
            return (
                <div
                    className="font-sans text-sm w-[420px] max-w-[90vw] min-w-[300px]"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                >
                    {allowLayerControls && renderLayerControls()}
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                        {entries.length === 0 && (
                            <p className="text-gray-500">Tidak ada properti. Tambahkan pasangan kunci-nilai.</p>
                        )}
                        {entries.map(([k, v]: [string, any]) => (
                            <div key={k} className="grid grid-cols-[auto,1fr,auto] gap-2 items-center">
                                <label className="font-semibold mr-2">{k}</label>
                                <input
                                    className="border rounded px-2 py-1 text-sm w-full"
                                    value={String(v ?? '')}
                                    onChange={(e) => setEditValues((prev) => ({ ...prev, [k]: e.target.value }))}
                                    onMouseDown={(e) => e.stopPropagation()}
                                />
                                <button
                                    type="button"
                                    title={`Hapus ${k}`}
                                    className="rounded bg-red-600 text-white px-2 py-1 text-xs hover:bg-red-700"
                                    onClick={() => setEditValues((prev) => { const copy = { ...prev } as Record<string, any>; delete copy[k as string]; return copy; })}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    Hapus
                                </button>
                            </div>
                        ))}
                        <PopupAddPropertyRow
                            onAdd={(key: string, value: string) => setEditValues((p) => ({ ...p, [key]: value }))}
                            onPendingChange={setHasPendingNewKV}
                        />
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                        <button className="rounded bg-gray-200 px-3 py-1" onClick={cancelEdit}>Batal</button>
                        <button
                            className="rounded bg-blue-600 text-white px-3 py-1 disabled:bg-blue-300"
                            onClick={() => saveEdit(item.id_geojson)}
                            disabled={!hasChanges || hasPendingNewKV || hasEmpty}
                            title={!hasChanges ? 'Tidak ada perubahan' : hasPendingNewKV ? 'Klik Tambah dulu' : hasEmpty ? 'Nilai tidak boleh kosong' : ''}
                        >
                            Simpan
                        </button>
                    </div>
                </div>
            );
        }

        // Merge properti asli dengan yang sudah diperbarui (tanpa reload)
        const baseProps = (item.geojson.properties || {}) as Record<string, any>;
        const cachedProps = updatedProps[String(item.id_geojson)];
        const mergedProps = cachedProps ? cachedProps : baseProps;

        return (
            <div
                className="font-sans text-sm w-[420px] max-w-[90vw] min-w-[300px]"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
            >
                {allowLayerControls && renderLayerControls()}
                {(() => {
                    const propEntries = Object.entries(mergedProps).filter(([k]) => k !== 'id_geojson');
                    return (
                        <div className="mt-2 border rounded">
                            <div
                                className="max-h-[200px] overflow-y-auto"
                                onWheel={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <table className="min-w-full text-sm">
                                    <thead className="sticky top-0 bg-gray-50">
                                        <tr>
                                            <th className="border-b px-2 py-1 text-left">Properti</th>
                                            <th className="border-b px-2 py-1 text-left">Nilai</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {propEntries.map(([k, v]) => (
                                            <tr key={k} className="odd:bg-white even:bg-gray-50">
                                                <td className="px-2 py-1 font-semibold whitespace-nowrap">{k}</td>
                                                <td className="px-2 py-1 break-all">{String(v)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })()}
                <div className="mt-2 flex flex-wrap items-center gap-2 justify-end">
                    {!readOnly && (
                        <>
                            <a
                                href={`/dashboard/geojson/${item.id_geojson}/add`}
                                className="inline-flex items-center rounded bg-white px-2 py-1 text-gray-800 hover:bg-gray-100"
                                target="_blank"
                                rel="noreferrer noopener"
                                title="Add PDF"
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <IoAddCircleOutline className="mr-1" />
                                Add PDF
                            </a>
                            <a
                                href={`/dashboard/geojson/${item.id_geojson}/view`}
                                className="inline-flex items-center rounded bg-white px-2 py-1 text-gray-800 hover:bg-gray-100"
                                target="_blank"
                                rel="noreferrer noopener"
                                title="View list PDF"
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <FaFilePdf className="mr-1" />
                                View PDFs
                            </a>
                            <a
                                href={`/dashboard/geojson/${item.id_geojson}/edit`}
                                className="inline-flex items-center rounded bg-white px-2 py-1 text-gray-800 hover:bg-gray-100"
                                target="_blank"
                                rel="noreferrer noopener"
                                title="Edit GeoJSON"
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <FaMapMarkedAlt className="mr-1" />
                                Edit GeoJSON
                            </a>
                            <button
                                type="button"
                                className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 transition-all"
                                title="Edit properties"
                                onClick={() => startEdit(item)}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                Edit Properties
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    };

    // Handler for View (fly to location) - updated for three-level hierarchy
    const handleViewLocation = (category: string, parent: string, childId: string) => {
        const item = geojsonLookup.get(String(childId));

        if (!item || !mapRef.current) return;

        let geometry = item.geojson.geometry as any;
        if (!geometry) {
            const feature = getFeatureForItem(item);
            if (feature?.geometry) {
                geometry = feature.geometry;
            } else if (item.geojson_bbox) {
                const { min_lat, min_lng, max_lat, max_lng } = item.geojson_bbox;
                mapRef.current.fitBounds(
                    [
                        [min_lat, min_lng],
                        [max_lat, max_lng],
                    ],
                    { padding: [24, 24] }
                );
                ensureFeatureForItem(item);
                return;
            } else {
                ensureFeatureForItem(item);
                return;
            }
        }
        // Posisikan peta ke geometri terkait
        if (geometry.type === 'Point') {
            const [lng, lat] = geometry.coordinates as [number, number];
            mapRef.current.flyTo([lat, lng], 15);
        } else if (
            geometry.type === 'Polygon' ||
            geometry.type === 'MultiPolygon' ||
            geometry.type === 'LineString' ||
            geometry.type === 'MultiLineString'
        ) {
            const bounds = L.geoJSON(geometry).getBounds();
            mapRef.current.fitBounds(bounds);
        }

        // Buka popup berdasarkan refKey yang disusun saat render
        const refKey = `${category}-${parent}-${childId}`;
        moveLayerToFront(refKey);
        const geoJsonLayer = geoJsonRefs.current[refKey];
        if (geoJsonLayer) {
            setTimeout(() => {
                geoJsonLayer.openPopup();
            }, 300);
        }
    };
    const handleSearchCoordinate = (x: string, y: string) => {
        // Parsing ke number, pastikan valid
        const lat = Number(y);
        const lng = Number(x);
        if (!isNaN(lat) && !isNaN(lng) && mapRef.current) {
            mapRef.current.flyTo([lat, lng], 16, { duration: 1 });
        }
    };

    return (
        <div className="flex h-screen">
            {/* Konten Peta */}
            <div className={`relative flex-1 transition-all duration-300 ${sidebarOpen ? 'mr-67' : 'mr-0'}`} style={{ zIndex: 10 }}>
                <MapContainer center={center} zoom={zoom} touchZoom scrollWheelZoom style={{ height: '100%', width: '100%' }}>
                    {/* Inilah kunci: ref setter */}
                    <MapRefSetter mapRef={mapRef} />

                    <ScaleControl position="bottomleft" />
                    <ScaleControl position="topright" />

                    {!readOnly && <GeomanControl />}

                    <LayersControl position="topright">
                        <BaseLayers />
                    </LayersControl>

                    {/* Render GeoJSON using flattened 3-level hierarchy */}
                    {groupedBySourceName &&
                        Object.entries(groupedBySourceName).map(([sourceName, items]) => {
                            return items.map((item) => {
                                const mainCategoryKey = getDisplayMainCategory(item.main_category);
                                const parent = item.source_name || 'Unknown';
                                const childId = String(item.id_geojson);

                                // Check visibility with flattened category
                                const isVisible =
                                    activeCategoryFilters[mainCategoryKey] &&
                                    activeParentFilters[mainCategoryKey]?.[parent] &&
                                    activeChildFilters[mainCategoryKey]?.[parent]?.[childId];

                                if (!isVisible) return null;

                                const refKey = `${mainCategoryKey}-${parent}-${childId}`;
                                const baseColor =
                                    (typeof item.kategori?.kode_warna === 'string' ? item.kategori?.kode_warna : undefined) ||
                                    (typeof item.kode_warna === 'string' ? item.kode_warna : undefined) ||
                                    '#3388ff';
                                layerDefaultColors.current[refKey] = baseColor;
                                const effectiveColor = customColors[refKey] ?? baseColor;

                                const feature = getFeatureForItem(item);
                                if (!feature) {
                                    ensureFeatureForItem(item);
                                    return null;
                                }

                                // Memoize style object to prevent unnecessary re-renders
                                const styleObj = {
                                    color: effectiveColor,
                                    weight: outlineHidden ? 0 : 2,
                                    opacity: outlineHidden ? 0 : 0.8,
                                    fillColor: effectiveColor,
                                    fillOpacity: polygonDisplayMode === 'fill' ? fillOpacity : 0,
                                };

                                return (
                                    <GeoJSON
                                        key={`${item.id_geojson}-${sourceName}`}
                                        ref={(ref) => {
                                            if (ref) {
                                                geoJsonRefs.current[refKey] = ref;
                                            } else {
                                                delete geoJsonRefs.current[refKey];
                                                delete layerDefaultColors.current[refKey];
                                            }
                                        }}
                                        data={feature}
                                        style={styleObj}
                                    >
                                        <Popup
                                            closeOnClick={false}
                                            keepInView
                                            maxWidth={520}
                                            minWidth={300}
                                            autoPanPadding={[24, 24] as any}
                                            className="leaflet-custom-popup"
                                        >
                                            {renderPopupContent(item, {
                                                refKey,
                                                categoryKey: mainCategoryKey,
                                                parentKey: parent,
                                                childId,
                                            })}
                                        </Popup>
                                    </GeoJSON>
                                );
                            });
                        })}
                    {userLayer && (
                        <GeoJSON
                            data={userLayer as any}
                            key="user-uploaded-layer"
                            style={USER_LAYER_STYLE}
                            ref={(ref) => {
                                if (ref) {
                                    userLayerRef.current = ref;
                                } else {
                                    userLayerRef.current = null;
                                }
                            }}
                        >
                            <Popup maxWidth={320}>
                                <div className="text-sm">
                                    <p className="font-semibold text-pink-600">Lapisan Unggahan</p>
                                    {userLayerSummary ? (
                                        <>
                                            <p className="text-gray-700">
                                                <strong>Berkas:</strong> {userLayerSummary.fileName}
                                            </p>
                                            <p className="text-gray-700">
                                                <strong>Fitur:</strong> {userLayerSummary.featureCount}
                                            </p>
                                        </>
                                    ) : (
                                        <p>Lapisan unggahan sementara ditampilkan.</p>
                                    )}
                                    <p className="mt-2 text-xs text-gray-500">
                                        Data ini hanya terlihat oleh Anda dan tidak tersimpan permanen di server.
                                    </p>
                                </div>
                            </Popup>
                        </GeoJSON>
                    )}
                </MapContainer>
            </div>

            <SidebarFilter
                sidebarOpen={sidebarOpen}
                toggleSidebar={toggleSidebar}
                uniqueCategoryNames={uniqueCategoryNames}
                groupedByCategory={groupedByCategory}
                categoryColors={categoryColors}
                categoryCodes={categoryToCodes}
                isLoading={isLoading}
                activeMainCategory={activeMainCategory}
                categoryLoadState={categoryLoadState}
                onCategoryLoad={onCategoryLoad}
                activeCategoryFilters={activeCategoryFilters}
                activeParentFilters={activeParentFilters}
                activeChildFilters={activeChildFilters}
                toggleCategoryFilter={toggleCategoryFilter}
                toggleParentFilter={toggleParentFilter}
                toggleChildFilter={toggleChildFilter}
                onShowAll={handleShowAll}
                onHideAll={handleHideAll}
                onView={handleViewLocation}
                isCategoryChecked={isCategoryChecked}
                isParentChecked={isParentChecked}
                onSearchCoordinate={handleSearchCoordinate}
                polygonDisplayMode={polygonDisplayMode}
                onDisplayModeChange={(mode) => setPolygonDisplayMode(mode)}
                fillOpacity={fillOpacity}
                outlineHidden={outlineHidden}
                onFillOpacityChange={(v) => setFillOpacity(v)}
                onOutlineHiddenChange={(h) => setOutlineHidden(h)}
                onParentRename={handleParentRenameStateUpdate}
                onUserLayerUpload={handleUserLayerUpload}
                onUserLayerClear={handleUserLayerClear}
                userLayerSummary={userLayerSummary}
                onUserLayerBringToFront={handleUserLayerBringToFront}
                readOnly={readOnly}
                searchTerm={filterSearch}
                onSearchChange={onFilterSearch}
                pagination={filterPagination}
                onPageChange={onFilterPageChange}
                paginationPerPageOptions={filterPerPageOptions}
                onPerPageChange={onFilterPerPageChange}
                isPaginationLoading={isMetaLoading}
            />
        </div>
    );
};

export default MapView;
