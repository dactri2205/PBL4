$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$source = Get-Content (Join-Path $PSScriptRoot 'fonts-source.css') -Raw
$i = 0
foreach ($match in [regex]::Matches($source, 'https://fonts.gstatic.com/[^)]+')) {
    $i++
    $name = "font-$i.ttf"
    Invoke-WebRequest -Uri $match.Value -OutFile (Join-Path $root "frontend/assets/fonts/$name")
    $source = $source.Replace($match.Value, "../fonts/$name")
}
[IO.File]::WriteAllText((Join-Path $root 'frontend/assets/css/fonts.css'), $source)
$photos = @{
 'office' = 'photo-1497366754035-f200968a6e72';
 'minh' = 'photo-1500648767791-00dcc994a43e';
 'linh' = 'photo-1580489944761-15a19d654956';
 'an' = 'photo-1506794778202-cad84cf45f1d';
 'ha' = 'photo-1534528741775-53994a69daeb';
 'nam' = 'photo-1472099645785-5658abf4ff4e';
 'mai' = 'photo-1531123897727-8f129e1688ce';
 'leader-khang' = 'photo-1519085360753-af0119f7cbe7';
 'leader-ngoc' = 'photo-1573496359142-b8d87734a5a2';
 'leader-huy' = 'photo-1560250097-0b93528c311a'
}
foreach ($photo in $photos.GetEnumerator()) {
    $width = if ($photo.Key -eq 'office') { 1400 } else { 480 }
    Invoke-WebRequest -Uri "https://images.unsplash.com/$($photo.Value)?auto=format&fit=crop&w=$width&q=85" -OutFile (Join-Path $root "frontend/assets/images/$($photo.Key).jpg")
}
