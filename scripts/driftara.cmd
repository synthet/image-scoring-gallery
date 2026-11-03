@echo off
REM driftara: single entry point for Driftara Gallery (MCP server + CLI).
REM   scripts\driftara.cmd                 stdio MCP server (search, resolve, execute)
REM   scripts\driftara.cmd search "..."    CLI; see docs/technical/DRIFTARA_MCP.md
REM Build once: cd mcp-server ^&^& npm ci ^&^& npm run build
setlocal
set "ENTRY=%~dp0..\mcp-server\dist\driftara.js"
if not exist "%ENTRY%" (
    echo driftara: %ENTRY% not found. Run: cd mcp-server ^&^& npm ci ^&^& npm run build 1>&2
    exit /b 2
)
node "%ENTRY%" %*
exit /b %ERRORLEVEL%
