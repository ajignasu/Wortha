from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from PIL import Image, ImageDraw, ImageFont
import io
import os
from google import genai
from dotenv import load_dotenv
import json
import colorsys

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

def get_bom_from_image(image_bytes: bytes, filename: str):
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

        # Add parts to BOM
        for part in parts:
            bom.append({
                "object": label,
                "part": part.get("part"),
                "material": part.get("material"),
                "cost": round(float(part.get("cost", 0)), 2),
                "color": color_map[label]
            })
            total_cost += float(part.get("cost", 0))

    # Save overlay image - rotate 90 degrees clockwise before saving
    os.makedirs("static/outputs", exist_ok=True)
    overlay_image_rotated = overlay_image.rotate(-90, expand=True)
    overlay_path = f"static/outputs/{filename.replace(' ', '_')}"
    overlay_image_rotated.save(overlay_path, quality=95)

    return {
        "bom": bom,
        "total_cost": round(total_cost, 2),
        "overlay_url": f"/static/outputs/{os.path.basename(overlay_path)}",
        "color_map": color_map
    }

@app.post("/api/analyze-image")
async def analyze_image(file: UploadFile = File(...)):
    try:
        image_bytes = await file.read()
        result = get_bom_from_image(image_bytes, file.filename)
        return result
    except Exception as e:
        return {"error": str(e)}

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_index():
    return FileResponse('static/index.html')