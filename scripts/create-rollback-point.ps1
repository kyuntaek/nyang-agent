# 롤백 포인트: Git 저장소가 있으면 커밋 + 태그까지 생성합니다.
# 사용: PowerShell에서 프로젝트 루트 기준
#   .\scripts\create-rollback-point.ps1
# Git이 없으면 안내 메시지만 출력합니다.

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$tagName = "checkpoint-$stamp"
$commitMsg = "checkpoint: $stamp (rollback point)"

$gitExe = $null
$cmd = Get-Command git -ErrorAction SilentlyContinue
if ($cmd) {
  $gitExe = $cmd.Path
  if (-not $gitExe -and $cmd.Source) { $gitExe = $cmd.Source }
}
if (-not $gitExe) {
  foreach ($p in @(
      "${env:ProgramFiles}\Git\cmd\git.exe",
      "${env:ProgramFiles}\Git\bin\git.exe",
      "${env:LocalAppData}\Programs\Git\cmd\git.exe"
    )) {
    if (Test-Path $p) {
      $gitExe = $p
      break
    }
  }
}

if (-not $gitExe) {
  Write-Host "Git을 찾을 수 없습니다. Git for Windows를 설치한 뒤 PATH에 추가하고 이 스크립트를 다시 실행하세요."
  Write-Host "폴더만 백업하려면 (node_modules 제외):"
  Write-Host "  robocopy `"$root`" `"..\nyang-agent-checkpoint-$stamp`" /E /XD node_modules .git .expo"
  exit 1
}

& $gitExe -C $root rev-parse --is-inside-work-tree 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  & $gitExe -C $root init
}

& $gitExe -C $root add -A
$status = & $gitExe -C $root status --porcelain
if (-not $status) {
  Write-Host "변경 사항이 없어 커밋하지 않았습니다. (이미 최신 커밋과 동일)"
} else {
  & $gitExe -C $root commit -m $commitMsg
}

$head = & $gitExe -C $root rev-parse --short HEAD
& $gitExe -C $root tag -a $tagName -m "Rollback point $stamp" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "(참고) 태그가 이미 있으면: git tag -d $tagName 후 다시 실행하세요."
}

Write-Host ""
Write-Host "롤백 포인트가 준비되었습니다."
Write-Host "  커밋: $commitMsg"
Write-Host "  짧은 해시: $head"
Write-Host "  태그: $tagName"
Write-Host ""
Write-Host "이 시점으로 되돌리기:"
Write-Host "  git checkout $tagName"
Write-Host "  또는  git reset --hard $tagName"
