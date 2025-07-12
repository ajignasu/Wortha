from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from PIL import Image
import io
import os
from google import genai
# from google.generativeai.types import GenerationConfig
from dotenv import load_dotenv

load_dotenv()
# The google-generativeai library automatically looks for the API key in the
# GOOGLE_API_KEY environment variable. Make sure your .env file is updated.
# If you are still using GEMINI_API_KEY, you can uncomment the following line:
# client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
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

def get_bom_from_image(image_bytes: bytes, filename: str):
    prompt = (
        "You are a mechanical reasoning and cost estimation assistant. Analyze this image.\n"
        "Step 1: List all distinct physical objects in the image.\n"
        "Step 2: For each object, list its parts.\n"
        "Step 3: For each part, estimate the likely material and cost in USD.\n"
        "Respond ONLY in JSON format like:\n"
        "{\n"
        "  \"ObjectName\": [\n"
        "    {\"part\": \"PartName\", \"material\": \"Material\", \"cost\": number}\n"
        "  ]\n"
        "}"
    )

    # Convert to PIL image
    image = Image.open(io.BytesIO(image_bytes))

    # Send directly to Gemini
    response = client.models.generate_content(
        model="gemini-2.5-flash",  # or gemini-pro-vision
        contents=[prompt, image],
    )

    # Clean + parse output
    text = response.text.strip().replace("```json", "").replace("```", "")
    try:
        bom_dict = json.loads(text)
    except json.JSONDecodeError:
        return {"error": "Failed to parse BOM from model response", "raw_response": text}

    bom = []
    total_cost = 0
    for obj, parts in bom_dict.items():
        for item in parts:
            part = item.get("part")
            material = item.get("material")
            cost = float(item.get("cost", 0))
            bom.append({
                "object": obj,
                "part": part,
                "material": material,
                "cost": round(cost, 2)
            })
            total_cost += cost

    return {"bom": bom, "total_cost": round(total_cost, 2)}

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

#     # Upload the file to the Gemini API
#     uploaded_file = client.files.upload(
#         file_path="image.png",  # A temporary name
#         file_bytes=image_bytes,
#         display_name=filename
#     )

#     # response = client.models.generate_content(
#     #     model="gemini-pro-vision",
#     #     contents=[uploaded_file, prompt],
#     #     config=GenerationConfig(temperature=0.4)
#     # )

#     response = client.models.generate_content(
#         model="gemini-2.5-flash",
#         contents=[uploaded_file, prompt],
#     )

#     # Clean up the response and parse JSON
#     text = response.text.strip().replace("```json", "").replace("```", "")
#     try:
#         bom_dict = json.loads(text)
#     except json.JSONDecodeError:
#         # Fallback for non-JSON or malformed JSON responses
#         # This is a basic fallback, more sophisticated error handling could be added
#         return {"error": "Failed to parse BOM from model response", "raw_response": text}


#     # Flatten + total
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

