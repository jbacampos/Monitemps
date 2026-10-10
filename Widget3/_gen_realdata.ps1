# ============================================================
# Gerador de dados REAIS para o harness de teste (nao faz parte
# do widget). Le somente (GET) a API do ThingsBoard atraves do
# dashboard publico e grava _realdata.js.
# ============================================================
$ErrorActionPreference = 'Stop'

# Cultura invariante para que os números usem ponto decimal (JSON/JS).
[System.Threading.Thread]::CurrentThread.CurrentCulture =
    [System.Globalization.CultureInfo]::InvariantCulture

$body = '{"publicId":"09f7f020-a177-11f1-b723-7b68e13f2590"}'
$r = Invoke-WebRequest -Method POST -Uri 'https://datalog.top/api/auth/login/public' `
    -Body $body -ContentType 'application/json' -SkipCertificateCheck -TimeoutSec 30
$tok = ($r.Content | ConvertFrom-Json).token
$h = @{ 'X-Authorization' = "Bearer $tok" }
$id = '63eaff60-b030-11f1-940d-1f4ee055f09a'
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$start = 1789000000000

function Fetch($key) {
    $u = "https://datalog.top/api/plugins/telemetry/DEVICE/$id/values/timeseries?keys=$key&startTs=$start&endTs=$now&limit=60000&orderBy=ASC"
    $j = (Invoke-WebRequest -Uri $u -Headers $h -SkipCertificateCheck -TimeoutSec 180).Content | ConvertFrom-Json
    return $j.$key
}

$ws = Fetch 'wind_speed'
$wg = Fetch 'wind_gust'
$rt = Fetch 'rain_total'
$rd = Fetch 'rain_day'
Write-Host ("contagens: wind_speed=$($ws.Count) wind_gust=$($wg.Count) rain_total=$($rt.Count) rain_day=$($rd.Count)")

function Pairs($arr) {
    return '[' + (($arr | ForEach-Object { '[' + [int64]$_.ts + ',' + $_.value + ']' }) -join ',') + ']'
}

function Peaks($arr, $gap, $n) {
    $list = @()
    foreach ($p in $arr) { $list += [pscustomobject]@{ ts = [int64]$p.ts; value = [double]$p.value } }
    $sorted = $list | Sort-Object -Property @{ Expression = 'value'; Descending = $true }, @{ Expression = 'ts'; Descending = $false }
    $chosen = @()
    foreach ($p in $sorted) {
        if ($chosen.Count -ge $n) { break }
        $ok = $true
        foreach ($c in $chosen) {
            if ([math]::Abs($c.ts - $p.ts) -lt $gap) { $ok = $false; break }
        }
        if ($ok) { $chosen += $p }
    }
    return $chosen
}

$H = 3600000
$wsPk = Peaks $ws (24 * $H) 3
$wgPk = Peaks $wg (24 * $H) 3

$wsVals = ($wsPk | ForEach-Object { [math]::Round($_.value, 2) }) -join ','
$wgVals = ($wgPk | ForEach-Object { [math]::Round($_.value, 2) }) -join ','
Write-Host "wind_speed top3: $wsVals"
Write-Host "wind_gust  top3: $wgVals"

$expect = '{"windSpeed":[' + $wsVals + '],"windGust":[' + $wgVals + ']' +
    ',"daily":{"2026-09-19":11.9,"2026-09-20":1.1,"2026-09-21":42.3,"2026-10-03":31.1}' +
    ',"minResets":1,"minGaps":1}'

$out = "window.__REAL__={generatedAt:$now,rainStart:$start,rainEnd:$now," +
    "wind_speed:" + (Pairs $ws) + ",wind_gust:" + (Pairs $wg) + ",rain_total:" + (Pairs $rt) +
    ",rain_day:" + (Pairs $rd) +
    ",expect:$expect};"

$path = Join-Path $PSScriptRoot '_realdata.js'
Set-Content -Path $path -Value $out -Encoding UTF8
Write-Host ("gravado: " + $path + " (" + (Get-Item $path).Length + " bytes)")
