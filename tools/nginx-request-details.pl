#!/usr/bin/env perl

use strict;
use warnings;
use Getopt::Long qw(GetOptions);

sub usage {
    my ($exit_code) = @_;

    print STDERR <<'TEXT';
Usage:
  docker compose logs api-gateway | perl nginx-request-details.pl --path=PATH [options]

Options:
  --path=PATH           Required exact request path; query strings are ignored.
  --method=METHOD       Include only this HTTP method (default: GET).
  --sort=FIELD          Sort by request, upstream, time, or status (default: request).
  --ascending           Sort from smallest to largest/oldest to newest.
  --limit=NUMBER        Print at most this many rows after sorting.
  --format=FORMAT       Output table or profiler tokens only (default: table).
  --help                Show this help.

Examples:
  perl nginx-request-details.pl --method=GET --path=/api/v1/catalog/elements --limit=50
  perl nginx-request-details.pl --path=/api/v1/catalog/elements --sort=time --ascending
  perl nginx-request-details.pl --path=/api/v1/catalog/elements --format=tokens
TEXT

    exit $exit_code;
}

sub log_field {
    my ($line, $name) = @_;

    return $line =~ /(?:^|\s)\Q$name\E="([^"]*)"/ ? $1 : undef;
}

sub last_upstream_time_ms {
    my ($value) = @_;

    return undef if !defined $value || $value eq '' || $value eq '-';

    my @values = grep { /^\d+(?:\.\d+)?$/ } split /[,:]\s*/, $value;

    return @values ? $values[-1] * 1000 : undef;
}

my ($path_filter, $ascending, $limit, $help);
my $method_filter = 'GET';
my $sort = 'request';
my $format = 'table';

GetOptions(
    'path=s'     => \$path_filter,
    'method=s'   => \$method_filter,
    'sort=s'     => \$sort,
    'ascending'  => \$ascending,
    'limit=i'    => \$limit,
    'format=s'   => \$format,
    'help|h'     => \$help,
) or usage(2);

usage(0) if $help;

if (!defined $path_filter || $path_filter eq '') {
    print STDERR "Missing required --path option.\n";
    usage(2);
}

$method_filter = uc($method_filter);

my %valid_sort = map { $_ => 1 } qw(request upstream time status);
if (!$valid_sort{$sort}) {
    print STDERR "Invalid --sort value: $sort\n";
    usage(2);
}

if ($format ne 'table' && $format ne 'tokens') {
    print STDERR "Invalid --format value: $format\n";
    usage(2);
}

if (defined $limit && $limit < 1) {
    print STDERR "Invalid --limit value: $limit\n";
    usage(2);
}

my @rows;

while (my $line = <STDIN>) {
    my $request = log_field($line, 'request');

    next if !defined $request || $request !~ /^(\S+)\s+(\S+)\s+HTTP\/\S+$/;

    my ($method, $target) = (uc($1), $2);
    my $request_uri = log_field($line, 'request_uri') // $target;
    my ($path) = split /\?/, $request_uri, 2;

    next if $method ne $method_filter || $path ne $path_filter;

    my $time = log_field($line, 'time');
    my $status = log_field($line, 'status');
    my $request_time = log_field($line, 'request_time');

    next if !defined $time || !defined $request_time || $request_time !~ /^\d+(?:\.\d+)?$/;

    push @rows, {
        time        => $time,
        status      => defined $status && $status ne '' ? $status : '-',
        request     => $request_time * 1000,
        upstream    => last_upstream_time_ms(log_field($line, 'upstream_response_time')),
        token       => log_field($line, 'sent_x_debug_token') || '-',
        uri         => $request_uri,
    };
}

if (!@rows) {
    print STDERR "No matching API Gateway access-log records found.\n";
    exit 0;
}

@rows = sort {
    my $comparison;

    if ($sort eq 'time') {
        $comparison = $a->{time} cmp $b->{time};
    } elsif ($sort eq 'status') {
        $comparison = $a->{status} cmp $b->{status};
    } elsif ($sort eq 'upstream') {
        $comparison = ($a->{upstream} // -1) <=> ($b->{upstream} // -1);
    } else {
        $comparison = $a->{request} <=> $b->{request};
    }

    $ascending ? $comparison : -$comparison;
} @rows;

if (defined $limit && @rows > $limit) {
    $#rows = $limit - 1;
}

if ($format eq 'tokens') {
    print "$$_{token}\n" for grep { $_->{token} ne '-' } @rows;
    exit 0;
}

printf "%-25s %6s %12s %12s %-10s %s\n",
    'TIME_UTC', 'STATUS', 'REQUEST_MS', 'UPSTREAM_MS', 'TOKEN', 'URI';

for my $row (@rows) {
    printf "%-25s %6s %12.1f %12s %-10s %s\n",
        $row->{time},
        $row->{status},
        $row->{request},
        defined $row->{upstream} ? sprintf('%.1f', $row->{upstream}) : '-',
        $row->{token},
        $row->{uri};
}
