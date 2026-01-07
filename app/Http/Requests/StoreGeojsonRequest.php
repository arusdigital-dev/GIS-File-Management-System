<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreGeojsonRequest extends FormRequest
{
    /**
     * Maximum total upload size in bytes (250MB)
     */
    const MAX_TOTAL_SIZE = 250 * 1024 * 1024; // 250MB in bytes

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true; // Authorization handled by middleware
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'geojson'        => 'required_without_all:geojson_file|json',
            'geojson_file'   => 'nullable|array',
            'geojson_file.*' => [
                'file',
                'mimetypes:application/json,application/geo+json,text/plain,application/octet-stream',
            ],
            'id_user'        => 'required|exists:users,id',
            'id_region'      => 'nullable|exists:region,id_region',
            'id_owner'       => 'nullable|exists:owner,id_owner',
            'id_kategori'    => 'nullable|exists:kategori,id_kategori',
            'main_category'  => 'nullable|in:RDTR,RTRW,KKPR,GANTI RUGI',
        ];
    }

    /**
     * Configure the validator instance.
     */
    public function withValidator($validator)
    {
        $validator->after(function ($validator) {
            // Validate total file size if files are uploaded
            if ($this->hasFile('geojson_file')) {
                $files = $this->file('geojson_file');
                $totalSize = 0;

                foreach ($files as $file) {
                    $totalSize += $file->getSize();
                }

                if ($totalSize > self::MAX_TOTAL_SIZE) {
                    $totalSizeMB = round($totalSize / (1024 * 1024), 2);
                    $maxSizeMB = self::MAX_TOTAL_SIZE / (1024 * 1024);

                    $validator->errors()->add(
                        'geojson_file',
                        "Total ukuran file ({$totalSizeMB} MB) melebihi batas maksimal {$maxSizeMB} MB."
                    );
                }
            }
        });
    }

    /**
     * Get custom messages for validator errors.
     */
    public function messages(): array
    {
        return [
            'geojson.required_without_all' => 'GeoJSON data atau file harus diisi.',
            'geojson.json' => 'GeoJSON harus berformat JSON yang valid.',
            'geojson_file.array' => 'File GeoJSON harus berupa array.',
            'geojson_file.*.file' => 'Setiap item harus berupa file.',
            'geojson_file.*.mimetypes' => 'File harus berformat GeoJSON atau JSON.',
            'id_user.required' => 'User harus dipilih.',
            'id_user.exists' => 'User tidak ditemukan.',
            'id_region.exists' => 'Region tidak ditemukan.',
            'id_owner.exists' => 'Owner tidak ditemukan.',
            'id_kategori.exists' => 'Kategori tidak ditemukan.',
            'main_category.in' => 'Kategori utama tidak valid.',
        ];
    }
}
