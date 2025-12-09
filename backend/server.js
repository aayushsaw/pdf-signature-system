// backend/server.js
const express = require('express');
const cors = require('cors');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/signed-pdfs', express.static('signed-pdfs'));

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'pdf_signature_system';


let db;

// Connect MongoDB
async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log('Connected to MongoDB');
}

// PDF hash
function computeHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Convert percent → PDF points
function convertCoordinates(coordinate, pageWidth, pageHeight) {
  const left = coordinate.x * pageWidth;
  const top = coordinate.y * pageHeight;
  const width = coordinate.width * pageWidth;
  const height = coordinate.height * pageHeight;
  const bottom = pageHeight - (top + height);
  return { x: left, y: bottom, width, height };
}

// Fit image with aspect ratio
function fitImageInBox(imgW, imgH, boxW, boxH, boxX, boxY) {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;

  return {
    x: boxX + (boxW - w) / 2,
    y: boxY + (boxH - h) / 2,
    width: w,
    height: h
  };
}

/* =======================================================================
 🖋 SIGN PDF ENDPOINT
======================================================================= */
app.post('/sign-pdf', async (req, res) => {
  try {
    const { pdfId, pdfBase64, signatureImageBase64, allFields } = req.body;

    console.log('Incoming /sign-pdf:', {
      hasPdfBase64: !!pdfBase64,
      pdfBase64Length: pdfBase64 ? pdfBase64.length : 0,
      fieldsCount: allFields ? allFields.length : 0
    });

    if (!pdfBase64) {
      return res.status(400).json({
        success: false,
        error: 'No PDF data provided (pdfBase64 missing)'
      });
    }

    if (!allFields || !Array.isArray(allFields) || allFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'allFields is empty or missing'
      });
    }

    // Decode PDF from base64 (supports both data URL + raw base64)
    let pdfBytes;
    try {
      let base64String = pdfBase64;
      if (pdfBase64.startsWith('data:application/pdf;base64,')) {
        base64String = pdfBase64.split(',')[1];
      }
      pdfBytes = Buffer.from(base64String, 'base64');
      console.log('Decoded PDF bytes:', pdfBytes.length);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid PDF base64: ' + e.message
      });
    }

    const originalHash = computeHash(pdfBytes);

    // Load PDF
    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes);
      console.log(`Loaded original PDF with ${pdfDoc.getPageCount()} pages`);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Unable to load PDF: ' + e.message
      });
    }

    // Embed a standard font once (for text/date)
    const helveticaFont = await pdfDoc.embedStandardFont(StandardFonts.Helvetica);

    /* ------------------------------------------------------------
     EMBED SIGNATURE IMAGE (if exists)
    ------------------------------------------------------------- */
    let signatureImage = null;
    let signatureDims = null;

    if (signatureImageBase64) {
      try {
        let sigData = signatureImageBase64;
        if (sigData.startsWith('data:image/')) {
          sigData = sigData.split(',')[1];
        }
        const sigBytes = Buffer.from(sigData, 'base64');
        signatureImage = await pdfDoc.embedPng(sigBytes);
        signatureDims = signatureImage.scale(1);
        console.log('Signature image embedded');
      } catch (e) {
        console.log('Signature embed error', e);
      }
    }

    /* ------------------------------------------------------------
     APPLY EACH FIELD
    ------------------------------------------------------------- */
    for (const field of allFields) {
      const pageIndex = (field.page || 1) - 1;
      if (pageIndex >= pdfDoc.getPageCount()) {
        console.warn(
          `Skipping field on page ${field.page} (PDF only has ${pdfDoc.getPageCount()} pages)`
        );
        continue;
      }

      const page = pdfDoc.getPage(pageIndex);
      const { width: PW, height: PH } = page.getSize();
      const box = convertCoordinates(field, PW, PH);

      // SIGNATURE FIELD
      if (field.type === 'signature' && signatureImage) {
        const fit = fitImageInBox(
          signatureDims.width,
          signatureDims.height,
          box.width,
          box.height,
          box.x,
          box.y
        );
        page.drawImage(signatureImage, fit);
        continue;
      }

      // TEXT FIELD (NO BORDER)
      if (field.type === 'text' && field.value) {
        const fontSize = Math.min(box.height * 0.6, 16);
        page.drawText(field.value, {
          x: box.x + 4,
          y: box.y + (box.height - fontSize) / 2,
          size: fontSize,
          font: helveticaFont,
          color: rgb(0, 0, 0)
        });
        continue;
      }

      // DATE FIELD (NO BORDER)
      if (field.type === 'date' && field.value) {
        const fontSize = Math.min(box.height * 0.6, 16);
        page.drawText(field.value, {
          x: box.x + 4,
          y: box.y + (box.height - fontSize) / 2,
          size: fontSize,
          font: helveticaFont,
          color: rgb(0, 0, 0)
        });
        continue;
      }

      // CHECKBOX FIELD
      if (field.type === 'checkbox') {
        // smaller, nicer size
        let size = Math.min(box.width, box.height) * 0.6;
        // clamp to reasonable range (8–14 pt)
        size = Math.max(8, Math.min(size, 14));

        const cx = box.x + (box.width - size) / 2;
        const cy = box.y + (box.height - size) / 2;

        // outer border box
        page.drawRectangle({
          x: cx,
          y: cy,
          width: size,
          height: size,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1
        });

        if (field.value) {
          // ✅ CHECKED → green tick
          // Draw tick using two lines
          const thickness = 1.5;
          const start1 = { x: cx + size * 0.2, y: cy + size * 0.45 };
          const mid =    { x: cx + size * 0.45, y: cy + size * 0.2 };
          const end2 =   { x: cx + size * 0.8,  y: cy + size * 0.8 };

          page.drawLine({
            start: start1,
            end: mid,
            thickness,
            color: rgb(0.1, 0.6, 0.2) // green
          });

          page.drawLine({
            start: mid,
            end: end2,
            thickness,
            color: rgb(0.1, 0.6, 0.2)
          });
        } else {
          // ❌ UNCHECKED → cross (X) inside box
          const thickness = 1;

          const a = { x: cx + size * 0.2, y: cy + size * 0.2 };
          const b = { x: cx + size * 0.8, y: cy + size * 0.8 };
          const c = { x: cx + size * 0.8, y: cy + size * 0.2 };
          const d = { x: cx + size * 0.2, y: cy + size * 0.8 };

          page.drawLine({
            start: a,
            end: b,
            thickness,
            color: rgb(0.7, 0.1, 0.1) // reddish
          });

          page.drawLine({
            start: c,
            end: d,
            thickness,
            color: rgb(0.7, 0.1, 0.1)
          });
        }

        continue;
      }

      // RADIO BUTTON FIELD
      if (field.type === 'radio') {
        // smaller radius
        let outerR = Math.min(box.width, box.height) * 0.25;
        outerR = Math.max(4, Math.min(outerR, 8)); // clamp

        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;

        // Outer circle border
        page.drawEllipse({
          x: cx,
          y: cy,
          xScale: outerR,
          yScale: outerR,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1
        });

        if (field.value) {
          // Inner filled circle
          const innerR = outerR * 0.6;
          page.drawEllipse({
            x: cx,
            y: cy,
            xScale: innerR,
            yScale: innerR,
            color: rgb(0.2, 0.4, 0.8)
          });
        }

        continue;
      }

      // IMAGE FIELD
      if (field.type === 'image' && field.value) {
        try {
          const base64 = field.value.includes(',')
            ? field.value.split(',')[1]
            : field.value;

          const imgBytes = Buffer.from(base64, 'base64');
          let img;

          if (field.value.startsWith('data:image/png')) {
            img = await pdfDoc.embedPng(imgBytes);
          } else {
            img = await pdfDoc.embedJpg(imgBytes);
          }

          const dims = img.scale(1);
          const fit = fitImageInBox(
            dims.width,
            dims.height,
            box.width,
            box.height,
            box.x,
            box.y
          );

          page.drawImage(img, fit);
        } catch (e) {
          console.log('Image field error', e);
        }

        continue;
      }
    }

    // (No page numbers here – PDF content stays clean)

    // SAVE PDF
    const signedBytes = await pdfDoc.save();
    const signedHash = computeHash(signedBytes);

    await fs.mkdir(path.join(__dirname, 'signed-pdfs'), { recursive: true });

    const fileName = `${pdfId || 'pdf'}-signed-${Date.now()}.pdf`;
    const filePath = path.join(__dirname, 'signed-pdfs', fileName);

    await fs.writeFile(filePath, signedBytes);

    // Store audit
    const record = {
      pdfId,
      originalHash,
      signedHash,
      fieldData: allFields,
      signedFilename: fileName,
      createdAt: new Date()
    };
    await db.collection('audit_trail').insertOne(record);

    res.json({
      success: true,
      signedPdfUrl: `http://localhost:${PORT}/signed-pdfs/${fileName}`,
      originalHash,
      signedHash,
      auditId: record._id,
      pageCount: pdfDoc.getPageCount()
    });

  } catch (error) {
    console.error('❌ Error in /sign-pdf:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ==================================================== */

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

async function startServer() {
  await connectDB();
  app.listen(PORT, () => console.log(`Backend running http://localhost:${PORT}`));
}

startServer().catch(console.error);
