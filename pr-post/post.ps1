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

function Get-LinkLabel([string] $Url) {
    $github = [regex]::Match($Url, '^https://github\.com/[^/]+/([^/?#]+)(?:/(?:pull|issues)/(\d+))?')
    if (-not $github.Success) { return $Url }
    $repo = $github.Groups[1].Value -replace '^Remundo\.(?=.)', ''
    if ($github.Groups[2].Success) { "$repo #$($github.Groups[2].Value)" } else { $repo }
}

function ConvertTo-MessageHtml([string[]] $Lines) {
    $html = [System.Text.StringBuilder]::new()
    $inList = $false
    foreach ($line in $Lines) {
        $isUrl = $line -match '^https?://\S+$'
        if ($inList -and -not $isUrl) {
            [void]$html.Append('</ul>')
            $inList = $false
        }
        $heading = [regex]::Match($line, '^(\d{4,}) - ')
        if ($heading.Success) {
            $number = $heading.Groups[1].Value
            $rest = [System.Net.WebUtility]::HtmlEncode($line.Substring($heading.Length))
            [void]$html.Append("<p><b><a href=""$issueBase$number"">#$number</a> $rest</b></p>")
        }
        elseif ($isUrl) {
            if (-not $inList) {
                [void]$html.Append('<ul>')
                $inList = $true
            }
            $url = [System.Net.WebUtility]::HtmlEncode($line)
            $label = [System.Net.WebUtility]::HtmlEncode((Get-LinkLabel $line))
            [void]$html.Append("<li><a href=""$url"">$label</a></li>")
        }
        elseif ($line) {
            [void]$html.Append("<p>$([System.Net.WebUtility]::HtmlEncode($line))</p>")
        }
    }
    if ($inList) { [void]$html.Append('</ul>') }
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
