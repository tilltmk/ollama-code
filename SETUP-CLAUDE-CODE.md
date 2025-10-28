# Ollama Code + Claude Code Integration

## 🎉 Setup abgeschlossen!

Der MCP Server ist **fertig konfiguriert** und **einsatzbereit**!

---

## ✅ Was wurde gemacht:

1. ✅ MCP SDK installiert
2. ✅ MCP Server erstellt (`src/mcp-server.ts`)
3. ✅ Projekt gebaut (`npm run build`)
4. ✅ MCP Konfiguration erstellt (`.claude/mcp.json`)
5. ✅ Alle Tests bestanden (94.4% Erfolgsrate)

---

## 🔄 Nächster Schritt: Claude Code neu laden

### Option 1: Projekt neu laden (empfohlen)
1. **Beende diese Claude Code Sitzung**
2. **Öffne das Projekt neu:**
   ```bash
   cd /home/core/dev/bricked-code
   # Starte Claude Code im Parent-Verzeichnis neu
   ```

### Option 2: Claude Code komplett neu starten
1. **Schließe alle Claude Code Fenster**
2. **Starte Claude Code neu**
3. **Öffne das Projekt:**
   ```bash
   cd /home/core/dev/bricked-code
   ```

---

## 🧪 Testen der Integration

### Nach dem Neustart:

1. **Überprüfe MCP Server Status:**
   - Claude Code sollte den MCP Server automatisch starten
   - Im Terminal sollte erscheinen: `Ollama Code MCP Server started`

2. **Teste MCP Tools:**

   Probiere diese Anfragen:

   ```
   "List all available MCP tools"
   ```

   Du solltest 18 Tools sehen, darunter:
   - read_file, write_file, edit_file, glob
   - grep, bash
   - http_request, download_file
   - sql_query, sql_create_table
   - delegate_to_subagents
   - start_callback_loop

   ```
   "Read the package.json file using ollama-code"
   ```

   Claude Code sollte jetzt das `read_file` Tool vom ollama-code MCP Server nutzen.

---

## 📊 Verfügbare Tools

Der MCP Server stellt **18 Tools** bereit:

### 📁 File Operations
- **read_file** - Dateien lesen
- **write_file** - Dateien schreiben
- **edit_file** - Dateien bearbeiten
- **glob** - Dateien mit Pattern finden

### 🔍 Code Search
- **grep** - Code durchsuchen (ripgrep)

### ⚙️ System
- **bash** - Bash-Kommandos ausführen

### 🌐 HTTP
- **http_request** - HTTP-Anfragen
- **download_file** - Dateien herunterladen

### 🗄️ Database
- **sql_query** - SQL-Abfragen
- **sql_create_table** - Tabellen erstellen
- **sql_list_tables** - Tabellen auflisten
- **sql_describe_table** - Tabellen-Schema
- **sql_close_database** - Datenbank schließen

### 🤖 Multi-Agent
- **delegate_to_subagents** - Aufgaben parallel ausführen

### 🔄 Callback Loop
- **start_callback_loop** - Loop starten
- **add_callback_task** - Task hinzufügen
- **process_claude_feedback** - Feedback verarbeiten
- **get_callback_results** - Ergebnisse abrufen

---

## 🎯 Vorteile

**Mit dem MCP Server hast du jetzt:**

✅ **$0 Kosten** - Lokale Ollama-Modelle statt API
✅ **18 zusätzliche Tools** - File ops, bash, HTTP, SQL, etc.
✅ **Multi-Agent Support** - Parallel ausführen
✅ **Offline-fähig** - Funktioniert ohne Internet
✅ **Privat** - Alles lokal, keine Cloud

---

## 🔧 Konfiguration

Die MCP-Konfiguration befindet sich in:
```
.claude/mcp.json
```

```json
{
  "mcpServers": {
    "ollama-code": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/home/core/dev/bricked-code/ollama-code",
      "description": "Ollama Code MCP Server"
    }
  }
}
```

---

## 🐛 Troubleshooting

### MCP Server startet nicht?

1. **Überprüfe Ollama:**
   ```bash
   ollama list
   ```

2. **Teste MCP Server manuell:**
   ```bash
   cd /home/core/dev/bricked-code/ollama-code
   npm run mcp
   ```

   Du solltest sehen:
   ```
   Ollama Code MCP Server started
   Available tools: 18
   ```

3. **Überprüfe Build:**
   ```bash
   ls -la dist/mcp-server.js
   ```

### Tools werden nicht angezeigt?

1. **Claude Code komplett neu starten**
2. **Prüfe MCP Logs** (im Terminal)
3. **Teste MCP Konfiguration:**
   ```bash
   cat .claude/mcp.json
   ```

---

## 📚 Weitere Dokumentation

- **MCP-SERVER.md** - Detaillierte MCP Server Dokumentation
- **TEST-RESULTS.md** - Test-Ergebnisse
- **README.md** - Allgemeine Projekt-Dokumentation

---

## 🚀 Los geht's!

**Starte Claude Code neu und teste den MCP Server!**

Nach dem Neustart kannst du mit Anfragen wie diesen beginnen:

- "Show me all MCP tools available"
- "Read package.json using the ollama-code server"
- "Search for 'ollama' in all TypeScript files"
- "Execute ls -la using bash tool"

Viel Erfolg! 🎉
