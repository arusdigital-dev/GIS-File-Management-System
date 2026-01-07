# syntax=docker/dockerfile:1

FROM php:8.3-fpm-alpine AS base

# System dependencies & PHP extensions
RUN apk add --no-cache \
    bash git unzip icu-dev libzip-dev oniguruma-dev postgresql-dev libpng-dev \
    && docker-php-ext-install intl pdo_pgsql pdo_mysql bcmath zip

WORKDIR /var/www/html

# Install PHP vendors using PHP 8.3 runtime
FROM base AS vendor
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY composer.json composer.lock artisan bootstrap/ config/ routes/ app/ ./
ENV COMPOSER_ALLOW_SUPERUSER=1 COMPOSER_DISABLE_XDEBUG_WARN=1
RUN composer config platform.php 8.3.0 \
    && composer install --no-dev --prefer-dist --no-progress --no-interaction --optimize-autoloader --no-scripts

# Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY resources resources
COPY public public
COPY tsconfig.json vite.config.ts components.json ./
RUN npm run build

# Final PHP-FPM image
FROM base AS app
WORKDIR /var/www/html
COPY . .
COPY docker/uploads.ini /usr/local/etc/php/conf.d/uploads.ini
COPY --from=vendor /var/www/html/vendor ./vendor
COPY --from=frontend /app/public/build ./public/build

RUN mkdir -p storage/logs storage/framework/{cache,data,sessions,views} bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

CMD ["php-fpm"]

# Nginx image with built assets
FROM nginx:1.27-alpine AS nginx
WORKDIR /var/www/html
COPY --from=app /var/www/html /var/www/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
