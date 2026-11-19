<#
Implementation details:
Automated environment setup script for Windows.
This script checks for existing FFmpeg installations in the PATH environment variable.
If FFmpeg is absent, the script downloads the latest release essentials ZIP archive from gyan.dev,
extracts the archive to the Local AppData directory, and appends the bin directory
to the persistent User PATH environment variable and the current session PATH variable.
Additionally, the script provisions an isolated Python virtual environment (.venv) if not already present,
activates the environment, and invokes pip to install all dependencies from requirements.txt.
#>

[CmdletBinding()]
param ()

# Ensures standard error output triggers error handling when necessary
$ErrorActionPreference = "Stop"

function Test-FfmpegAvailable {
    <#
    Checks whether the ffmpeg executable is discovered on the active system PATH.
    #>
    $command = Get-Command "ffmpeg" -ErrorAction SilentlyContinue
    return [bool]$command
}

function Get-FfmpegInstallationDirectory {
    <#
    Returns the target installation directory for FFmpeg in the local application data path.
    Installing under LocalAppData avoids elevated administrator privilege requirements on Windows.
    #>
    return (Join-Path $env:LOCALAPPDATA "ffmpeg")
}

function Download-FfmpegArchive {
    <#
    Downloads the official release essentials ZIP archive for Windows from gyan.dev.
    #>
    param (
        [Parameter(Mandatory = $true)]
        [string]$DestinationZipPath
    )

    $downloadUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    Write-Host "Downloading latest FFmpeg release essentials from $downloadUrl..." -ForegroundColor Cyan

    # TLS 1.2 is required by modern HTTPS endpoints
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $downloadUrl -OutFile $DestinationZipPath -UseBasicParsing
    Write-Host "Download complete: $DestinationZipPath" -ForegroundColor Green
}

function Extract-FfmpegArchive {
    <#
    Extracts the downloaded ZIP archive and positions the binary folder inside the target installation directory.
    #>
    param (
        [Parameter(Mandatory = $true)]
        [string]$ZipFilePath,
        [Parameter(Mandatory = $true)]
        [string]$TargetDirectory
    )

    $temporaryExtractPath = Join-Path $env:TEMP "ffmpeg-temp-extract"
    if (Test-Path $temporaryExtractPath) {
        Remove-Item -Path $temporaryExtractPath -Recurse -Force
    }

    Write-Host "Extracting FFmpeg archive to temporary staging path..." -ForegroundColor Cyan
    Expand-Archive -Path $ZipFilePath -DestinationPath $temporaryExtractPath -Force

    # Locate the extracted directory containing the bin folder
    $binFolder = Get-ChildItem -Path $temporaryExtractPath -Recurse -Directory -Filter "bin" | Select-Object -First 1
    if (-not $binFolder) {
        throw "Failed to locate the bin directory inside the extracted FFmpeg archive."
    }

    $sourceRoot = $binFolder.Parent.FullName

    if (Test-Path $TargetDirectory) {
        Remove-Item -Path $TargetDirectory -Recurse -Force
    }

    New-Item -ItemType Directory -Path $TargetDirectory -Force | Out-Null
    Copy-Item -Path "$sourceRoot\*" -Destination $TargetDirectory -Recurse -Force

    # Clean up temporary staging directory and download archive
    Remove-Item -Path $temporaryExtractPath -Recurse -Force
    if (Test-Path $ZipFilePath) {
        Remove-Item -Path $ZipFilePath -Force
    }

    Write-Host "FFmpeg installed successfully into $TargetDirectory" -ForegroundColor Green
}

function Add-DirectoryToUserPath {
    <#
    Appends the specified binary directory to the persistent Windows User PATH environment variable
    and updates the active PowerShell session PATH variable.
    #>
    param (
        [Parameter(Mandatory = $true)]
        [string]$BinaryDirectory
    )

    $userPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::User)
    $pathEntries = ($userPath -split ";") | Where-Object { $_ -ne "" }

    if ($pathEntries -notcontains $BinaryDirectory) {
        Write-Host "Registering $BinaryDirectory into User PATH environment variable..." -ForegroundColor Cyan
        $updatedPath = if ($userPath) { "$userPath;$BinaryDirectory" } else { $BinaryDirectory }
        [Environment]::SetEnvironmentVariable("Path", $updatedPath, [EnvironmentVariableTarget]::User)
        Write-Host "User PATH environment variable updated." -ForegroundColor Green
    } else {
        Write-Host "$BinaryDirectory is already present in User PATH." -ForegroundColor Yellow
    }

    # Update active session PATH to ensure subsequent calls recognize the binary immediately
    if (($env:PATH -split ";") -notcontains $BinaryDirectory) {
        $env:PATH = "$env:PATH;$BinaryDirectory"
    }
}

function Ensure-VirtualEnvironment {
    <#
    Provisions a local isolated Python virtual environment (.venv) if absent,
    and activates the environment for the current process session.
    #>
    param (
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot
    )

    $venvDirectory = Join-Path $ProjectRoot ".venv"
    $venvPython = Join-Path $venvDirectory "Scripts\python.exe"
    $venvActivateScript = Join-Path $venvDirectory "Scripts\Activate.ps1"

    if (-not (Test-Path $venvPython)) {
        Write-Host "Creating virtual environment (.venv) to prevent dependency conflicts..." -ForegroundColor Cyan
        & python -m venv $venvDirectory
        if ($LASTEXITCODE -ne 0) {
            throw "Virtual environment creation failed with exit code $LASTEXITCODE."
        }
        Write-Host "Virtual environment created successfully." -ForegroundColor Green
    } else {
        Write-Host "Existing virtual environment detected at $venvDirectory" -ForegroundColor Green
    }

    if (Test-Path $venvActivateScript) {
        Write-Host "Activating virtual environment for active PowerShell session..." -ForegroundColor Cyan
        & $venvActivateScript
    }

    return $venvPython
}

function Install-PythonRequirements {
    <#
    Installs Python dependencies declared in requirements.txt into the virtual environment.
    #>
    param (
        [Parameter(Mandatory = $true)]
        [string]$VenvPythonPath,
        [Parameter(Mandatory = $true)]
        [string]$RequirementsFilePath
    )

    if (-not (Test-Path $RequirementsFilePath)) {
        throw "Requirements file not found at: $RequirementsFilePath"
    }

    Write-Host "Installing dependencies from $RequirementsFilePath into virtual environment..." -ForegroundColor Cyan
    & $VenvPythonPath -m pip install -r $RequirementsFilePath
    if ($LASTEXITCODE -ne 0) {
        throw "pip installation failed with exit code $LASTEXITCODE."
    }
    Write-Host "Python dependencies successfully installed." -ForegroundColor Green
}

function Start-EnvironmentSetup {
    <#
    Coordinates the complete setup workflow: checking FFmpeg, downloading/installing if necessary,
    registering PATH variables, provisioning venv, and installing Python packages.
    #>
    Write-Host "=========================================" -ForegroundColor Magenta
    Write-Host " Starting YouTube Downloader Environment Setup " -ForegroundColor Magenta
    Write-Host "=========================================" -ForegroundColor Magenta

    $ffmpegAlreadyPresent = Test-FfmpegAvailable
    if ($ffmpegAlreadyPresent) {
        Write-Host "FFmpeg is already installed and available on PATH." -ForegroundColor Green
    } else {
        Write-Host "FFmpeg not detected on PATH. Initiating download and registration..." -ForegroundColor Yellow
        $installLocation = Get-FfmpegInstallationDirectory
        $tempArchive = Join-Path $env:TEMP "ffmpeg-release-essentials.zip"

        Download-FfmpegArchive -DestinationZipPath $tempArchive
        Extract-FfmpegArchive -ZipFilePath $tempArchive -TargetDirectory $installLocation

        $binDirectory = Join-Path $installLocation "bin"
        Add-DirectoryToUserPath -BinaryDirectory $binDirectory
    }

    $scriptRoot = $PSScriptRoot
    if (-not $scriptRoot) {
        $scriptRoot = (Get-Location).Path
    }

    $venvPythonPath = Ensure-VirtualEnvironment -ProjectRoot $scriptRoot

    $requirementsPath = Join-Path $scriptRoot "requirements.txt"
    Install-PythonRequirements -VenvPythonPath $venvPythonPath -RequirementsFilePath $requirementsPath

    Write-Host "`nSetup completed successfully!" -ForegroundColor Green
    Write-Host "FFmpeg version verification:" -ForegroundColor Cyan
    & ffmpeg -version | Select-Object -First 1

    Write-Host "`nReady to launch:" -ForegroundColor Cyan
    Write-Host "  Web UI:    python run_web.py" -ForegroundColor White
    Write-Host "  CLI Download: python download_video.py" -ForegroundColor White
    Write-Host "  CLI Enhancer: python enhance_clip.py" -ForegroundColor White
}

Start-EnvironmentSetup
