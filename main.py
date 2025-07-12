from fastapi import FastAPI, UploadFile, File, Body, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from PIL import Image, ImageDraw, ImageFont
import io
import os
from google import genai
from google.genai import types
from dotenv import load_dotenv
import json
import colorsys
from typing import List, Dict

# ---------------------------------------------------------------------------
# Lightweight heuristics: mapping of object label -> extra default parts
# ---------------------------------------------------------------------------
COMMON_PARTS_MAP = {
    "table": [
        {"part": "wood screws", "material": "steel", "cost": 0.1},
        {"part": "wood glue", "material": "PVA adhesive", "cost": 0.5}
    ],
    "chair": [
        {"part": "wood screws", "material": "steel", "cost": 0.08},
        {"part": "felt floor glides", "material": "felt", "cost": 0.2}
    ],
    "laptop": [
        {"part": "assembly screws", "material": "steel", "cost": 0.05},
        {"part": "thermal paste", "material": "silicone", "cost": 0.3}
    ]
}

def inject_common_parts(objects: List[Dict]) -> None:
    """Mutate objects list in-place, appending common parts if missing."""
    for obj in objects:
        label = obj.get("label", "").lower()
        defaults = COMMON_PARTS_MAP.get(label)
        if not defaults:
            continue
        existing_parts = {p.get("part", "").lower() for p in obj.get("parts", [])}
        for d in defaults:
            if d["part"].lower() not in existing_parts:
                obj.setdefault("parts", []).append(d.copy())


load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI()

# Allow local frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_distinct_colors(n):
    """Generate n distinct colors using HSV color space"""
    colors = []
    for i in range(n):
        hue = i / n
        # Use high saturation and value for vibrant colors
        rgb = colorsys.hsv_to_rgb(hue, 0.9, 0.9)
        colors.append(tuple(int(c * 255) for c in rgb))
    return colors

async def get_real_time_prices(parts_list: List[Dict]) -> List[Dict]:
    """Get real-time price estimates via batched Gemini Google-Search grounding.
    We group unique (part, material) combos into batches of up to 5 to stay under
    the free-tier request quota (~10 rpm).
    """

    # --- prepare unique lookup keys -------------------------------------------------
    unique: Dict[str, Dict] = {}
    for p in parts_list:
        k = f"{p['part']}|{p['material']}"
        if k not in unique:
            # shallow copy keeps refr correctly updated later
            unique[k] = p

    if not unique:
        return parts_list

    # Gemini grounding tool
    grounding_tool = types.Tool(google_search=types.GoogleSearch())
    gen_cfg = types.GenerateContentConfig(tools=[grounding_tool])

    keys = list(unique.keys())
    BATCH_SIZE = 5

    for start in range(0, len(keys), BATCH_SIZE):
        batch_keys = keys[start:start + BATCH_SIZE]
        # Build a single search query listing all items
        items_desc = ", ".join([f"{unique[k]['part']} made of {unique[k]['material']}" for k in batch_keys])
        search_query = f"average market price (USD 2024) of: {items_desc}. Give concise answers."

        try:
            search_resp = client.models.generate_content(
                model="gemini-2.5-pro",
                contents=search_query,
                config=gen_cfg
            )
            # Ask Gemini to turn the search results into JSON mapping
            format_prompt = (
                "Return ONLY valid JSON mapping of 'part_material' to price number in USD,"
                " where 'part_material' is in the form 'part|material'.\n"
                f"Part_material keys expected: {batch_keys}."
            )
            json_resp = client.models.generate_content(
                model="gemini-2.5-pro",
                contents=format_prompt + "\n\nSearch results:\n" + search_resp.text
            )
            try:
                price_map = json.loads(json_resp.text.strip().replace('```json','').replace('```',''))
            except json.JSONDecodeError:
                price_map = {}
        except Exception as e:
            print("Batch price lookup failed:", e)
            price_map = {}

        # Update the unique dict with any prices we parsed
        for k in batch_keys:
            item = unique[k]
            if k in price_map:
                try:
                    item['cost'] = round(float(price_map[k]), 2)
                    item['price_source'] = 'market_research'
                except (ValueError, TypeError):
                    item.setdefault('price_source', 'ai_estimate')
            else:
                item.setdefault('price_source', 'ai_estimate')

    # propagate back to original list
    for p in parts_list:
        k = f"{p['part']}|{p['material']}"
        upd = unique.get(k, {})
        p['cost'] = upd.get('cost', p['cost'])
        p['price_source'] = upd.get('price_source', p.get('price_source', 'ai_estimate'))

    return parts_list

async def get_bom_from_image(image_bytes: bytes, filename: str, use_real_prices: bool = False):
    image = Image.open(io.BytesIO(image_bytes))
    image.thumbnail([1024, 1024], Image.Resampling.LANCZOS)

    # Use segmentation + reasoning prompt
    prompt = (
        "You are a mechanical reasoning and cost estimation assistant. Analyze this image.\n"
        "Step 1: List all distinct physical objects in the image.\n"
        "Step 2: For each object, draw a bounding box and label it.\n"
        "Step 3: For each object, list its parts.\n"
        "Step 4: For each part, estimate the likely material and cost in USD.\n"
        "Return a JSON list of objects. Each object should include:\n"
        "- 'label': object name\n"
        "- 'box_2d': bounding box in [y0, x0, y1, x1] as floats in [0,1]\n"
        "- 'parts': list of {'part':..., 'material':..., 'cost':...}\n"
    )

    response = client.models.generate_content(
        model="gemini-2.0-flash-exp",
        contents=[prompt, image],
    )

    text = response.text.strip().replace("```json", "").replace("```", "")
    try:
        objects = json.loads(text)
        # Inject heuristic common parts
        inject_common_parts(objects)
    except Exception:
        return {"error": "Failed to parse response", "raw_response": text}

    # Generate distinct colors for each object
    colors = get_distinct_colors(len(objects))
    
    # Create a copy for drawing
    overlay_image = image.copy()
    draw = ImageDraw.Draw(overlay_image)
    
    # Try to use a better font, fallback to default
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
    except:
        font = ImageFont.load_default()

    total_cost = 0
    bom = []
    color_map = {}

    for idx, obj in enumerate(objects):
        label = obj["label"]
        box = obj.get("box_2d")
        parts = obj.get("parts", [])
        color = colors[idx]
        color_map[label] = f"rgb({color[0]}, {color[1]}, {color[2]})"

        # Draw bounding box with unique color
        if box and len(box) == 4:
            y0 = int(box[0] * image.size[1])
            x0 = int(box[1] * image.size[0])
            y1 = int(box[2] * image.size[1])
            x1 = int(box[3] * image.size[0])
            
            # Draw thicker box for better visibility
            for i in range(3):
                draw.rectangle([x0-i, y0-i, x1+i, y1+i], outline=color, width=2)
            
            # Draw label background
            text_bbox = draw.textbbox((x0, y0 - 25), label, font=font)
            draw.rectangle([text_bbox[0]-5, text_bbox[1]-2, text_bbox[2]+5, text_bbox[3]+2], 
                          fill=color)
            draw.text((x0, y0 - 25), label, fill="white", font=font)

    # Aggregate parts across all detected objects
    all_parts = []
    for obj_idx, obj in enumerate(objects):
        label = obj["label"]
        for part in obj.get("parts", []):
            cost = round(float(part.get("cost", 0)), 2)
            all_parts.append({
                "object": label,
                "part": part.get("part"),
                "material": part.get("material"),
                "cost": cost,
                "color": color_map[label]
            })
            total_cost += cost

    # Optionally fetch real-time prices
    if use_real_prices:
        all_parts = await get_real_time_prices(all_parts)
        total_cost = sum(p["cost"] for p in all_parts)

    # Save overlay image (rotate for portrait images)
    os.makedirs("static/outputs", exist_ok=True)
    overlay_image_rotated = overlay_image.rotate(-90, expand=True)
    overlay_path = f"static/outputs/{filename.replace(' ', '_')}"
    overlay_image_rotated.save(overlay_path, quality=95)

    # Build objects metadata for frontend selection
    objects_meta = []
    for idx, obj in enumerate(objects):
        objects_meta.append({
            "label": obj.get("label"),
            "bbox": obj.get("box_2d"),
            "color": color_map.get(obj.get("label")),
            "parts": obj.get("parts", [])
        })

    # Final structured response
    return {
        "bom": all_parts,
        "total_cost": round(total_cost, 2),
        "overlay_url": f"/static/outputs/{os.path.basename(overlay_path)}",
        "color_map": color_map,
        "objects": objects_meta
    }

@app.post("/api/analyze-image")
async def analyze_image(file: UploadFile = File(...), use_real_prices: bool = False):
    try:
        image_bytes = await file.read()
        result = await get_bom_from_image(image_bytes, file.filename, use_real_prices)
        return result
    except Exception as e:
        return {"error": str(e)}

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.post("/api/instructions")
async def generate_instructions(payload: Dict = Body(...)):
    """Generate manufacturing instructions for a selected object.
    Expected payload: {"label": str, "parts": List[{part, material, cost}]}
    """
    label = payload.get("label")
    parts = payload.get("parts", [])
    if not label or not parts:
        raise HTTPException(status_code=400, detail="label and parts required")

    # Build BOM description
    parts_desc = "\n".join([f"- {p['part']} ({p['material']})" for p in parts])
    prompt = (
        f"You are an experienced manufacturing engineer. Provide detailed, step-by-step manufacturing "
        f"instructions for building a {label}. The bill of materials is:\n{parts_desc}\n" 
        "Cover machining/assembly processes, recommended tolerances, tools, and quality checks. "
        "Return the instructions as markdown numbered list."
    )
    try:
        resp = client.models.generate_content(
            model="gemini-1.5-pro-latest",
            contents=prompt
        )
        instructions = resp.text.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"label": label, "instructions": instructions}

@app.get("/")
async def read_index():
    return FileResponse('static/index.html')