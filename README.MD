# GIS Report Management System

Sistem manajemen laporan berbasis GIS (Geographic Information System) yang dibangun dengan Laravel dan React menggunakan Inertia.js.

## Dokumentasi

- Manual penggunaan aplikasi: `MANUAL_GUIDE.md`
- Mengaktifkan kembali fitur register: `REGISTER_RESTORE_INSTRUCTIONS.md`
- Upload limit GeoJSON (100MB): `UPLOAD_LIMIT_GUIDE.md`
- Konverter ArcGIS `.style` (simbolisasi): `ARCGIS_STYLE_CONVERSION.md` dan `scripts/README.md`

cp docker/env.example docker/.env then edit secrets (POSTGRES_* passwords, APP_KEY blank for now, APP_URL/APP_PORT).
docker compose build.
docker compose up -d.
docker compose exec app php artisan key:generate --ansi then docker compose exec app php artisan migrate --force and php artisan storage:link.
If using the bundled dump: seed.dump" after placing the dump inside the container or binding it.

## Fitur Utama

- ✅ CRUD Owner
- ✅ Upload dan manajemen file GeoJSON
- ✅ Dashboard dengan filter yang smooth
- ✅ View list PDF
- ✅ Add PDF dengan preview map
- ✅ Bulk edit GeoJSON list
- ✅ Filter detail untuk Sifat, Region, dan Kategori
- ✅ Map preview dengan auto-centering pada polygon

## Persyaratan Sistem

- PHP >= 8.1
- Composer
- Node.js >= 16
- NPM atau Yarn
- MySQL/PostgreSQL

## Instalasi

### 1. Clone Repository

```bash
git clone <repository-url>
cd gis
```

### 2. Install Dependencies

```bash
# Install PHP dependencies
composer install

# Install Node.js dependencies
npm install
```

### 3. Environment Setup

```bash
# Copy environment file
cp .env.example .env

# Generate application key
php artisan key:generate
```

### 4. Database Configuration

Edit file `.env` dan sesuaikan konfigurasi database:

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=gis_database
DB_USERNAME=your_username
DB_PASSWORD=your_password
```

## Database Migration & Seeding

### Migration Commands

#### Menjalankan Migration

```bash
# Jalankan semua migration
php artisan migrate

# Jalankan migration dengan seeding
php artisan migrate --seed

# Reset dan jalankan ulang migration
php artisan migrate:refresh

# Reset, migration, dan seeding
php artisan migrate:refresh --seed

# Rollback migration terakhir
php artisan migrate:rollback

# Rollback semua migration
php artisan migrate:reset

# Cek status migration
php artisan migrate:status
```

#### Membuat Migration Baru

```bash
# Membuat migration untuk tabel baru
php artisan make:migration create_table_name

# Membuat migration untuk modifikasi tabel
php artisan make:migration add_column_to_table_name --table=table_name

# Membuat migration dengan model sekaligus
php artisan make:model ModelName -m
```

### Seeder Commands

#### Menjalankan Seeder

```bash
# Jalankan semua seeder
php artisan db:seed

# Jalankan seeder specific
php artisan db:seed --class=RegionSeeder
php artisan db:seed --class=KategoriSeeder
php artisan db:seed --class=OwnerSeeder
php artisan db:seed --class=UserSeeder

# Jalankan seeder dalam mode production
php artisan db:seed --force
```

#### Membuat Seeder Baru

```bash
# Membuat seeder baru
php artisan make:seeder TableNameSeeder
```

### Database Structure

#### Tables Overview

- **users** - User authentication dan management
- **region** - Data wilayah (provinsi, kabupaten, kecamatan, desa)
- **owner** - Data pemilik/pengelola
- **kategori** - Kategori GeoJSON dengan hierarki (orde0-orde4)
- **geojson** - Data GeoJSON dengan relasi ke region, owner, dan kategori
- **report** - Laporan PDF yang terkait dengan GeoJSON

#### Key Relationships

```
User -> Geojson (one to many)
Region -> Geojson (one to many)
Owner -> Geojson (one to many)
Kategori -> Geojson (one to many)
Geojson -> Report (one to many)
```

## Development Commands

### Laravel Artisan Commands

```bash
# Start development server
php artisan serve

# Clear application cache
php artisan cache:clear

# Clear config cache
php artisan config:clear

# Clear route cache
php artisan route:clear

# Clear view cache
php artisan view:clear

# Generate IDE helper files
php artisan ide-helper:generate
php artisan ide-helper:models

# Create controller
php artisan make:controller ControllerName

# Create model with migration
php artisan make:model ModelName -m

# Create request validation
php artisan make:request RequestName

# List all routes
php artisan route:list
```

### Frontend Development

```bash
# Start Vite development server
npm run dev

# Build for production
npm run build

# Build with SSR
npm run build:ssr

# Format code
npm run format

# Check formatting
npm run format:check

# Run linter
npm run lint

# Type checking
npm run types
```

## 📁 Project Structure

```
├── app/
│   ├── Http/Controllers/     # Controllers
│   ├── Models/              # Eloquent models
│   └── Providers/           # Service providers
├── database/
│   ├── migrations/          # Database migrations
│   ├── seeders/            # Database seeders
│   └── factories/          # Model factories
├── resources/
│   ├── js/                 # React components & pages
│   │   ├── components/     # Reusable components
│   │   ├── pages/         # Page components
│   │   └── layouts/       # Layout components
│   └── css/               # Stylesheets
├── routes/
│   ├── web.php            # Web routes
│   ├── api.php            # API routes
│   └── auth.php           # Authentication routes
└── public/                # Public assets
```

## Configuration

### Environment Variables

```env
# Application
APP_NAME="GIS Report System"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000

# Database
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=gis_database
DB_USERNAME=root
DB_PASSWORD=

# File Storage
FILESYSTEM_DISK=local
```

## Usage Examples

### Creating New Migration

```bash
# Example: Add new column to reports table
php artisan make:migration add_status_to_reports_table --table=report

# Example: Create new table
php artisan make:migration create_categories_table
```

### Creating New Seeder

```bash
# Create seeder
php artisan make:seeder CategorySeeder

# Add to DatabaseSeeder.php
$this->call([
    UserSeeder::class,
    RegionSeeder::class,
    OwnerSeeder::class,
    KategoriSeeder::class,
    CategorySeeder::class, // New seeder
]);
```

## Troubleshooting

### Common Issues

1. **Migration Error**: Jika ada error saat migration

   ```bash
   php artisan migrate:rollback
   php artisan migrate
   ```
2. **Seeder Error**: Jika seeder gagal

   ```bash
   php artisan db:seed --class=SpecificSeeder
   ```
3. **Cache Issues**: Clear semua cache

   ```bash
   php artisan optimize:clear
   ```
4. **Permission Issues**: Set permission untuk storage

   ```bash
   chmod -R 775 storage
   chmod -R 775 bootstrap/cache
   ```

## Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## License

This project is licensed under the MIT License.

## Support

Untuk bantuan dan support, silakan buat issue di repository ini atau hubungi tim development.
