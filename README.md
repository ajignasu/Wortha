# Wortha – Scene-to-BOM Generator

Built on July 12, 2025 at AGI House Hackathon - Google AI Build Day v4.0.

Turn an image into a structured Bill of Materials, complete with cost, manufacturing instructions, and an interactive scene-graph.

## Features
• Drag-and-drop image upload (front-end).
• Google Gemini Vision API extraction of objects / parts / materials.
• Flask back-end assembles hierarchical BOM JSON.
• Interactive D3.js scene-graph visualisation (zoom, pan, tool-tips).
• Markdown-based manufacturing instructions panel.

## Tech Stack
Front-end: HTML, CSS (Tailwind-like custom), Vanilla JS, D3.js v7
Back-end: Python 3.11, Flask, OpenAI/Google Gemini APIs

## Quick Start
```bash
# 1. Clone repo
git clone https://github.com/ajignasu/Wortha
cd wortha

# 2. (Optional) create virtual env
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run server
python main.py

# 5. Open browser
http://localhost:5000
```

## File Structure (key parts)
```
static/
  index.html            # landing page & uploader
  scene-graph.html      # iframe rendering the D3 graph
  script.js             # front-end logic / postMessage bridge
  style.css             # global styles
main.py                 # Flask routes & API calls
README.md
```

## Usage
1. Visit the app and upload a GLTF/OBJ file.
2. Wait for processing; the sidebar will show object list & costs.
3. Click the “Scene Graph” tab to explore relationships.
4. Export BOM as CSV/JSON (button in UI).

## Environment Variables
Set these before running:
```
GEMINI_API_KEY=your_key_here  # or OPENAI_API_KEY
```
