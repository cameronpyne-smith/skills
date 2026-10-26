[CmdletBinding(DefaultParameterSetName = 'Post')]
param(
    [Parameter(ParameterSetName = 'Post', Mandatory)]
    [string] $MessageFile,

    [Parameter(ParameterSetName = 'Post')]
    [ValidatePattern('^\d+$')]
    [string] $Ticket,

    [Parameter(ParameterSetName = 'Post')]
    [switch] $DryRun,

    [Parameter(ParameterSetName = 'Setup', Mandatory)]
    [switch] $Setup,

    [Parameter(ParameterSetName = 'Setup')]
    [string] $Topic
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

function ConvertTo-MessageHtml([string[]] $Lines, [string] $Ticket) {
    $paragraphs = for ($i = 0; $i -lt $Lines.Count; $i++) {
        $line = $Lines[$i]
        if ($i -eq 0 -and $Ticket -and $line.StartsWith("$Ticket - ")) {
            "<a href=""$issueBase$Ticket"">$Ticket</a>" + [System.Net.WebUtility]::HtmlEncode($line.Substring($Ticket.Length))
        }
        elseif ($line -match '^https?://\S+$') {
            $url = [System.Net.WebUtility]::HtmlEncode($line)
            "<a href=""$url"">$url</a>"
        }
        else {
            [System.Net.WebUtility]::HtmlEncode($line)
        }
    }
    ($paragraphs | ForEach-Object { "<p>$_</p>" }) -join ''
}

if ($Setup) {
    Connect-Graph @('ChatMessage.Send', 'Chat.ReadBasic')
    $chats = @()
    $uri = 'https://graph.microsoft.com/v1.0/me/chats?$top=50'
    while ($uri) {
        $page = Invoke-MgGraphRequest -Method GET -Uri $uri
        $chats += $page.value
        $uri = $page.'@odata.nextLink'
    }
    $named = $chats | Where-Object { $_.chatType -eq 'group' -and $_.topic } | Sort-Object { $_.lastUpdatedDateTime } -Descending

    if (-not $Topic) {
        Write-Host 'Group chats (most recently active first). Re-run with -Topic "<name>" to choose one:'
        $named | ForEach-Object { Write-Host "  $($_.topic)" }
        return
    }

    $candidates = @($named | Where-Object { $_.topic -eq $Topic })
    if ($candidates.Count -eq 0) {
        $candidates = @($named | Where-Object { $_.topic -like "*$Topic*" })
    }
    if ($candidates.Count -ne 1) {
        Write-Host "$($candidates.Count) group chats match '$Topic':"
        $candidates | ForEach-Object { Write-Host "  $($_.topic)" }
        throw 'Choose exactly one chat with a more specific -Topic.'
    }

    New-Item -ItemType Directory -Force (Split-Path $configPath) | Out-Null
    @{ chatId = $candidates[0].id; topic = $candidates[0].topic } | ConvertTo-Json | Set-Content -Path $configPath -Encoding utf8
    Write-Host "Saved '$($candidates[0].topic)' to $configPath"
    return
}

if (-not (Test-Path $configPath)) {
    throw "No chat configured. Run: pwsh -NoProfile -File `"$PSCommandPath`" -Setup"
}
$config = Get-Content -Raw $configPath | ConvertFrom-Json

$lines = @(((Get-Content -Raw $MessageFile) -replace '\s+$', '') -split '\r?\n')
if (-not $lines[0]) { throw "$MessageFile is empty." }

$html = ConvertTo-MessageHtml $lines $Ticket

if ($DryRun) {
    Write-Host "Chat: $($config.topic)"
    Write-Host $html
    return
}

Connect-Graph @('ChatMessage.Send')
$body = @{ body = @{ contentType = 'html'; content = $html } } | ConvertTo-Json -Depth 3
$message = Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/chats/$($config.chatId)/messages" -Body $body -ContentType 'application/json'
Write-Host "Posted to '$($config.topic)' (message $($message.id))"
