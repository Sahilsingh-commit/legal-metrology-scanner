from fastapi import FastAPI, UploadFile, File
from paddleocr import PaddleOCR
import cv2
import numpy as np

app = FastAPI()

ocr = PaddleOCR(
    text_detection_model_name="PP-OCRv4_mobile_det",
    text_recognition_model_name="PP-OCRv4_mobile_rec",
    device="cpu",
    enable_mkldnn=False,
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
)

@app.post("/extract")
async def extract(file: UploadFile = File(...)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    result = ocr.predict(img)

    text_blocks = []
    for res in result:
        texts = res['rec_texts']
        scores = res['rec_scores']
        boxes = res['rec_boxes']
        for i in range(len(texts)):
            box = boxes[i].tolist()  # convert numpy array to plain list
            text_blocks.append({
                "text": texts[i],
                "bbox": box,
                "confidence": round(float(scores[i]), 4)
            })

    return {"text_blocks": text_blocks}