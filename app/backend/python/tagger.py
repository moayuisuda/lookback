#!/usr/bin/env python3

import json
import sys
import os
from typing import List, Tuple, Optional
import warnings
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "120")
os.environ.setdefault("HF_HUB_ETAG_TIMEOUT", "30")

warnings.filterwarnings("ignore", category=UserWarning, module="transformers")

import torch
from PIL import Image, ImageStat
from transformers import CLIPModel, CLIPProcessor
import colorsys


_MODEL: Optional[CLIPModel] = None
_PROCESSOR: Optional[CLIPProcessor] = None
_DEVICE: Optional[torch.device] = None

_MODEL_ID = "openai/clip-vit-large-patch14"


def _load_image(path: str) -> Image.Image:
    image = Image.open(path)
    return image.convert("RGB")


def _get_model_dir() -> str:
    configured = os.environ.get("PROREF_MODEL_DIR", "").strip()
    if configured:
        return configured
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(script_dir, "..", "..", "electron", "model"))


def _has_required_model_files(model_dir: str) -> bool:
    if not os.path.isdir(model_dir):
        return False
    has_config = os.path.isfile(os.path.join(model_dir, "config.json"))
    has_weights_safe = os.path.isfile(os.path.join(model_dir, "model.safetensors"))
    has_processor = os.path.isfile(os.path.join(model_dir, "preprocessor_config.json"))
    has_tokenizer_json = os.path.isfile(os.path.join(model_dir, "tokenizer.json"))
    return has_config and has_weights_safe and has_processor and has_tokenizer_json


def _emit(event: dict) -> None:
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


def _download_model_with_progress(model_dir: str) -> None:
    try:
        from huggingface_hub import hf_hub_download
    except Exception as e:
        raise RuntimeError(f"huggingface_hub import failed: {e}")
    import time
    import urllib.request
    from huggingface_hub.file_download import hf_hub_url, get_hf_file_metadata

    os.makedirs(model_dir, exist_ok=True)
    required_files = [
        "config.json",
        "preprocessor_config.json",
        "tokenizer.json",
    ]

    weights_candidates = ["model.safetensors"]
    total = len(required_files) + len(weights_candidates)

    def _is_not_found(err: Exception) -> bool:
        message = str(err)
        return "404" in message or "Entry Not Found" in message

    def download_file(filename: str, current: int, total: int, optional: bool = False) -> bool:
        # Check if file already exists locally
        final_path = os.path.join(model_dir, filename)
        if os.path.isfile(final_path):
             _emit(
                {
                    "type": "file",
                    "filename": filename,
                    "current": current,
                    "total": total,
                    "attempt": 1,
                    "maxAttempts": 5,
                }
            )
             return True

        max_attempts = 5
        attempt = 1
        while True:
            _emit(
                {
                    "type": "file",
                    "filename": filename,
                    "current": current,
                    "total": total,
                    "attempt": attempt,
                    "maxAttempts": max_attempts,
                }
            )
            try:
                hf_hub_download(
                    repo_id=_MODEL_ID,
                    filename=filename,
                    local_dir=model_dir,
                    force_download=False, # Use cache if available
                    resume_download=True  # Resume if possible
                )
                return True
            except Exception as e:
                # If download failed, try to clean up potential lock files or temp files if accessible
                # huggingface_hub manages its own locks, but we can catch errors
                pass

                if optional and _is_not_found(e):
                    _emit({"type": "optional-missing", "filename": filename, "message": str(e)})
                    return False
                if attempt >= max_attempts:
                    raise
                wait_s = min(60, 2**attempt)
                _emit(
                    {
                        "type": "retry",
                        "filename": filename,
                        "attempt": attempt,
                        "nextWaitSeconds": wait_s,
                        "message": str(e),
                    }
                )
                time.sleep(wait_s)
                attempt += 1

    _emit({"type": "start", "model": _MODEL_ID, "modelDir": model_dir, "totalFiles": total})

    current_index = 1
    for filename in required_files:
        download_file(filename, current_index, total)
        current_index += 1
    for filename in optional_files:
        download_file(filename, current_index, total, optional=True)
        current_index += 1

    def download_weight_with_progress(filename: str, step_index: int, total_steps: int) -> bool:
        # Check if file already exists locally
        final_path = os.path.join(model_dir, filename)
        if os.path.isfile(final_path):
             _emit(
                {
                    "type": "file",
                    "filename": filename,
                    "current": step_index,
                    "total": total_steps,
                    "attempt": 1,
                    "maxAttempts": 5,
                }
            )
             return True

        max_attempts = 5
        attempt = 1
        while True:
            temp_path = ""
            try:
                url = hf_hub_url(repo_id=_MODEL_ID, filename=filename)
                total_bytes: Optional[int] = None
                try:
                    meta = get_hf_file_metadata(url)
                    total_bytes = getattr(meta, "size", None)
                except Exception as meta_err:
                    if _is_not_found(meta_err):
                        _emit({"type": "weight-missing", "filename": filename, "message": str(meta_err)})
                        return False
                final_path = os.path.join(model_dir, filename)
                temp_path = final_path + ".download"
                if os.path.isfile(final_path):
                    _emit(
                        {
                            "type": "file",
                            "filename": filename,
                            "current": step_index,
                            "total": total_steps,
                            "attempt": attempt,
                            "maxAttempts": max_attempts,
                        }
                    )
                    return True
                
                # If temp file exists (from interrupted download), remove it to restart fresh
                # or we could implement resume, but for now let's ensure we don't get stuck
                resume_bytes = 0
                headers = {}
                mode = 'wb'
                if os.path.isfile(temp_path):
                     resume_bytes = os.path.getsize(temp_path)
                     if resume_bytes > 0:
                         headers['Range'] = f"bytes={resume_bytes}-"
                         mode = 'ab'

                req = urllib.request.Request(url, headers=headers)
                current_bytes = resume_bytes
                last_emit = 0.0
                
                try:
                    resp = urllib.request.urlopen(req)
                except urllib.error.HTTPError as e:
                    # Handle 416 Range Not Satisfiable (e.g. file changed or fully downloaded)
                    if e.code == 416:
                        if os.path.isfile(temp_path):
                            os.remove(temp_path)
                        resume_bytes = 0
                        headers = {}
                        mode = 'wb'
                        req = urllib.request.Request(url, headers=headers)
                        resp = urllib.request.urlopen(req)
                    else:
                        raise e

                # Check if server accepted range
                if resp.getcode() == 206:
                    pass # Resuming
                else:
                    # Server sent full file or ignored range
                    resume_bytes = 0
                    mode = 'wb'
                    current_bytes = 0

                with resp, open(temp_path, mode) as f:
                    if total_bytes is None:
                        header_len = resp.headers.get("Content-Length")
                        if header_len:
                            try:
                                total_bytes = int(header_len) + resume_bytes
                            except Exception:
                                total_bytes = None
                    while True:
                        chunk = resp.read(1024 * 1024)
                        if not chunk:
                            break
                        f.write(chunk)
                        current_bytes += len(chunk)
                        if total_bytes:
                            now = time.time()
                            if now - last_emit >= 0.2:
                                _emit(
                                    {
                                        "type": "file-progress",
                                        "filename": filename,
                                        "currentBytes": current_bytes,
                                        "totalBytes": total_bytes,
                                        "stepIndex": step_index,
                                        "totalSteps": total_steps,
                                    }
                                )
                                last_emit = now
                if total_bytes:
                    _emit(
                        {
                            "type": "file-progress",
                            "filename": filename,
                            "currentBytes": current_bytes,
                            "totalBytes": total_bytes,
                            "stepIndex": step_index,
                            "totalSteps": total_steps,
                        }
                    )
                os.replace(temp_path, final_path)
                _emit(
                    {
                        "type": "file",
                        "filename": filename,
                        "current": step_index,
                        "total": total_steps,
                        "attempt": attempt,
                        "maxAttempts": max_attempts,
                    }
                )
                return True
            except Exception as e:
                if temp_path and os.path.isfile(temp_path):
                    try:
                        os.remove(temp_path)
                    except Exception:
                        pass
                if _is_not_found(e):
                    _emit({"type": "weight-missing", "filename": filename, "message": str(e)})
                    return False
                if attempt >= max_attempts:
                    _emit({"type": "weight-failed", "filename": filename, "message": str(e)})
                    return False
                wait_s = min(60, 2**attempt)
                _emit(
                    {
                        "type": "retry",
                        "filename": filename,
                        "attempt": attempt,
                        "nextWaitSeconds": wait_s,
                        "message": str(e),
                    }
                )
                time.sleep(wait_s)
                attempt += 1

    weight_ok = False
    weight_index = current_index
    for filename in weights_candidates:
        if download_weight_with_progress(filename, weight_index, total):
            weight_ok = True
            break
    if weight_ok:
        current_index += 1

    if not weight_ok:
        raise RuntimeError("failed to download model weights")

    _emit({"type": "done", "modelDir": model_dir})


def _ensure_model_downloaded(model_dir: str) -> None:
    os.makedirs(model_dir, exist_ok=True)
    if _has_required_model_files(model_dir):
        return
    model = CLIPModel.from_pretrained(_MODEL_ID)
    processor = CLIPProcessor.from_pretrained(_MODEL_ID, use_fast=True)
    model.save_pretrained(model_dir)
    processor.save_pretrained(model_dir)


def _get_clip() -> Tuple[CLIPModel, CLIPProcessor, torch.device]:
    global _MODEL, _PROCESSOR, _DEVICE
    if _MODEL is None or _PROCESSOR is None or _DEVICE is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model_dir = _get_model_dir()
        _ensure_model_downloaded(model_dir)
        model = CLIPModel.from_pretrained(model_dir)
        processor = CLIPProcessor.from_pretrained(model_dir, use_fast=True)
        model.to(device)
        model.eval()
        _MODEL = model
        _PROCESSOR = processor
        _DEVICE = device
    return _MODEL, _PROCESSOR, _DEVICE


def encode_image(path: str) -> List[float]:
    model, processor, device = _get_clip()
    image = _load_image(path)
    inputs = processor(images=image, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        image_features = model.get_image_features(**inputs)
        image_features = image_features / image_features.norm(dim=-1, keepdim=True)
    return image_features[0].cpu().tolist()


def encode_text(text: str) -> List[float]:
    model, processor, device = _get_clip()
    inputs = processor(text=[text], return_tensors="pt", padding=True)
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        text_features = model.get_text_features(**inputs)
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)
    return text_features[0].cpu().tolist()


def dominant_color(path: str) -> str:
    try:
        # Open image and ensure RGB mode
        img = Image.open(path)
        # Use white background for transparent images to better match human perception
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            bg.paste(img, mask=img.split()[3])
            image = bg
        else:
            image = img.convert("RGB")
            
        # Resize for performance
        image.thumbnail((150, 150))

        # Quantize to 5 colors to find dominant clusters
        # Using PIL's built-in quantization (usually Median Cut)
        quantized = image.quantize(colors=5)
        
        # Get palette and counts
        palette = quantized.getpalette()
        counts = quantized.getcolors(maxcolors=256)
        
        # Sort by count descending
        counts.sort(key=lambda x: x[0], reverse=True)
        
        def get_rgb(index):
            return (
                palette[index * 3],
                palette[index * 3 + 1],
                palette[index * 3 + 2]
            )
            
        # Scoring system to match human perception
        # Humans prefer vibrant and bright colors over dark/dull ones, unless the image is truly dark.
        best_score = -1.0
        best_hex = "#808080"
        
        total_pixels = sum(c[0] for c in counts)
        
        for count, index in counts:
            rgb = get_rgb(index)
            r, g, b = rgb
            
            # Convert to HSV
            h, s, v = colorsys.rgb_to_hsv(r/255.0, g/255.0, b/255.0)
            
            dominance = count / total_pixels
            
            # Base score is dominance
            score = dominance
            
            # Boost for Saturation (0.0 - 1.0)
            # We like colorful things.
            score *= (1.0 + s * 1.5)
            
            # Boost for Value (0.0 - 1.0)
            # We prefer brighter colors (solves "too dark" perception).
            score *= (1.0 + v * 1.2)
            
            # Penalty for very dark colors (unless they are super dominant)
            if v < 0.2:
                score *= 0.1
                
            # Penalty for near-whites/grays (boring)
            if s < 0.1 and v > 0.8:
                score *= 0.5
                
            if score > best_score:
                best_score = score
                best_hex = "#{:02x}{:02x}{:02x}".format(r, g, b)
        
        return best_hex
        
    except Exception as e:
        sys.stderr.write(f"dominant_color error: {e}\n")
        return "#808080"


def calculate_tone(path: str) -> str:
    try:
        # Convert to grayscale to analyze luminance
        img = Image.open(path).convert('L')
        # Resize for performance, but keep enough detail for histogram
        img.thumbnail((150, 150))
        
        # Get histogram (256 levels)
        hist = img.histogram()
        total_pixels = sum(hist)
        
        if total_pixels == 0:
            return "mid-mid"

        # === 1. Determine Key (Brightness) - Based on Region Distribution ===
        # Regions: Shadows (0-85), Midtones (86-170), Highlights (171-255)
        # Thresholds are roughly at 1/3 and 2/3
        shadow_pixels = sum(hist[i] for i in range(86))
        highlight_pixels = sum(hist[i] for i in range(171, 256))
        
        p_shadow = shadow_pixels / total_pixels
        p_high = highlight_pixels / total_pixels
        
        # Calculate weighted mean luminance as auxiliary check
        mean_lum = sum(i * hist[i] for i in range(256)) / total_pixels
        
        # Logic:
        # High Key: High % in highlights (>60%) OR very high mean (>180)
        if p_high > 0.6 or mean_lum > 180:
            key = "high"
        # Low Key: High % in shadows (>60%) OR very low mean (<75)
        elif p_shadow > 0.6 or mean_lum < 75:
            key = "low"
        else:
            key = "mid"
            
        # === 2. Determine Range (Contrast) - Based on Dynamic Range ===
        # Calculate 5th percentile (p5) and 95th percentile (p95) to ignore outliers
        cumulative = 0
        p5_idx = -1
        p95_idx = 255
        
        for i in range(256):
            cumulative += hist[i]
            frac = cumulative / total_pixels
            if frac >= 0.05 and p5_idx == -1:
                p5_idx = i
            if frac >= 0.95:
                p95_idx = i
                break
        
        # Safety check
        if p5_idx == -1: p5_idx = 0
                
        # Calculate effective dynamic range
        dynamic_range = p95_idx - p5_idx
        
        # Logic:
        # Short Range: Range < 100 (approx < 40% of histogram), low contrast
        if dynamic_range < 100:
            tone_range = "short"
        # Long Range: Range > 190 (approx > 75% of histogram), high contrast
        elif dynamic_range > 190:
            tone_range = "long"
        else:
            tone_range = "mid"
            
        return f"{key}-{tone_range}"
    except Exception as e:
        sys.stderr.write(f"calculate_tone error: {e}\n")
        return "mid-mid"


def main() -> None:
    if "--download-model" in sys.argv:
        model_dir = _get_model_dir()
        try:
            _download_model_with_progress(model_dir)
            ok = _has_required_model_files(model_dir)
            _emit({"type": "verify", "ok": ok})
            sys.exit(0 if ok else 2)
        except Exception as e:
            import traceback
            traceback.print_exc(file=sys.stderr)
            _emit({"type": "error", "message": str(e)})
            sys.exit(1)

    sys.stderr.write("[INFO] Python index service started\n")
    sys.stderr.flush()

    # Lazy load model only when needed
    # _get_clip() 
    # sys.stderr.write("[INFO] Model loaded\n")
    # sys.stderr.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
            mode = req.get("mode")
            arg = req.get("arg")

            if mode == "encode-image":
                vector = encode_image(arg)
                result = {"vector": vector}
            elif mode == "encode-text":
                vector = encode_text(arg)
                result = {"vector": vector}
            elif mode == "dominant-color":
                result = {"dominantColor": dominant_color(arg)}
            elif mode == "calculate-tone":
                result = {"tone": calculate_tone(arg)}
            else:
                result = {"error": f"unknown mode: {mode}"}

            sys.stdout.write(json.dumps(result) + "\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"error": str(e)}) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
