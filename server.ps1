# Server web locale per famiglia-app
$port = 8080
$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host ""
Write-Host "  App avviata!" -ForegroundColor Green
Write-Host "  Apri il browser su: http://localhost:$port" -ForegroundColor Cyan
Write-Host "  Premi Ctrl+C per fermare il server" -ForegroundColor Yellow
Write-Host ""

$mimeTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css'
  '.js'   = 'application/javascript'
  '.json' = 'application/json'
  '.png'  = 'image/png'
  '.ico'  = 'image/x-icon'
  '.webmanifest' = 'application/manifest+json'
}

try {
  while ($listener.IsListening) {
    $ctx  = $listener.GetContext()
    $req  = $ctx.Request
    $resp = $ctx.Response

    $urlPath = $req.Url.LocalPath
    if ($urlPath -eq '/') { $urlPath = '/index.html' }
    $filePath = Join-Path $root $urlPath.TrimStart('/')

    if (Test-Path $filePath -PathType Leaf) {
      $ext  = [System.IO.Path]::GetExtension($filePath)
      $mime = if ($mimeTypes[$ext]) { $mimeTypes[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $resp.ContentType   = $mime
      $resp.ContentLength64 = $bytes.Length
      $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $resp.StatusCode = 404
    }
    $resp.OutputStream.Close()
  }
} finally {
  $listener.Stop()
}
