<?php
declare(strict_types=1);
namespace App\Core;

use PDO;

final class Database
{
    private static ?PDO $pdo = null;
    public static function connection(): PDO
    {
        if (!self::$pdo) {
            $db = config('database');
            self::$pdo = new PDO($db['dsn'], $db['username'], $db['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            if (self::$pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
                self::$pdo->exec('PRAGMA foreign_keys = ON');
            }
        }
        return self::$pdo;
    }
    public static function all(string $sql, array $params = []): array { $s=self::connection()->prepare($sql); $s->execute($params); return $s->fetchAll(); }
    public static function one(string $sql, array $params = []): ?array { $s=self::connection()->prepare($sql); $s->execute($params); return $s->fetch() ?: null; }
    public static function run(string $sql, array $params = []): bool { $s=self::connection()->prepare($sql); return $s->execute($params); }
    public static function id(): int { return (int) self::connection()->lastInsertId(); }
}
