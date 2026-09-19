Add-Type -AssemblyName System.Drawing

$size = 32
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

$rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$c1 = [System.Drawing.ColorTranslator]::FromHtml('#0f766e')
$c2 = [System.Drawing.ColorTranslator]::FromHtml('#059669')
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45.0)

$radius = [int]($size * 0.22)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$d = $radius * 2
$path.AddArc(0, 0, $d, $d, 180, 90)
$path.AddArc(($size - $d), 0, $d, $d, 270, 90)
$path.AddArc(($size - $d), ($size - $d), $d, $d, 0, 90)
$path.AddArc(0, ($size - $d), $d, $d, 90, 90)
$path.CloseFigure()
$g.FillPath($brush, $path)

$cx = $size / 2.0
$cy = $size / 2.0
$r1 = $size * 0.29
$r2 = $size * 0.21

$pTop = New-Object System.Drawing.PointF([float]$cx, [float]($cy - $r1 * 0.8))
$pRight = New-Object System.Drawing.PointF([float]($cx + $r2 * 0.6), [float]($cy + $r2 * 0.4))
$pCenter = New-Object System.Drawing.PointF([float]$cx, [float]($cy + $r2 * 0.1))
$pLeft = New-Object System.Drawing.PointF([float]($cx - $r2 * 0.6), [float]($cy + $r2 * 0.4))

$arrowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$arrowPath.AddLines(@($pTop, $pRight, $pCenter, $pLeft))
$arrowPath.CloseFigure()
$g.FillPath([System.Drawing.Brushes]::White, $arrowPath)

$rPin = 2.0
$pinBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#34d399'))
$g.FillEllipse($pinBrush, [float]($cx - $rPin), [float]($cy - $rPin), [float]($rPin * 2), [float]($rPin * 2))

$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = New-Object System.IO.FileStream('apps/web/public/favicon.ico', [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$g.Dispose()
$bmp.Dispose()
Write-Output "Favicon generated at apps/web/public/favicon.ico"

