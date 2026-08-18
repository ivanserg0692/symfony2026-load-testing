<?php

declare(strict_types=1);

function usage(): void
{
    fwrite(STDERR, <<<'TEXT'
Usage:
  php profiler-durations.php [--sort=duration|sql|input] [--format=table|csv] [token...]

Tokens can be passed as arguments or through stdin, one token per line.

Examples:
  php profiler-durations.php df42f8 102397
  printf "%s\n" df42f8 102397 | php profiler-durations.php

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

function argumentTokens(): array
{
    $tokens = [];

    foreach (array_slice($_SERVER['argv'], 1) as $argument) {
        if (str_starts_with($argument, '--')) {
            continue;
        }

        foreach (preg_split('/[\s,]+/', $argument, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $token) {
            $tokens[] = trim($token, "\"' \t\n\r\0\x0B");
        }
    }

    return $tokens;
}

function stdinTokens(): array
{
    $input = stream_get_contents(STDIN);
    if ($input === false || trim($input) === '') {
        return [];
    }

    $tokens = [];
    foreach (preg_split('/[\s,]+/', $input, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $token) {
        $tokens[] = trim($token, "\"' \t\n\r\0\x0B");
    }

    return $tokens;
}

function profilerPath(string $token, string $profilerDir): ?string
{
    $directPath = sprintf(
        '%s/%s/%s/%s',
        rtrim($profilerDir, '/'),
        substr($token, 0, 2),
        substr($token, 2, 2),
        $token
    );

    if (is_file($directPath)) {
        return $directPath;
    }

    $matches = glob(rtrim($profilerDir, '/') . '/*/*/' . $token);

    return $matches !== false && $matches !== [] ? $matches[0] : null;
}

function indexRows(string $indexPath): array
{
    if (!is_file($indexPath)) {
        return [];
    }

    $handle = fopen($indexPath, 'rb');
    if ($handle === false) {
        return [];
    }

    $rows = [];
    while (($row = fgetcsv($handle, 0, ',', '"', '\\')) !== false) {
        if (count($row) < 9) {
            continue;
        }

        [$token, $ip, $method, $url, $timestamp, , $status, $type, $error] = $row;
        $rows[$token] = [
            'ip' => $ip,
            'method' => $method,
            'url' => $url,
            'timestamp' => (int) $timestamp,
            'status' => $status,
            'type' => $type,
            'error' => $error,
        ];
    }

    fclose($handle);

    return $rows;
}

function numericValue(mixed $value): ?float
{
    if (is_int($value) || is_float($value)) {
        return (float) $value;
    }

    if (is_string($value) && is_numeric($value)) {
        return (float) $value;
    }

    return null;
}

function secondsToMilliseconds(mixed $value): ?float
{
    $value = numericValue($value);

    return $value === null ? null : $value * 1000;
}

function bootKernel(): ?object
{
    if (!class_exists(App\Kernel::class)) {
        return null;
    }

    if (class_exists(Symfony\Component\Dotenv\Dotenv::class) && is_file('.env')) {
        (new Symfony\Component\Dotenv\Dotenv())->bootEnv('.env');
    }

    $environment = $_SERVER['APP_ENV'] ?? $_ENV['APP_ENV'] ?? 'dev';
    $debug = filter_var($_SERVER['APP_DEBUG'] ?? $_ENV['APP_DEBUG'] ?? ($environment === 'dev'), FILTER_VALIDATE_BOOL);

    $kernel = new App\Kernel($environment, $debug);
    $kernel->boot();

    return $kernel;
}

function profilerStorage(?object $kernel, string $profilerDir): ?object
{
    if ($kernel !== null) {
        $container = $kernel->getContainer();
        if ($container->has('profiler.storage')) {
            return $container->get('profiler.storage');
        }
    }

    if (class_exists(Symfony\Component\HttpKernel\Profiler\FileProfilerStorage::class)) {
        return new Symfony\Component\HttpKernel\Profiler\FileProfilerStorage('file:' . $profilerDir);
    }

    return null;
}

function readProfile(?object $storage, string $token): ?object
{
    if ($storage === null || !method_exists($storage, 'read')) {
        return null;
    }

    $profile = $storage->read($token);

    return is_object($profile) ? $profile : null;
}

function profileCollector(object $profile, string $name): ?object
{
    if (!method_exists($profile, 'hasCollector') || !method_exists($profile, 'getCollector')) {
        return null;
    }

    if (!$profile->hasCollector($name)) {
        return null;
    }

    $collector = $profile->getCollector($name);

    return is_object($collector) ? $collector : null;
}

function profileDurationMs(?object $profile): ?float
{
    if ($profile === null) {
        return null;
    }

    $timeCollector = profileCollector($profile, 'time');
    if ($timeCollector !== null && method_exists($timeCollector, 'getDuration')) {
        return numericValue($timeCollector->getDuration());
    }

    return method_exists($profile, 'getDuration') ? numericValue($profile->getDuration()) : null;
}

function profileSqlDurationMs(?object $profile): ?float
{
    if ($profile === null) {
        return null;
    }

    foreach (['db', 'doctrine', 'doctrine_dbal'] as $collectorName) {
        $collector = profileCollector($profile, $collectorName);
        if ($collector === null || !method_exists($collector, 'getTime')) {
            continue;
        }

        return secondsToMilliseconds($collector->getTime());
    }

    return null;
}

if (option('help') !== null || option('h') !== null) {
    usage();
    exit(0);
}

$profilerDir = option('profiler-dir', 'var/cache/dev/profiler');
$indexPath = option('index', $profilerDir . '/index.csv');
$sort = option('sort', 'duration');
$format = option('format', 'table');

if (!in_array($sort, ['duration', 'sql', 'input'], true)) {
    fwrite(STDERR, "Invalid --sort value. Expected duration, sql or input.\n");
    exit(2);
}

if (!in_array($format, ['table', 'csv'], true)) {
    fwrite(STDERR, "Invalid --format value. Expected table or csv.\n");
    exit(2);
}

$autoload = 'vendor/autoload.php';
if (is_file($autoload)) {
    require $autoload;
}

$tokens = argumentTokens();
if ($tokens === []) {
    $tokens = stdinTokens();
}

$tokens = array_values(array_unique(array_filter($tokens)));
if ($tokens === []) {
    usage();
    fwrite(STDERR, "No profiler tokens provided.\n");
    exit(2);
}

$index = indexRows($indexPath);
$kernel = bootKernel();
$storage = profilerStorage($kernel, $profilerDir);
$rows = [];

foreach ($tokens as $position => $token) {
    $path = profilerPath($token, $profilerDir);
    if ($path === null) {
        $rows[] = [
            'position' => $position,
            'token' => $token,
            'duration' => null,
            'sqlDuration' => null,
            'method' => $index[$token]['method'] ?? '?',
            'status' => $index[$token]['status'] ?? '?',
            'url' => $index[$token]['url'] ?? '?',
            'path' => 'missing',
        ];
        continue;
    }

    $profile = readProfile($storage, $token);
    $duration = profileDurationMs($profile);
    $sqlDuration = profileSqlDurationMs($profile);

    $rows[] = [
        'position' => $position,
        'token' => $token,
        'duration' => $duration,
        'sqlDuration' => $sqlDuration,
        'method' => $index[$token]['method'] ?? '?',
        'status' => $index[$token]['status'] ?? '?',
        'url' => $index[$token]['url'] ?? '?',
        'path' => $path,
    ];
}

if ($sort === 'duration') {
    usort($rows, static function (array $left, array $right): int {
        return ($right['duration'] ?? -1.0) <=> ($left['duration'] ?? -1.0);
    });
} elseif ($sort === 'sql') {
    usort($rows, static function (array $left, array $right): int {
        return ($right['sqlDuration'] ?? -1.0) <=> ($left['sqlDuration'] ?? -1.0);
    });
}

if ($format === 'csv') {
    $output = fopen('php://output', 'wb');
    fputcsv($output, ['token', 'duration_ms', 'sql_ms', 'method', 'status', 'url', 'path']);
    foreach ($rows as $row) {
        fputcsv($output, [
            $row['token'],
            $row['duration'] === null ? '' : round($row['duration'], 1),
            $row['sqlDuration'] === null ? '' : round($row['sqlDuration'], 1),
            $row['method'],
            $row['status'],
            $row['url'],
            $row['path'],
        ]);
    }

    exit(0);
}

printf("%-8s %12s %10s %-6s %-6s %s\n", 'token', 'duration_ms', 'sql_ms', 'method', 'status', 'url');
foreach ($rows as $row) {
    printf(
        "%-8s %12s %10s %-6s %-6s %s\n",
        $row['token'],
        $row['duration'] === null ? 'missing' : number_format($row['duration'], 1, '.', ''),
        $row['sqlDuration'] === null ? 'n/a' : number_format($row['sqlDuration'], 1, '.', ''),
        $row['method'],
        $row['status'],
        $row['url']
    );
}

