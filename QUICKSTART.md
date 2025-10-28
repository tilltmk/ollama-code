# Quick Start Guide - Ollama Code

## Schnellstart in 3 Schritten

### 1. Installation

```bash
cd /home/core/dev/bricked-code/ollama-code
npm install
npm run build
```

### 2. Modelle prüfen

```bash
# Prüfen ob Ollama läuft
npm run dev -- health

# Verfügbare Modelle anzeigen
npm run dev -- models
```

### 3. Code-Assistent starten

```bash
# Interaktiven Chat starten
npm run dev
```

## Beispiel-Nutzung

### Basis-Interaktion

```
ollama-code> Lies die package.json Datei

[System nutzt read_file Tool]
[Zeigt Inhalt an]
```

### Code-Generierung

```
ollama-code> Erstelle eine Fibonacci-Funktion in TypeScript in fib.ts

[System nutzt Qwen3-Coder]
[Nutzt write_file Tool]
[Erstellt fib.ts mit Implementierung]
```

### Code-Suche

```
ollama-code> Suche alle Dateien mit "import" Statement

[System nutzt grep Tool]
[Zeigt alle Treffer]
```

### Bash-Befehle

```
ollama-code> Zeige alle TypeScript-Dateien im src Verzeichnis

[System nutzt bash Tool mit ls/find]
[Listet Dateien auf]
```

### Datei-Bearbeitung

```
ollama-code> Ändere in der README.md "Ollama Code" zu "Ollama Assistant"

[System nutzt edit_file Tool]
[Führt String-Replacement durch]
```

## REPL-Befehle

| Befehl | Beschreibung |
|--------|--------------|
| `/help` | Zeigt Hilfe |
| `/models` | Listet verfügbare Modelle |
| `/model qwen3-coder:30b` | Wechselt zu Qwen3-Coder |
| `/model gpt-oss:20b` | Wechselt zu GPT-OSS |
| `/verbose` | Verbose-Modus an/aus |
| `/clear` | Löscht Konversation |
| `/exit` | Beendet REPL |

## Modell-Auswahl

### Automatisch (empfohlen)
Das System wählt automatisch das beste Modell:
- **Code-Tasks** → Qwen3-Coder
- **Reasoning** → GPT-OSS
- **Schnelle Tasks** → Llama 3.1

### Manuell
```
ollama-code> /model gpt-oss:20b
Switched to model: gpt-oss:20b

ollama-code> Erkläre mir das Repository-Pattern
[Nutzt jetzt GPT-OSS für Erklärung]
```

## Konfiguration

Die Konfiguration wird in `~/.ollama-code/config.json` gespeichert:

```json
{
  "ollamaUrl": "http://localhost:11434",
  "defaultModel": "qwen3-coder:30b",
  "temperature": 0.7,
  "maxTokens": 4096
}
```

### Umgebungsvariablen

```bash
# Ollama-Server-URL ändern
export OLLAMA_URL=http://192.168.1.100:11434

# Default-Modell setzen
export DEFAULT_MODEL=llama3.1:8b

# Dann starten
npm run dev
```

## Erweiterte Nutzung

### Mit spezifischem Modell starten

Bearbeite `~/.ollama-code/config.json`:
```json
{
  "defaultModel": "gpt-oss:20b"
}
```

### Verbose-Modus für Debugging

```
ollama-code> /verbose
Verbose mode: ON

ollama-code> Lies die package.json
[Iteration 1]
Tool calls: read_file
[Zeigt detaillierte Tool-Ausführung]
```

### Mehrere Operationen kombinieren

```
ollama-code> Suche alle .ts Dateien, lies die erste und erstelle eine Zusammenfassung

[System kombiniert:]
1. glob Tool (*.ts Dateien finden)
2. read_file Tool (erste Datei lesen)
3. LLM (Zusammenfassung erstellen)
```

## Tipps & Tricks

### 1. Klare Anweisungen
```
❌ "Mach was mit der Datei"
✅ "Lies src/cli.ts und erkläre die main Funktion"
```

### 2. Schrittweise vorgehen
```
ollama-code> Lies zuerst die package.json
[Wartet auf Antwort]

ollama-code> Jetzt erstelle eine ähnliche für ein neues Projekt
[Nutzt Kontext aus vorheriger Antwort]
```

### 3. Konversation löschen bei Themenwechsel
```
ollama-code> /clear
Conversation history cleared

ollama-code> [Neues Thema starten]
```

## Fehlerbehebung

### Ollama nicht erreichbar
```bash
# Prüfen ob Ollama läuft
ollama list

# Falls nicht, starten:
ollama serve
```

### Modell nicht verfügbar
```bash
# Modell herunterladen
ollama pull qwen3-coder:30b
ollama pull gpt-oss:20b
```

### "ripgrep not found"
```bash
# Auf Fedora:
sudo dnf install ripgrep

# Dann neu starten
npm run dev
```

### Port-Konflikt
```bash
# Ollama-Port ändern
export OLLAMA_HOST=0.0.0.0:11435
ollama serve
```

Dann in `~/.ollama-code/config.json`:
```json
{
  "ollamaUrl": "http://localhost:11435"
}
```

## Nächste Schritte

1. **Erkunde die Modelle**
   ```
   ollama-code> /models
   [Zeigt alle verfügbaren Modelle]
   ```

2. **Teste verschiedene Tasks**
   - Code-Generierung mit Qwen3-Coder
   - Reasoning mit GPT-OSS
   - Schnelle Aufgaben mit Llama 3.1

3. **Erstelle eigene Workflows**
   - Kombiniere Tools
   - Nutze Konversationshistorie
   - Experimentiere mit Prompts

## Ressourcen

- **Ollama Docs**: https://ollama.ai/docs
- **Qwen Models**: https://ollama.com/library/qwen
- **GPT-OSS**: https://ollama.com/library/gpt-oss
- **Project README**: `README.md`
- **Implementation Details**: `IMPLEMENTATION.md`

---

**Viel Erfolg mit Ollama Code!** 🚀
