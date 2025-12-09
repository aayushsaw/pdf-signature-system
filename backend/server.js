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

// ✅ trust Render proxy so req.protocol becomes "https"
app.set('trust proxy', 1);

// ✅ Port: Render gives PORT, local is 3001
const PORT = process.env.PORT || 3001;

// ✅ Mongo: from env or local
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'pdf_signature_system';

let db;

// Initialize MongoDB connection
async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log('Connected to MongoDB');
}

// Compute SHA-256 hash
function computeHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Convert percentage coordinates to PDF points
function convertCoordinates(coordinate, pageWidth, pageHeight) {
  const boxLeftPt = coordinate.x * pageWidth;
  const boxTopPt = coordinate.y * pageHeight;
  const boxWidthPt = coordinate.width * pageWidth;
  const boxHeightPt = coordinate.height * pageHeight;
  
  // PDF coordinate system: bottom-left origin
  const boxBottomPt = pageHeight - (boxTopPt + boxHeightPt);
  
  return {
    x: boxLeftPt,
    y: boxBottomPt,
    width: boxWidthPt,
    height: boxHeightPt
  };
}

// Fit image inside box with aspect ratio preserved (contain behavior)
function fitImageInBox(imgWidth, imgHeight, boxWidth, boxHeight, boxX, boxY) {
  const scale = Math.min(boxWidth / imgWidth, boxHeight / imgHeight);
  
  const drawWidth = imgWidth * scale;
  const drawHeight = imgHeight * scale;
  
  // Center the image in the box
  const drawX = boxX + (boxWidth - drawWidth) / 2;
  const drawY = boxY + (boxHeight - drawHeight) / 2;
  
  return {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight
  };
}

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
    
    if (!pdfId || !allFields || allFields.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: pdfId, allFields' 
      });
    }

    let pdfBytes;

    // ✅ Prefer uploaded PDF base64 if provided
    if (pdfBase64 && pdfBase64.trim() !== '') {
      try {
        pdfBytes = Buffer.from(pdfBase64, 'base64');
        console.log('PDF decoded from base64:', pdfBytes.length, 'bytes');
      } catch (decodeError) {
        console.error('Error decoding PDF base64:', decodeError);
        return res.status(400).json({
          success: false,
          error: 'Failed to decode PDF data: ' + decodeError.message
        });
      }
    } else {
      console.warn('⚠️ No pdfBase64 provided, falling back to sample-pdfs or blank sample');
      // Fallback: try to load from file system
      const originalPdfPath = path.join(__dirname, 'sample-pdfs', `${pdfId}.pdf`);
      try {
        pdfBytes = await fs.readFile(originalPdfPath);
      } catch (err) {
        // If file doesn't exist, create a sample A4 PDF
        console.log('Creating sample PDF as fallback');
        const samplePdf = await PDFDocument.create();
        const page = samplePdf.addPage([595.28, 841.89]); // A4 in points
        page.drawText('Sample PDF for Signature', {
          x: 50,
          y: 800,
          size: 24
        });
        pdfBytes = await samplePdf.save();
      }
    }
    
    // Compute original hash
    const originalHash = computeHash(pdfBytes);
    console.log('Original PDF hash:', originalHash);
    
    // Load PDF with pdf-lib
    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes);
      console.log(`✅ PDF loaded successfully with ${pdfDoc.getPageCount()} pages`);
    } catch (loadError) {
      console.error('Error loading PDF:', loadError);
      return res.status(400).json({
        success: false,
        error: 'Failed to load PDF: ' + loadError.message
      });
    }
    
    // Embed signature image if provided
    let signatureImage = null;
    let signatureImgDims = null;
    if (signatureImageBase64) {
      try {
        const signatureImageBytes = Buffer.from(signatureImageBase64, 'base64');
        signatureImage = await pdfDoc.embedPng(signatureImageBytes);
        signatureImgDims = signatureImage.scale(1);
        console.log('✅ Signature image embedded');
      } catch (sigError) {
        console.error('Error embedding signature:', sigError);
        return res.status(400).json({
          success: false,
          error: 'Failed to embed signature: ' + sigError.message
        });
      }
    }
    
    console.log(`Processing ${allFields.length} fields...`);
    
    // Process each field
    for (const field of allFields) {
      const pageIndex = (field.page || 1) - 1;
      
      if (pageIndex >= pdfDoc.getPageCount()) {
        console.warn(`⚠️ Page ${field.page} not found (PDF has ${pdfDoc.getPageCount()} pages), skipping field ${field.type}`);
        continue;
      }
      
      const page = pdfDoc.getPages()[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const box = convertCoordinates(field, pageWidth, pageHeight);
      
      // Signature
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
        
        console.log(`✅ Added signature to page ${field.page}`);
      }
      
      // Text field
      else if (field.type === 'text' && field.value) {
        const fontSize = Math.min(box.height * 0.6, 16);
        page.drawText(field.value, {
          x: box.x,
          y: box.y + (box.height - fontSize) / 2,
          size: fontSize,
          color: rgb(0, 0, 0)
        });

        console.log(`Added text field to page ${field.page}: "${field.value}"`);
      }
      
      // Date field
      else if (field.type === 'date' && field.value) {
        const fontSize = Math.min(box.height * 0.6, 16);
        page.drawText(field.value, {
          x: box.x,
          y: box.y + (box.height - fontSize) / 2,
          size: fontSize,
          color: rgb(0, 0, 0)
        });

        console.log(`Added date field to page ${field.page}: "${field.value}"`);
      }
      
      // Checkbox
      else if (field.type === 'checkbox') {
        const size = Math.min(box.width, box.height) * 0.6;
        const x = box.x + (box.width - size) / 2;
        const y = box.y + (box.height - size) / 2;

        // Border square
        page.drawRectangle({
          x,
          y,
          width: size,
          height: size,
          borderWidth: 1.5,
          borderColor: rgb(0.2, 0.2, 0.2)
        });

        if (field.value) {
          // Checked: solid box + tick in white
          page.drawRectangle({
            x,
            y,
            width: size,
            height: size,
            color: rgb(0, 0.45, 0.9)
          });

          page.drawText('✓', {
            x: x + size * 0.18,
            y: y + size * 0.08,
            size: size * 0.7,
            color: rgb(1, 1, 1)
          });
        } else {
          // Unchecked: subtle X
          page.drawText('✕', {
            x: x + size * 0.18,
            y: y + size * 0.08,
            size: size * 0.7,
            color: rgb(0.6, 0.6, 0.6)
          });
        }

        console.log(`Added checkbox to page ${field.page}: ${field.value ? 'checked' : 'unchecked'}`);
      }

      // Radio
      else if (field.type === 'radio') {
        const radiusOuter = Math.min(box.width, box.height) * 0.3;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;

        // Outer circle
        page.drawEllipse({
          x: cx,
          y: cy,
          xScale: radiusOuter,
          yScale: radiusOuter,
          borderWidth: 1.5,
          borderColor: rgb(0.2, 0.2, 0.2)
        });

        if (field.value) {
          const radiusInner = radiusOuter * 0.6;
          page.drawEllipse({
            x: cx,
            y: cy,
            xScale: radiusInner,
            yScale: radiusInner,
            color: rgb(0, 0.45, 0.9)
          });
        }

        console.log(`Added radio button to page ${field.page}: ${field.value ? 'selected' : 'unselected'}`);
      }

      // Image field
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
            console.warn('Unsupported image format, skipping');
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

          console.log(`Added image to page ${field.page}`);
        } catch (imgError) {
          console.error('Error embedding image:', imgError);
        }
      }
    }
    
    console.log('✅ All fields processed. Saving PDF...');
    
    // Save signed PDF
    const signedPdfBytes = await pdfDoc.save();
    const signedHash = computeHash(signedPdfBytes);
    
    console.log('PDF saved:', {
      originalSize: pdfBytes.length,
      signedSize: signedPdfBytes.length,
      signedHash: signedHash
    });
    
    // Save to disk
    const signedDir = path.join(__dirname, 'signed-pdfs');
    await fs.mkdir(signedDir, { recursive: true });
    
    const timestamp = Date.now();
    const signedFilename = `${pdfId}-signed-${timestamp}.pdf`;
    const signedPath = path.join(signedDir, signedFilename);
    
    await fs.writeFile(signedPath, signedPdfBytes);
    
    console.log(`✅ Signed PDF saved to: ${signedFilename}`);
    
    // ✅ Build URL from the incoming request (no localhost!)
    const protocol = req.protocol;          // "https" when behind Render proxy
    const host = req.get('host');           // e.g. "pdf-signature-system.onrender.com"
    const baseUrl = `${protocol}://${host}`;
    const signedPdfUrl = `${baseUrl}/signed-pdfs/${signedFilename}`;
    
    console.log(`✅ Success! Returning URL: ${signedPdfUrl}`);
    
    // Store audit trail in MongoDB
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
    console.error('❌ Error signing PDF:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get audit trail for a PDF
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

// Start server
async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`PDF Signature Backend running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
