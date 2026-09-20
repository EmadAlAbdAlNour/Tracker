Add-Type -AssemblyName System.Drawing

function New-TrackerIcon {
    param(
        [int]$size,
        [string]$outputPath,
        [bool]$isRound = $false,
        [bool]$foregroundOnly = $false
    )

    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $cx = $size / 2.0
    $cy = $size / 2.0

    # 1. Background (unless foregroundOnly)
    if (-not $foregroundOnly) {
        $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
        $c1 = [System.Drawing.ColorTranslator]::FromHtml("#0f766e")
        $c2 = [System.Drawing.ColorTranslator]::FromHtml("#059669")
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45.0)

        if ($isRound) {
            $path = New-Object System.Drawing.Drawing2D.GraphicsPath
            $path.AddEllipse(1, 1, ($size - 2), ($size - 2))
            $g.FillPath($brush, $path)
        } else {
            $radius = [int]($size * 0.22)
            $path = New-Object System.Drawing.Drawing2D.GraphicsPath
            $d = $radius * 2
            $path.AddArc(0, 0, $d, $d, 180, 90)
            $path.AddArc(($size - $d), 0, $d, $d, 270, 90)
            $path.AddArc(($size - $d), ($size - $d), $d, $d, 0, 90)
            $path.AddArc(0, ($size - $d), $d, $d, 90, 90)
            $path.CloseFigure()
            $g.FillPath($brush, $path)
        }
    }

    $scaleFactor = if ($foregroundOnly) { 0.7 } else { 1.0 }
    $r1 = $size * 0.29 * $scaleFactor
    $r2 = $size * 0.21 * $scaleFactor

    # 2. Outer Radar Ring
    $pen1 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(65, 255, 255, 255), [Math]::Max(1.0, $size * 0.008))
    $pen1.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
    $g.DrawEllipse($pen1, [float]($cx - $r1), [float]($cy - $r1), [float]($r1 * 2), [float]($r1 * 2))

    # 3. Inner Radar Ring
    $pen2 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(100, 255, 255, 255), [Math]::Max(1.5, $size * 0.012))
    $g.DrawEllipse($pen2, [float]($cx - $r2), [float]($cy - $r2), [float]($r2 * 2), [float]($r2 * 2))

    # 4. Radar Sweep Sector
    $sweepPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $sweepPath.AddPie([float]($cx - $r1), [float]($cy - $r1), [float]($r1 * 2), [float]($r1 * 2), -90, 45)
    $sweepBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(75, 52, 211, 153))
    $g.FillPath($sweepBrush, $sweepPath)

    # 5. Compass Arrow
    $pTop = New-Object System.Drawing.PointF([float]$cx, [float]($cy - $r1 * 0.8))
    $pRight = New-Object System.Drawing.PointF([float]($cx + $r2 * 0.6), [float]($cy + $r2 * 0.4))
    $pCenter = New-Object System.Drawing.PointF([float]$cx, [float]($cy + $r2 * 0.1))
    $pLeft = New-Object System.Drawing.PointF([float]($cx - $r2 * 0.6), [float]($cy + $r2 * 0.4))

    $arrowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $arrowPath.AddLines(@($pTop, $pRight, $pCenter, $pLeft))
    $arrowPath.CloseFigure()
    $arrowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPath($arrowBrush, $arrowPath)

    # 6. Center Telemetry Pin
    $rPin = [Math]::Max(2.0, $size * 0.028 * $scaleFactor)
    $pinBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#34d399"))
    $pinPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [Math]::Max(1.0, $size * 0.008))
    $g.FillEllipse($pinBrush, [float]($cx - $rPin), [float]($cy - $rPin), [float]($rPin * 2), [float]($rPin * 2))
    $g.DrawEllipse($pinPen, [float]($cx - $rPin), [float]($cy - $rPin), [float]($rPin * 2), [float]($rPin * 2))

    $dir = [System.IO.Path]::GetDirectoryName($outputPath)
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "Generated $outputPath ($size x $size)"
}

$densities = @{
    "mdpi"    = 48
    "hdpi"    = 72
    "xhdpi"   = 96
    "xxhdpi"  = 144
    "xxxhdpi" = 192
}

$resDir = "C:\Users\Emad\Desktop\Tracker\Tracker\apps\mobile\android\app\src\main\res"

foreach ($k in $densities.Keys) {
    $dim = $densities[$k]
    # Standard square squircle icon
    New-TrackerIcon -size $dim -outputPath "$resDir\mipmap-$k\ic_launcher.png" -isRound $false
    # Round icon
    New-TrackerIcon -size $dim -outputPath "$resDir\mipmap-$k\ic_launcher_round.png" -isRound $true
}

# Assets folder for Expo / React Native
$assetsDir = "C:\Users\Emad\Desktop\Tracker\Tracker\apps\mobile\assets"
New-TrackerIcon -size 1024 -outputPath "$assetsDir\icon.png" -isRound $false
New-TrackerIcon -size 1024 -outputPath "$assetsDir\adaptive-icon.png" -isRound $false -foregroundOnly $true

