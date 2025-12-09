// backend/server.js
const express = require('express');
const cors = require('cors');
const { PDFDocument, rgb } = require('pdf-lib');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/signed-pdfs', express.static('signed-pdfs'));

// ✅ trust Render/Netlify proxies so req.protocol is correct ("https")
app.set('trust proxy', 1);

// ✅ Port (Render gives PORT, local 3001)
const PORT = process.env.PORT || 3001;

// ✅ Mongo from env or local
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'pdf_signature_system';

let db;

// --------- Helpers ---------

// SHA-256 hash
function computeHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Convert percentage coordinates to PDF points
function convertCoordinates(coordinate, pageWidth, pageHeight) {
  const boxLeftPt = coordinate.x * pageWidth;
  const boxTopPt = coordinate.y * pageHeight;
  const boxWidthPt = coordinate.width * pageWidth;
  const boxHeightPt = coordinate.height * pageHeight;

  const boxBottomPt = pageHeight - (boxTopPt + boxHeightPt);

  return {
    x: boxLeftPt,
    y: boxBottomPt,
    width: boxWidthPt,
    height: boxHeightPt
  };
}

// Fit image inside box with aspect ratio preserved
function fitImageInBox(imgWidth, imgHeight, boxWidth, boxHeight, boxX, boxY) {
  const scale = Math.min(boxWidth / imgWidth, boxHeight / imgHeight);

  const drawWidth = imgWidth * scale;
  const drawHeight = imgHeight * scale;

  const drawX = boxX + (boxWidth - drawWidth) / 2;
  const drawY = boxY + (boxHeight - drawHeight) / 2;

  return {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight
  };
}

// ✅ Sanitize text so pdf-lib never sees non-ASCII (avoids WinAnsi errors)
function sanitizeTextForPdf(text) {
  if (typeof text !== 'string') return '';
  // Replace any non-ASCII char with '?'
  return text.replace(/[^\x00-\x7F]/g, '?');
}

// --------- MongoDB ---------

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log('Connected to MongoDB');
}

// --------- Routes ---------

// Main endpoint to sign PDF
app.post('/sign-pdf', async (req, res) => {
  try {
    const { pdfId, pdfBase64, signatureImageBase64, allFields } = req.body;

    console.log('Received /sign-pdf:', {
      pdfId,
      hasPdfBase64: !!pdfBase64,
      pdfBase64Length: pdfBase64 ? pdfBase64.length : 0,
      hasSignature: !!signatureImageBase64,
      totalFields: allFields ? allFields.length : 0
    });

    if (!pdfId || !allFields || !Array.isArray(allFields) || allFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: pdfId, allFields'
      });
    }

    let pdfBytes;

    // Prefer incoming base64 PDF
    if (pdfBase64 && pdfBase64.trim() !== '') {
      try {
        pdfBytes = Buffer.from(pdfBase64, 'base64');
        console.log('PDF decoded from base64:', pdfBytes.length, 'bytes');
      } catch (err) {
        console.error('Error decoding pdfBase64:', err);
        return res.status(400).json({
          success: false,
          error: 'Failed to decode PDF data: ' + err.message
        });
      }
    } else {
      console.warn('⚠️ No pdfBase64 provided, falling back to local sample file or blank sample.');
      const originalPdfPath = path.join(__dirname, 'sample-pdfs', `${pdfId}.pdf`);
      try {
        pdfBytes = await fs.readFile(originalPdfPath);
      } catch (err) {
        console.log('Sample file not found, creating in-memory sample PDF.');
        const samplePdf = await PDFDocument.create();
        const page = samplePdf.addPage([595.28, 841.89]);
        page.drawText('Sample PDF for Signature', {
          x: 50,
          y: 800,
          size: 24
        });
        pdfBytes = await samplePdf.save();
      }
    }

    const originalHash = computeHash(pdfBytes);
    console.log('Original PDF hash:', originalHash);

    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes);
      console.log(`✅ PDF loaded (${pdfDoc.getPageCount()} pages)`);
    } catch (err) {
      console.error('Error loading PDF:', err);
      return res.status(400).json({
        success: false,
        error: 'Failed to load PDF: ' + err.message
      });
    }

    // Signature image
    let signatureImage = null;
    let signatureImgDims = null;
    if (signatureImageBase64) {
      try {
        const sigBytes = Buffer.from(signatureImageBase64, 'base64');
        signatureImage = await pdfDoc.embedPng(sigBytes);
        signatureImgDims = signatureImage.scale(1);
        console.log('✅ Signature image embedded');
      } catch (err) {
        console.error('Error embedding signature image:', err);
        return res.status(400).json({
          success: false,
          error: 'Failed to embed signature: ' + err.message
        });
      }
    }

    // Process fields
    console.log(`Processing ${allFields.length} fields...`);

    for (const field of allFields) {
      const pageIndex = (field.page || 1) - 1;
      if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) {
        console.warn(`⚠️ Page ${field.page} not found (PDF has ${pdfDoc.getPageCount()} pages). Skipping field.`);
        continue;
      }

      const page = pdfDoc.getPage(pageIndex);
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const box = convertCoordinates(field, pageWidth, pageHeight);

      // SIGNATURE FIELD
      if (field.type === 'signature' && signatureImage) {
        const fitDims = fitImageInBox(
          signatureImgDims.width,
          signatureImgDims.height,
          box.width,
          box.height,
          box.x,
          box.y
        );

        page.drawImage(signatureImage, {
          x: fitDims.x,
          y: fitDims.y,
          width: fitDims.width,
          height: fitDims.height
        });

        console.log(`✅ Added signature on page ${field.page}`);
      }

      // TEXT FIELD
      else if (field.type === 'text' && field.value) {
        const safeText = sanitizeTextForPdf(field.value);
        const fontSize = Math.min(box.height * 0.6, 16);
        page.drawText(safeText, {
          x: box.x,
          y: box.y + (box.height - fontSize) / 2,
          size: fontSize,
          color: rgb(0, 0, 0)
        });
        console.log(`Added text on page ${field.page}: "${safeText}"`);
      }

      // DATE FIELD
      else if (field.type === 'date' && field.value) {
        const safeText = sanitizeTextForPdf(field.value);
        const fontSize = Math.min(box.height * 0.6, 16);
        page.drawText(safeText, {
          x: box.x,
          y: box.y + (box.height - fontSize) / 2,
          size: fontSize,
          color: rgb(0, 0, 0)
        });
        console.log(`Added date on page ${field.page}: "${safeText}"`);
      }

      // CHECKBOX FIELD (no Unicode)
      else if (field.type === 'checkbox') {
        const size = Math.min(box.width, box.height) * 0.6;
        const x = box.x + (box.width - size) / 2;
        const y = box.y + (box.height - size) / 2;

        // Border
        page.drawRectangle({
          x,
          y,
          width: size,
          height: size,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1.2
        });

        if (field.value) {
          // Draw a tick using lines (no ✓ character)
          const tickX1 = x + size * 0.2;
          const tickY1 = y + size * 0.45;
          const tickX2 = x + size * 0.45;
          const tickY2 = y + size * 0.2;
          const tickX3 = x + size * 0.8;
          const tickY3 = y + size * 0.75;

          page.drawLine({
            start: { x: tickX1, y: tickY1 },
            end: { x: tickX2, y: tickY2 },
            thickness: 1.5,
            color: rgb(0, 0.6, 0)
          });

          page.drawLine({
            start: { x: tickX2, y: tickY2 },
            end: { x: tickX3, y: tickY3 },
            thickness: 1.5,
            color: rgb(0, 0.6, 0)
          });
        }

        console.log(`Added checkbox on page ${field.page}: ${field.value ? 'checked' : 'unchecked'}`);
      }

      // RADIO FIELD (no Unicode)
      else if (field.type === 'radio') {
        const size = Math.min(box.width, box.height) * 0.6;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        const radius = size / 2;

        // Outer circle
        page.drawEllipse({
          x: cx,
          y: cy,
          xScale: radius,
          yScale: radius,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1.2
        });

        if (field.value) {
          // Inner filled circle
          page.drawEllipse({
            x: cx,
            y: cy,
            xScale: radius * 0.5,
            yScale: radius * 0.5,
            color: rgb(0, 0.4, 1)
          });
        }

        console.log(`Added radio on page ${field.page}: ${field.value ? 'selected' : 'unselected'}`);
      }

      // IMAGE FIELD
      else if (field.type === 'image' && field.value) {
        try {
          const base64Data = field.value.split(',')[1];
          const imageBytes = Buffer.from(base64Data, 'base64');

          let embeddedImage;
          if (field.value.startsWith('data:image/png')) {
            embeddedImage = await pdfDoc.embedPng(imageBytes);
          } else if (
            field.value.startsWith('data:image/jpeg') ||
            field.value.startsWith('data:image/jpg')
          ) {
            embeddedImage = await pdfDoc.embedJpg(imageBytes);
          } else {
            console.warn('Unsupported image format, skipping image field.');
            continue;
          }

          const imgDims = embeddedImage.scale(1);
          const fitDims = fitImageInBox(
            imgDims.width,
            imgDims.height,
            box.width,
            box.height,
            box.x,
            box.y
          );

          page.drawImage(embeddedImage, {
            x: fitDims.x,
            y: fitDims.y,
            width: fitDims.width,
            height: fitDims.height
          });

          console.log(`Added image on page ${field.page}`);
        } catch (err) {
          console.error('Error embedding image field:', err);
        }
      }
    }

    console.log('✅ All fields processed. Saving signed PDF...');

    const signedPdfBytes = await pdfDoc.save();
    const signedHash = computeHash(signedPdfBytes);

    console.log('Signed PDF size:', signedPdfBytes.length, 'bytes');

    const signedDir = path.join(__dirname, 'signed-pdfs');
    await fs.mkdir(signedDir, { recursive: true });

    const timestamp = Date.now();
    const signedFilename = `${pdfId}-signed-${timestamp}.pdf`;
    const signedPath = path.join(signedDir, signedFilename);

    await fs.writeFile(signedPath, signedPdfBytes);
    console.log(`✅ Signed PDF saved at ${signedPath}`);

    // Build URL from request (works on Render & local)
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    const signedPdfUrl = `${baseUrl}/signed-pdfs/${signedFilename}`;

    console.log(`✅ Returning signedPdfUrl: ${signedPdfUrl}`);

    const auditRecord = {
      pdfId,
      originalHash,
      signedHash,
      fieldData: allFields,
      signedFilename,
      createdAt: new Date()
    };

    await db.collection('audit_trail').insertOne(auditRecord);

    res.json({
      success: true,
      signedPdfUrl,
      originalHash,
      signedHash,
      auditId: auditRecord._id
    });

  } catch (error) {
    console.error('❌ Error in /sign-pdf:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get audit trail
app.get('/audit/:pdfId', async (req, res) => {
  try {
    const { pdfId } = req.params;
    const records = await db.collection('audit_trail')
      .find({ pdfId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      records
    });
  } catch (error) {
    console.error('Error in /audit:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Verify PDF hash
app.post('/verify', async (req, res) => {
  try {
    const { pdfUrl, expectedHash } = req.body;

    const filename = path.basename(pdfUrl);
    const pdfPath = path.join(__dirname, 'signed-pdfs', filename);
    const pdfBytes = await fs.readFile(pdfPath);

    const actualHash = computeHash(pdfBytes);
    const isValid = actualHash === expectedHash;

    res.json({
      success: true,
      isValid,
      actualHash,
      expectedHash
    });
  } catch (error) {
    console.error('Error in /verify:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}`;
  res.json({ status: 'ok', timestamp: new Date(), baseUrl });
});

// --------- Start server ---------

async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`PDF Signature Backend running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
