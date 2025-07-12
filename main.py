from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from PIL import Image
import io
import os
from google import genai
from dotenv import load_dotenv

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

import json

# def get_bom_from_image(image_bytes: bytes, filename: str):
#     prompt = (
#         "You are a mechanical reasoning and cost estimation assistant. Analyze this image.\n"
#         "Step 1: List all distinct physical objects in the image.\n"
#         "Step 2: For each object, list its parts.\n"
#         "Step 3: For each part, estimate the likely material and cost in USD.\n"
#         "Respond ONLY in JSON format like:\n"
#         "{\n"
#         "  \"ObjectName\": [\n"
#         "    {\"part\": \"PartName\", \"material\": \"Material\", \"cost\": number}\n"
#         "  ]\n"
#         "}"
#     )

#     # Convert to PIL image
#     image = Image.open(io.BytesIO(image_bytes))

#     # Send directly to Gemini
#     response = client.models.generate_content(
#         model="gemini-2.5-flash",  # or gemini-pro-vision
#         contents=[prompt, image],
#     )

#     # Clean + parse output
#     text = response.text.strip().replace("```json", "").replace("```", "")
#     try:
#         bom_dict = json.loads(text)
#     except json.JSONDecodeError:
#         return {"error": "Failed to parse BOM from model response", "raw_response": text}

#     bom = []
#     total_cost = 0
#     for obj, parts in bom_dict.items():
#         for item in parts:
#             part = item.get("part")
#             material = item.get("material")
#             cost = float(item.get("cost", 0))
#             bom.append({
#                 "object": obj,
#                 "part": part,
#                 "material": material,
#                 "cost": round(cost, 2)
#             })
#             total_cost += cost

#     return {"bom": bom, "total_cost": round(total_cost, 2)}

def get_bom_from_image(image_bytes: bytes, filename: str):
    from PIL import ImageDraw, ImageFont

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
        model="gemini-2.5-flash",
        contents=[prompt, image],
    )

    text = response.text.strip().replace("```json", "").replace("```", "")
    try:
        objects = json.loads(text)
    except Exception:
        return {"error": "Failed to parse response", "raw_response": text}

    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()

    total_cost = 0
    bom = []

    for obj in objects:
        label = obj["label"]
        box = obj.get("box_2d")
        parts = obj.get("parts", [])

        # Draw bounding box
        if box and len(box) == 4:
            y0 = int(box[0] * image.size[1])
            x0 = int(box[1] * image.size[0])
            y1 = int(box[2] * image.size[1])
            x1 = int(box[3] * image.size[0])
            draw.rectangle([x0, y0, x1, y1], outline="red", width=3)
            draw.text((x0, y0 - 10), label, fill="white", font=font)

        # Add parts to BOM
        for part in parts:
            bom.append({
                "object": label,
                "part": part.get("part"),
                "material": part.get("material"),
                "cost": round(float(part.get("cost", 0)), 2)
            })
            total_cost += float(part.get("cost", 0))

    # Save overlay image
    os.makedirs("static/outputs", exist_ok=True)
    overlay_path = f"static/outputs/{filename.replace(' ', '_')}"
    image.save(overlay_path)

    return {
        "bom": bom,
        "total_cost": round(total_cost, 2),
        "overlay_url": f"/static/outputs/{os.path.basename(overlay_path)}"
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

