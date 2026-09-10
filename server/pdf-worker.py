# Runs only inside pdf.mjs's networkless, credential-free Bubblewrap boundary.
from contextlib import closing
import json
import math
import os
import subprocess
import sys

sys.path.insert(0, '/pdfium')
import pypdfium2 as pdfium
import pypdfium2.raw as raw


def send(**event):
    print(json.dumps(event, ensure_ascii=False), flush=True)


class InvalidPdf(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message


def fail(code, message):
    raise InvalidPdf(code, message)


def extract():
    with pdfium.PdfDocument('/work/input.pdf') as doc:
        if len(doc) > 10:
            fail('PDF_PAGES', 'Choose a PDF with at most 10 pages.')
        if not len(doc):
            fail('PDF_INVALID', 'This PDF has no readable pages.')
        pages, warnings, total = [], [], 0
        for index in range(len(doc)):
            number = index + 1
            send(type='progress', progress=index / len(doc), message=f'Reading page {number} of {len(doc)}…')
            with closing(doc[index]) as page:
                width, height = page.get_size()
                if not all(math.isfinite(n) and 0 < n <= 3000 for n in (width, height)):
                    fail('PDF_RESOURCE', 'A page is too large to process safely.')
                image_pixels, text_objects = 0, []
                for count, obj in enumerate(page.get_objects(max_depth=16), 1):
                    if count > 10000 or (obj.type == raw.FPDF_PAGEOBJ_FORM and obj.level >= 15):
                        fail('PDF_RESOURCE', 'A page is too complex to process safely.')
                    if obj.type == raw.FPDF_PAGEOBJ_TEXT:
                        text_objects.append(obj)
                    if obj.type == raw.FPDF_PAGEOBJ_IMAGE:
                        w, h = obj.get_px_size()
                        image_pixels += w * h
                        if not w or not h or image_pixels > 16000000:
                            fail('PDF_RESOURCE', 'A scan is too large to process safely.')
                with closing(page.get_textpage()) as textpage:
                    # PDFium truncates individual text objects at 32767 chars; reject saturation.
                    if any(raw.FPDFTextObj_GetText(obj, textpage, None, 0) >= 65536 for obj in text_objects):
                        fail('PDF_TEXT', 'A text section is too long to read safely. Try a shorter passage.')
                    if textpage.count_chars() + total > 200000:
                        fail('PDF_TEXT', 'This PDF contains too much text. Try a shorter passage.')
                    text = textpage.get_text_range().replace('\r\n', '\n').strip()
                if image_pixels or not text:
                    send(type='progress', progress=(index + .5) / len(doc), message=f'Reading Spanish scan, page {number} of {len(doc)}…')
                    scale = min(2, math.sqrt(3900000 / (width * height)))
                    if math.ceil(width * scale) * math.ceil(height * scale) > 4000000:
                        fail('PDF_RESOURCE', 'A scan is too large to process safely.')
                    with closing(page.render(scale=scale, rev_byteorder=True, force_bitmap_format=raw.FPDFBitmap_BGR)) as bitmap:
                        with open('/tmp/page.ppm', 'wb') as image:
                            image.write(f'P6\n{bitmap.width} {bitmap.height}\n255\n'.encode())
                            view = memoryview(bitmap.buffer).cast('B')
                            for row in range(bitmap.height):
                                image.write(view[row * bitmap.stride:row * bitmap.stride + bitmap.width * 3])
                    try:
                        # File size is capped by inherited RLIMIT_FSIZE, without buffering untrusted OCR output.
                        with open('/tmp/ocr.txt', 'w+b') as output:
                            subprocess.run(['/usr/bin/tesseract', '/tmp/page.ppm', 'stdout', '--tessdata-dir', '/tessdata', '-l', 'spa', '--psm', '3'], stdout=output, stderr=subprocess.DEVNULL, timeout=15, check=True)
                            output.seek(0)
                            ocr = output.read(800001)
                        if len(ocr) > 800000:
                            fail('PDF_TEXT', 'This PDF contains too much text. Try a shorter passage.')
                        ocr = ocr.decode('utf-8', errors='replace').strip()
                    except (subprocess.SubprocessError, OSError):
                        fail('PDF_OCR', f'Page {number} could not be read as a scan. Try a clearer PDF.')
                    finally:
                        for name in ('/tmp/page.ppm', '/tmp/ocr.txt'):
                            if os.path.exists(name):
                                os.unlink(name)
                    if ocr:
                        # Avoid duplicating selectable text already reproduced by OCR.
                        text = ocr if not text or ' '.join(text.split()) in ' '.join(ocr.split()) else text + '\n' + ocr
                        warnings.append(f'Page {number} used Spanish OCR. Check names, accents, and punctuation before confirming.')
                elif len(''.join(text.split())) < 40:
                    warnings.append(f'Page {number} has little selectable text. Check it before confirming.')
                total += len(text.encode('utf-16-le')) // 2
                if total > 200000:
                    fail('PDF_TEXT', 'This PDF contains too much text. Try a shorter passage.')
                if not text:
                    warnings.append(f'Page {number} has no readable text. You can leave it blank or add corrected text before confirming.')
                pages.append(dict(page=number, text=text))
        if not any(page['text'] for page in pages):
            fail('PDF_UNREADABLE', 'No readable text was found. Try a clearer scan or a PDF with selectable text.')
        send(type='progress', progress=1, message='Text is ready for you to check.')
        send(type='result', result=dict(pages=pages, warnings=warnings))


try:
    extract()
except InvalidPdf as error:
    send(type='error', code=error.code, message=error.message)
    sys.exit(1)
except Exception as error:
    password = getattr(error, 'err_code', None) == raw.FPDF_ERR_PASSWORD
    send(type='error', code='PDF_PASSWORD' if password else 'PDF_INVALID', message='This PDF is password protected. Upload an unlocked copy.' if password else 'This PDF is damaged or unreadable. Try another copy.')
    sys.exit(1)
