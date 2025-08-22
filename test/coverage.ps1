# Coverage test script for Go bot service (PowerShell version)
# This script runs all tests and generates coverage reports

param(
    [int]$Threshold = 60,
    [string]$OutputDir = "test/reports"
)

# Configuration
$CoverageFile = "coverage.out"
$CoverageHtml = "coverage.html"
$CoverageSummary = "$OutputDir/coverage_summary.txt"

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"

Write-Host "Starting test coverage analysis..." -ForegroundColor $Green

# Clean previous coverage files
if (Test-Path $CoverageFile) { Remove-Item $CoverageFile }
if (Test-Path $CoverageHtml) { Remove-Item $CoverageHtml }
if (Test-Path $CoverageSummary) { Remove-Item $CoverageSummary }

# Create test directories if they don't exist
if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Run tests with coverage for all packages
Write-Host "Running tests with coverage..." -ForegroundColor $Yellow
try {
    $testResult = go test -v -race -coverprofile=$CoverageFile -covermode=atomic ./...
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Tests failed!" -ForegroundColor $Red
        exit $LASTEXITCODE
    }
} catch {
    Write-Host "Error running tests: $_" -ForegroundColor $Red
    exit 1
}

# Check if coverage file was generated
if (!(Test-Path $CoverageFile)) {
    Write-Host "Error: Coverage file not generated" -ForegroundColor $Red
    exit 1
}

# Generate HTML coverage report
Write-Host "Generating HTML coverage report..." -ForegroundColor $Yellow
try {
    go tool cover -html=$CoverageFile -o $CoverageHtml
} catch {
    Write-Host "Error generating HTML report: $_" -ForegroundColor $Red
}

# Generate coverage summary
Write-Host "Generating coverage summary..." -ForegroundColor $Yellow
try {
    $coverageSummaryOutput = go tool cover -func=$CoverageFile
    $coverageSummaryOutput | Out-File -FilePath $CoverageSummary -Encoding UTF8
} catch {
    Write-Host "Error generating coverage summary: $_" -ForegroundColor $Red
    exit 1
}

# Calculate total coverage percentage
try {
    $totalLine = $coverageSummaryOutput | Where-Object { $_ -match "total:" }
    if ($totalLine) {
        $totalCoverage = [regex]::Match($totalLine, "(\d+\.\d+)%").Groups[1].Value
        $totalCoverageNum = [double]$totalCoverage
    } else {
        Write-Host "Could not parse total coverage" -ForegroundColor $Red
        exit 1
    }
} catch {
    Write-Host "Error calculating coverage: $_" -ForegroundColor $Red
    exit 1
}

# Display results
Write-Host "Coverage Summary:" -ForegroundColor $Green
Write-Host "=========================================="
Get-Content $CoverageSummary
Write-Host "=========================================="
Write-Host "Total Coverage: $totalCoverage%" -ForegroundColor $Green

# Check if coverage meets threshold
if ($totalCoverageNum -ge $Threshold) {
    Write-Host "✅ Coverage threshold met! ($totalCoverage% >= $Threshold%)" -ForegroundColor $Green
    Write-Host "HTML report generated: $CoverageHtml" -ForegroundColor $Green
    
    # Generate coverage badge data
    $badgeData = @{
        "schemaVersion" = 1
        "label" = "coverage"
        "message" = "$totalCoverage%"
        "color" = if ($totalCoverageNum -ge 80) { "brightgreen" } elseif ($totalCoverageNum -ge 60) { "yellow" } else { "red" }
    }
    $badgeData | ConvertTo-Json | Out-File -FilePath "$OutputDir/coverage_badge.json" -Encoding UTF8
    
    exit 0
} else {
    Write-Host "❌ Coverage threshold not met! ($totalCoverage% < $Threshold%)" -ForegroundColor $Red
    Write-Host "Please add more tests to improve coverage." -ForegroundColor $Red
    Write-Host "HTML report generated: $CoverageHtml" -ForegroundColor $Yellow
    
    # Generate coverage badge data for failed threshold
    $badgeData = @{
        "schemaVersion" = 1
        "label" = "coverage"
        "message" = "$totalCoverage%"
        "color" = "red"
    }
    $badgeData | ConvertTo-Json | Out-File -FilePath "$OutputDir/coverage_badge.json" -Encoding UTF8
    
    exit 1
}