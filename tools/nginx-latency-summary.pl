#!/usr/bin/env perl

use strict;
use warnings;
use Getopt::Long qw(GetOptions);

sub usage {
    my ($exit_code) = @_;

    print STDERR <<'TEXT';
Usage:
  docker compose logs api-gateway | perl nginx-latency-summary.pl [options]

Options:
  --method=METHOD       Include only this HTTP method.
  --path=PATH           Include only this exact path; query strings are ignored.
  --sort=FIELD          Sort by p95, avg, max, count, or endpoint (default: p95).
  --ascending           Sort from smallest to largest (default: descending).
  --help                Show this help.

Examples:
  perl nginx-latency-summary.pl --sort=p95
  perl nginx-latency-summary.pl --method=GET --path=/api/v1/catalog/elements
TEXT

    exit $exit_code;
}

sub log_field {
    my ($line, $name) = @_;

    return $line =~ /(?:^|\s)\Q$name\E="([^"]*)"/ ? $1 : undef;
}

sub percentile_95 {
    my (@values) = sort { $a <=> $b } @_;
    my $index = int(0.95 * scalar(@values) + 0.999999) - 1;

    return $values[$index < 0 ? 0 : $index];
}

my ($method_filter, $path_filter, $ascending, $help);
my $sort = 'p95';

GetOptions(
    'method=s'  => \$method_filter,
    'path=s'    => \$path_filter,
    'sort=s'    => \$sort,
    'ascending' => \$ascending,
    'help|h'    => \$help,
) or usage(2);

usage(0) if $help;

$method_filter = uc($method_filter) if defined $method_filter;

my %valid_sort = map { $_ => 1 } qw(p95 avg max count endpoint);
if (!$valid_sort{$sort}) {
    print STDERR "Invalid --sort value: $sort\n";
    usage(2);
}

my %durations;

while (my $line = <STDIN>) {
    my $request = log_field($line, 'request');
    my $request_time = log_field($line, 'request_time');

    next if !defined $request || !defined $request_time || $request_time !~ /^\d+(?:\.\d+)?$/;
    next if $request !~ /^(\S+)\s+(\S+)\s+HTTP\/\S+$/;

    my ($method, $target) = (uc($1), $2);
    my $request_uri = log_field($line, 'request_uri') // $target;
    my ($path) = split /\?/, $request_uri, 2;

    next if defined $method_filter && $method ne $method_filter;
    next if defined $path_filter && $path ne $path_filter;

    push @{$durations{"$method $path"}}, $request_time * 1000;
}

my @rows;
for my $endpoint (keys %durations) {
    my @values = @{$durations{$endpoint}};
    my $count = scalar @values;
    my $sum = 0;
    $sum += $_ for @values;

    push @rows, {
        endpoint => $endpoint,
        count    => $count,
        avg      => $sum / $count,
        p95      => percentile_95(@values),
        max      => (sort { $b <=> $a } @values)[0],
    };
}

if (!@rows) {
    print STDERR "No matching API Gateway access-log records found.\n";
    exit 0;
}

@rows = sort {
    my $comparison = $sort eq 'endpoint'
        ? $a->{endpoint} cmp $b->{endpoint}
        : $a->{$sort} <=> $b->{$sort};

    $ascending ? $comparison : -$comparison;
} @rows;

printf "%-7s %12s %12s %12s %s\n", 'COUNT', 'AVG_MS', 'P95_MS', 'MAX_MS', 'ENDPOINT';
for my $row (@rows) {
    printf "%-7d %12.1f %12.1f %12.1f %s\n",
        $row->{count},
        $row->{avg},
        $row->{p95},
        $row->{max},
        $row->{endpoint};
}
