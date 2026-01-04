<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\URL;
use App\Models\User;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        Route::middleware('api')
            ->prefix('api')
            ->group(base_path('routes/api.php'));
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (app()->environment('production')) {
            URL::forceScheme('https');
        }

        // Configure model binding to include soft deleted users for restore and force-delete routes
        Route::bind('user', function ($value, $route) {
            if (in_array($route->getName(), ['users.restore', 'users.force-delete'])) {
                return User::withTrashed()->findOrFail($value);
            }
            return User::findOrFail($value);
        });
    }
}
