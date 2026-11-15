<?php
declare(strict_types=1);

function env(string $key, ?string $default = null): ?string { return $_ENV[$key] ?? getenv($key) ?: $default; }
function config(string $key, mixed $default = null): mixed { $value=$GLOBALS['config']; foreach(explode('.',$key) as $segment){if(!is_array($value)||!array_key_exists($segment,$value))return $default;$value=$value[$segment];} return $value; }
function e(mixed $value): string { return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function url(string $path = ''): string { return rtrim((string) config('app.url'), '/') . '/' . ltrim($path, '/'); }
function asset(string $path): string { return url('assets/' . ltrim($path, '/')); }
function destination_url(string $path = ''): string { return preg_match('#^https?://#i',$path)?$path:url($path); }
function redirect(string $path): never { header('Location: ' . url($path), true, 303); exit; }
function old(string $key, string $default = ''): string { return e($_SESSION['_old'][$key] ?? $default); }
function flash(string $type, string $message): void { $_SESSION['_flash'][] = compact('type', 'message'); }
function csrf_field(): string { return '<input type="hidden" name="_token" value="' . e(\App\Core\Csrf::token()) . '">'; }
function method_field(string $method): string { return '<input type="hidden" name="_method" value="' . e(strtoupper($method)) . '">'; }
function auth(): ?array { return \App\Core\Auth::user(); }
function can(string $permission): bool { return \App\Core\Auth::can($permission); }
function selected(mixed $actual, mixed $expected): string { return (string) $actual === (string) $expected ? ' selected' : ''; }
function submission_token_field(): string { $token=bin2hex(random_bytes(24));$_SESSION['_submission_tokens'][$token]=time();if(count($_SESSION['_submission_tokens'])>30)$_SESSION['_submission_tokens']=array_slice($_SESSION['_submission_tokens'],-30,null,true);return '<input type="hidden" name="submission_token" value="'.e($token).'">'; }
function consume_submission_token(?string $token): bool { if(!$token||empty($_SESSION['_submission_tokens'][$token]))return false;unset($_SESSION['_submission_tokens'][$token]);return true; }
