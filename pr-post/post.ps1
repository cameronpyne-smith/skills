[CmdletBinding(DefaultParameterSetName = 'Post')]
param(
    [Parameter(ParameterSetName = 'Post', Mandatory)]
    [string] $MessageFile,

    [Parameter(ParameterSetName = 'Post')]
    [switch] $DryRun,

    [Parameter(ParameterSetName = 'Setup', Mandatory)]
    [switch] $Setup,

    [Parameter(ParameterSetName = 'Setup', Mandatory)]
    [string] $ChatLink,

    [Parameter(ParameterSetName = 'Setup', Mandatory)]
    [string] $Name
)

$ErrorActionPreference = 'Stop'

$configPath = Join-Path $HOME '.config/pr-post/config.json'
$issueBase = 'https://github.com/remundo-xml/Remundo.Ui.Platform/issues/'

function Connect-Graph([string[]] $Scopes) {
    if (-not (Get-Module -ListAvailable Microsoft.Graph.Authentication)) {
        Write-Host 'Installing Microsoft.Graph.Authentication for the current user...'
        Install-Module Microsoft.Graph.Authentication -Scope CurrentUser -Repository PSGallery -Force
    }
    Import-Module Microsoft.Graph.Authentication
    Connect-MgGraph -Scopes $Scopes -NoWelcome
}

function Get-LinkRepo([string] $Url) {
    $github = [regex]::Match($Url, '^https://github\.com/[^/]+/([^/?#]+)')
    if (-not $github.Success) { return $Url }
    $github.Groups[1].Value -replace '^Remundo\.(?=.)', ''
}

function Get-LinkLabel([string] $Url, [bool] $WithNumber) {
    $repo = Get-LinkRepo $Url
    $number = [regex]::Match($Url, '^https://github\.com/[^/]+/[^/?#]+/(?:pull|issues)/(\d+)')
    if ($WithNumber -and $number.Success) { "$repo #$($number.Groups[1].Value)" } else { $repo }
}

function Get-SizeHtml([string] $Added, [string] $Deleted) {
    "&nbsp;&nbsp;<span style=""color:#1a7f37"">+$Added</span> <span style=""color:#cf222e"">$([char]0x2212)$Deleted</span>"
}

function ConvertTo-MessageHtml([string[]] $Lines) {
    $html = [System.Text.StringBuilder]::new()
    $urlPattern = '^(https?://\S+)(?: \+(\d+) -(\d+))?$'
    $inList = $false
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        $line = $Lines[$i]
        $link = [regex]::Match($line, $urlPattern)
        $heading = [regex]::Match($line, '^(\d{4,}) - ')
        if ($heading.Success) {
            $number = $heading.Groups[1].Value
            $rest = [System.Net.WebUtility]::HtmlEncode($line.Substring($heading.Length))
            [void]$html.Append("<p><a href=""$issueBase$number"">#$number</a><br><i>$rest</i></p>")
        }
        elseif ($link.Success) {
            if (-not $inList) {
                [void]$html.Append('<p>')
                $inList = $true
                $runRepos = for ($j = $i; $j -lt $Lines.Count; $j++) {
                    $runLink = [regex]::Match($Lines[$j], $urlPattern)
                    if (-not $runLink.Success) { break }
                    Get-LinkRepo $runLink.Groups[1].Value
                }
                $repeated = @($runRepos | Group-Object | Where-Object Count -gt 1 | ForEach-Object Name)
            }
            else {
                [void]$html.Append('<br>')
            }
            $isLast = $i + 1 -ge $Lines.Count -or $Lines[$i + 1] -notmatch $urlPattern
            $branch = [string][char]$(if ($isLast) { 0x2514 } else { 0x251C }) + [char]0x2500
            $target = $link.Groups[1].Value
            $url = [System.Net.WebUtility]::HtmlEncode($target)
            $label = [System.Net.WebUtility]::HtmlEncode((Get-LinkLabel $target ($repeated -contains (Get-LinkRepo $target))))
            $size = if ($link.Groups[2].Success) { Get-SizeHtml $link.Groups[2].Value $link.Groups[3].Value } else { '' }
            [void]$html.Append("$branch <a href=""$url"">$label</a>$size")
            if ($isLast) {
                [void]$html.Append('</p>')
                $inList = $false
            }
        }
        elseif ($line) {
            [void]$html.Append("<p>$([System.Net.WebUtility]::HtmlEncode($line))</p>")
        }
    }
    $html.ToString()
}

if ($Setup) {
    $chatId = [regex]::Match([uri]::UnescapeDataString($ChatLink), '19:[^/?#\s]+@thread\.v2').Value
    if (-not $chatId) {
        throw 'No group chat id (19:...@thread.v2) found in -ChatLink. In Teams, copy the link to any message in the chat.'
    }

    New-Item -ItemType Directory -Force (Split-Path $configPath) | Out-Null
    @{ chatId = $chatId; topic = $Name } | ConvertTo-Json | Set-Content -Path $configPath -Encoding utf8
    Write-Host "Saved '$Name' ($chatId) to $configPath"

    Connect-Graph @('ChatMessage.Send')
    Write-Host 'Signed in with ChatMessage.Send.'
    return
}

if (-not (Test-Path $configPath)) {
    throw "No chat configured. Run: pwsh -NoProfile -File `"$PSCommandPath`" -Setup -ChatLink <link to a message in the chat> -Name <chat name>"
}
$config = Get-Content -Raw $configPath | ConvertFrom-Json

$lines = @(((Get-Content -Raw $MessageFile) -replace '\s+$', '') -split '\r?\n')
if (-not $lines[0]) { throw "$MessageFile is empty." }

$html = ConvertTo-MessageHtml $lines

if ($DryRun) {
    Write-Host "Chat: $($config.topic)"
    Write-Host $html
    return
}

Connect-Graph @('ChatMessage.Send')
$body = @{ body = @{ contentType = 'html'; content = $html } } | ConvertTo-Json -Depth 3
$message = Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/chats/$($config.chatId)/messages" -Body $body -ContentType 'application/json'
Write-Host "Posted to '$($config.topic)' (message $($message.id))"
