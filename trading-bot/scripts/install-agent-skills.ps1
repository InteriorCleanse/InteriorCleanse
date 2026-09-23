# Install the full third-party skill collections for Claude Code at USER level
# ($HOME\.claude\skills), where they apply to every project on this machine.
#
# The repository already vendors a curated subset under .claude\skills\ (see
# .claude\skills\THIRD_PARTY_SKILLS.md). Run this only if you want the whole
# collections: they are large (the scientific set is hundreds of megabytes)
# and every skill is a set of instructions an agent will follow, written by
# someone else. Read what you install.
#
# Nothing here touches the bot, its data, or its configuration.
$ErrorActionPreference = 'Stop'
$Dest = if ($env:CLAUDE_SKILLS_DIR) { $env:CLAUDE_SKILLS_DIR } else { Join-Path $HOME '.claude\skills' }
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("skills-" + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

function Install-Collection($Name, $Url, $Sub) {
  Write-Host "== $Name"
  git clone -q --depth 1 --filter=blob:none $Url (Join-Path $Tmp $Name)
  $Src = if ($Sub) { Join-Path (Join-Path $Tmp $Name) $Sub } else { Join-Path $Tmp $Name }
  if (Test-Path (Join-Path $Src 'SKILL.md')) {
    $Target = Join-Path $Dest $Name
    if (Test-Path $Target) { Remove-Item -Recurse -Force $Target }
    Copy-Item -Recurse $Src $Target
  } else {
    Get-ChildItem -Directory $Src | ForEach-Object {
      if (Test-Path (Join-Path $_.FullName 'SKILL.md')) {
        $Target = Join-Path $Dest $_.Name
        if (Test-Path $Target) { Remove-Item -Recurse -Force $Target }
        Copy-Item -Recurse $_.FullName $Target
      }
    }
  }
  foreach ($lic in 'LICENSE', 'LICENSE.md') {
    $p = Join-Path (Join-Path $Tmp $Name) $lic
    if (Test-Path $p) { Copy-Item $p (Join-Path $Dest "$Name.LICENSE") }
  }
}

Install-Collection 'diagram-design' 'https://github.com/cathrynlavery/diagram-design' 'skills\diagram-design'
Install-Collection 'scientific-agent-skills' 'https://github.com/k-dense-ai/scientific-agent-skills' 'skills'
Install-Collection 'cybersecurity-skills' 'https://github.com/mukul975/Anthropic-Cybersecurity-Skills' 'skills'

Remove-Item -Recurse -Force $Tmp
Write-Host ''
Write-Host "Installed into $Dest. Restart Claude Code to pick them up."
Write-Host "Note: 'Anthropic-Cybersecurity-Skills' is a community project; despite the name it is not published by Anthropic."
