Add-Type -AssemblyName System.Drawing

$src = "C:\Users\Walter\.gemini\antigravity-ide\brain\b6922c11-2929-4b92-a168-00fab6ac2b3f\lidemoda_app_icon_1789568413642.jpg"
$baseDir = "d:\TRABAJO\uni\INGSOFT\proyecto\proyecto\mobile"

$original = [System.Drawing.Image]::FromFile($src)
Write-Output "Original dimensions: $($original.Width)x$($original.Height)"

function Save-ResizedImage {
    param(
        [System.Drawing.Image]$img,
        [int]$targetWidth,
        [int]$targetHeight,
        [string]$outputPath
    )
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $targetWidth, $targetHeight)
    $destImage = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight)
    $destImage.SetResolution($img.HorizontalResolution, $img.VerticalResolution)

    $graphics = [System.Drawing.Graphics]::FromImage($destImage)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $wrapMode = New-Object System.Drawing.Imaging.ImageAttributes
    $wrapMode.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
    $graphics.DrawImage($img, $destRect, 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel, $wrapMode)

    $destImage.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $destImage.Dispose()
    Write-Output "Saved: $outputPath ($($targetWidth)x$($targetHeight))"
}

function Save-AdaptiveForeground {
    param(
        [System.Drawing.Image]$img,
        [int]$canvasSize = 1024,
        [int]$contentSize = 740,
        [string]$outputPath
    )
    $destImage = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize)
    $destImage.SetResolution($img.HorizontalResolution, $img.VerticalResolution)

    $graphics = [System.Drawing.Graphics]::FromImage($destImage)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $offset = [int](($canvasSize - $contentSize) / 2)
    $destRect = New-Object System.Drawing.Rectangle($offset, $offset, $contentSize, $contentSize)
    $graphics.DrawImage($img, $destRect, 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel)

    $destImage.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $destImage.Dispose()
    Write-Output "Saved Adaptive Foreground: $outputPath"
}

# 1. assets/icon.png (root of assets, 1024x1024)
Save-ResizedImage -img $original -targetWidth 1024 -targetHeight 1024 -outputPath "$baseDir\assets\icon.png"

# 2. assets/images/icon.png (1024x1024)
Save-ResizedImage -img $original -targetWidth 1024 -targetHeight 1024 -outputPath "$baseDir\assets\images\icon.png"

# 3. assets/adaptive-icon.png (safe centered 1024x1024)
Save-AdaptiveForeground -img $original -canvasSize 1024 -contentSize 740 -outputPath "$baseDir\assets\adaptive-icon.png"

# 4. assets/images/android-icon-foreground.png (safe centered 1024x1024)
Save-AdaptiveForeground -img $original -canvasSize 1024 -contentSize 740 -outputPath "$baseDir\assets\images\android-icon-foreground.png"

# 5. assets/images/android-icon-background.png (solid #0F172A matching theme)
$bg = New-Object System.Drawing.Bitmap(1024, 1024)
$gBg = [System.Drawing.Graphics]::FromImage($bg)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#0F172A"))
$gBg.FillRectangle($brush, 0, 0, 1024, 1024)
$bg.Save("$baseDir\assets\images\android-icon-background.png", [System.Drawing.Imaging.ImageFormat]::Png)
$gBg.Dispose()
$bg.Dispose()
Write-Output "Saved Android Background: $baseDir\assets\images\android-icon-background.png"

# 6. assets/images/splash-icon.png (512x512)
Save-ResizedImage -img $original -targetWidth 512 -targetHeight 512 -outputPath "$baseDir\assets\images\splash-icon.png"

# 7. assets/splash.png (1024x1024)
Save-ResizedImage -img $original -targetWidth 1024 -targetHeight 1024 -outputPath "$baseDir\assets\splash.png"

# 8. assets/favicon.png and assets/images/favicon.png (64x64)
Save-ResizedImage -img $original -targetWidth 64 -targetHeight 64 -outputPath "$baseDir\assets\favicon.png"
Save-ResizedImage -img $original -targetWidth 64 -targetHeight 64 -outputPath "$baseDir\assets\images\favicon.png"

$original.Dispose()
Write-Output "All icons and splash assets updated successfully!"
