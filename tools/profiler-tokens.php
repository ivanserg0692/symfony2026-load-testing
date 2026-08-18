<?php

declare(strict_types=1);

function usage(): void
{
    fwrite(STDERR, <<<'TEXT'
Usage:
  php profiler-tokens.php [--url=<url>] [--method=GET] [--from=<datetime>] [--to=<datetime>] [--status=200] [--type=request] [--format=list|php]

Examples:
  php profiler-tokens.php --from=2026-08-17T09:25:20Z --to=2026-08-17T09:25:55Z
  php profiler-tokens.php --url=http://host.docker.internal/api/catalog/sections --from=2026-08-17T09:25:20Z --to=2026-08-17T09:25:55Z
  php profiler-tokens.php --url=http://host.docker.internal/api/catalog/sections --format=php

TEXT);
}

function option(string $name, ?string $default = null): ?string
{
    foreach ($_SERVER['argv'] as $argument) {
        if ($argument === "--{$name}") {
            return '1';
        }

        if (str_starts_with($argument, "--{$name}=")) {
            return substr($argument, strlen($name) + 3);
        }
    }

    return $default;
}

function timestamp(?string $value, string $name): ?int
{
    if ($value === null || $value === '') {
        return null;
    }

    $timestamp = strtotime($value);
    if ($timestamp === false) {
        fwrite(STDERR, "Invalid --{$name} datetime: {$value}\n");
        exit(2);
    }

    return $timestamp;
}

if (option('help') !== null || option('h') !== null) {
    usage();
    exit(0);
}

$indexPath = option('index', 'var/cache/dev/profiler/index.csv');
$url = option('url');
$method = strtoupper((string) option('method', 'GET'));
$statusFilter = option('status');
$type = option('type', 'request');
$format = option('format', 'list');
$from = timestamp(option('from'), 'from');
$to = timestamp(option('to'), 'to');

if (!in_array($format, ['list', 'php'], true)) {
    fwrite(STDERR, "Invalid --format value. Expected list or php.\n");
    exit(2);
}

if (!is_file($indexPath)) {
    fwrite(STDERR, "Profiler index not found: {$indexPath}\n");
    exit(1);
}

$handle = fopen($indexPath, 'rb');
if ($handle === false) {
    fwrite(STDERR, "Cannot open profiler index: {$indexPath}\n");
    exit(1);
}

$tokens = [];

while (($row = fgetcsv($handle, 0, ',', '"', '\\')) !== false) {
    if (count($row) < 9) {
        continue;
    }

    [$token, , $rowMethod, $rowUrl, $rowTimestamp, , $rowStatus, $rowType] = $row;
    $rowTimestamp = (int) $rowTimestamp;

    if ($rowMethod !== $method) {
        continue;
    }

    if ($url !== null && $url !== '' && $rowUrl !== $url) {
        continue;
    }

    if ($type !== '' && $rowType !== $type) {
        continue;
    }

    if ($statusFilter !== null && $rowStatus !== $statusFilter) {
        continue;
    }

    if ($from !== null && $rowTimestamp < $from) {
        continue;
    }

    if ($to !== null && $rowTimestamp > $to) {
        continue;
    }

    $tokens[] = $token;
}

fclose($handle);

if ($format === 'php') {
    echo '$tokens = [', PHP_EOL;
    foreach ($tokens as $token) {
        echo '    "', $token, '",', PHP_EOL;
    }
    echo '];', PHP_EOL;

    exit(0);
}

foreach ($tokens as $token) {
    echo $token, PHP_EOL;
}

