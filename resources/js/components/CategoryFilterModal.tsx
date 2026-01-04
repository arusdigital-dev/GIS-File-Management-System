import React, { useMemo } from 'react';

type OrdeKey = 'orde0' | 'orde1' | 'orde2' | 'orde3' | 'orde4';

interface Category {
    orde0: string;
    orde1?: string;
    orde2?: string;
    orde3?: string;
    orde4?: string;
}

interface FilterState {
    orde0: string;
    orde1: string;
    orde2: string;
    orde3: string;
    orde4: string;
}

interface CategoryFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    categories: Category[];
    selectedFilters: FilterState;
    onFilterChange: (filters: FilterState) => void;
}

const CategoryFilterModal: React.FC<CategoryFilterModalProps> = ({ isOpen, onClose, categories, selectedFilters, onFilterChange }) => {
    // 1) Unique list untuk setiap dropdown berdasar selectedFilters
    const orde0Options = useMemo(() => Array.from(new Set(categories.map((c) => c.orde0).filter(Boolean))), [categories]);
    const orde1Options = useMemo(
        () =>
            Array.from(
                new Set(
                    categories
                        .filter((c) => c.orde0 === selectedFilters.orde0)
                        .map((c) => c.orde1)
                        .filter(Boolean),
                ),
            ),
        [categories, selectedFilters.orde0],
    );
    const orde2Options = useMemo(
        () =>
            Array.from(
                new Set(
                    categories
                        .filter((c) => c.orde0 === selectedFilters.orde0 && c.orde1 === selectedFilters.orde1)
                        .map((c) => c.orde2)
                        .filter(Boolean),
                ),
            ),
        [categories, selectedFilters.orde0, selectedFilters.orde1],
    );
    const orde3Options = useMemo(
        () =>
            Array.from(
                new Set(
                    categories
                        .filter(
                            (c) =>
                                c.orde0 === selectedFilters.orde0 &&
                                c.orde1 === selectedFilters.orde1 &&
                                c.orde2 === selectedFilters.orde2,
                        )
                        .map((c) => c.orde3)
                        .filter(Boolean),
                ),
            ),
        [categories, selectedFilters.orde0, selectedFilters.orde1, selectedFilters.orde2],
    );
    const orde4Options = useMemo(
        () =>
            Array.from(
                new Set(
                    categories
                        .filter(
                            (c) =>
                                c.orde0 === selectedFilters.orde0 &&
                                c.orde1 === selectedFilters.orde1 &&
                                c.orde2 === selectedFilters.orde2 &&
                                c.orde3 === selectedFilters.orde3,
                        )
                        .map((c) => c.orde4)
                        .filter(Boolean),
                ),
            ),
        [categories, selectedFilters.orde0, selectedFilters.orde1, selectedFilters.orde2, selectedFilters.orde3],
    );

    if (!isOpen) return null;

    // 2) Handler perubahan dengan reset dropdown di bawahnya
    const handleChange = (orde: OrdeKey, value: string) => {
        const next: FilterState = { ...selectedFilters };
        next[orde] = value;
        if (orde === 'orde0') {
            next.orde1 = '';
            next.orde2 = '';
            next.orde3 = '';
            next.orde4 = '';
        } else if (orde === 'orde1') {
            next.orde2 = '';
            next.orde3 = '';
            next.orde4 = '';
        } else if (orde === 'orde2') {
            next.orde3 = '';
            next.orde4 = '';
        } else if (orde === 'orde3') {
            next.orde4 = '';
        }
        onFilterChange(next);
    };

    return (
        <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black">
            <div className="w-1/3 rounded-lg bg-white p-6">
                <h3 className="mb-4 text-xl font-bold">Filter Kategori</h3>

                {/* Orde0 */}
                <select
                    value={selectedFilters.orde0}
                    onChange={(e) => handleChange('orde0', e.target.value)}
                    className="mb-4 w-full rounded border px-3 py-2"
                >
                    <option value="">Pilih Orde 0</option>
                    {orde0Options.map((o) => (
                        <option key={o} value={o}>
                            {o}
                        </option>
                    ))}
                </select>

                {/* Orde1 */}
                {selectedFilters.orde0 && (
                    <select
                        value={selectedFilters.orde1}
                        onChange={(e) => handleChange('orde1', e.target.value)}
                        className="mb-4 w-full rounded border px-3 py-2"
                    >
                        <option value="">Pilih Orde 1</option>
                        {orde1Options.map((o) => (
                            <option key={o} value={o}>
                                {o}
                            </option>
                        ))}
                    </select>
                )}

                {/* Orde2 */}
                {selectedFilters.orde1 && (
                    <select
                        value={selectedFilters.orde2}
                        onChange={(e) => handleChange('orde2', e.target.value)}
                        className="mb-4 w-full rounded border px-3 py-2"
                    >
                        <option value="">Pilih Orde 2</option>
                        {orde2Options.map((o) => (
                            <option key={o} value={o}>
                                {o}
                            </option>
                        ))}
                    </select>
                )}

                {/* Orde3 */}
                {selectedFilters.orde2 && (
                    <select
                        value={selectedFilters.orde3}
                        onChange={(e) => handleChange('orde3', e.target.value)}
                        className="mb-4 w-full rounded border px-3 py-2"
                    >
                        <option value="">Pilih Orde 3</option>
                        {orde3Options.map((o) => (
                            <option key={o} value={o}>
                                {o}
                            </option>
                        ))}
                    </select>
                )}

                {/* Orde4 */}
                {selectedFilters.orde3 && (
                    <select
                        value={selectedFilters.orde4}
                        onChange={(e) => handleChange('orde4', e.target.value)}
                        className="mb-4 w-full rounded border px-3 py-2"
                    >
                        <option value="">Pilih Orde 4</option>
                        {orde4Options.map((o) => (
                            <option key={o} value={o}>
                                {o}
                            </option>
                        ))}
                    </select>
                )}

                <div className="flex justify-end">
                    <button onClick={onClose} className="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CategoryFilterModal;
