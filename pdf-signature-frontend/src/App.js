import React, { useState, useRef, useEffect } from 'react';
import { FileText, PenTool, Image, Calendar, Square, Circle, Download, Upload, ZoomIn, ZoomOut } from 'lucide-react';

// ✅ CRA-style env var (Netlify: REACT_APP_API_BASE_URL)
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

const FIELD_TYPES = {
  TEXT: 'text',
  SIGNATURE: 'signature',
  IMAGE: 'image',
  DATE: 'date',
  CHECKBOX: 'checkbox',
  RADIO: 'radio'
};

const TOOLS = [
  { type: FIELD_TYPES.TEXT, icon: FileText, label: 'Text Field', color: 'bg-blue-500' },
  { type: FIELD_TYPES.SIGNATURE, icon: PenTool, label: 'Signature', color: 'bg-purple-500' },
  { type: FIELD_TYPES.IMAGE, icon: Image, label: 'Image', color: 'bg-green-500' },
  { type: FIELD_TYPES.DATE, icon: Calendar, label: 'Date', color: 'bg-orange-500' },
  { type: FIELD_TYPES.CHECKBOX, icon: Square, label: 'Checkbox', color: 'bg-red-500' },
  { type: FIELD_TYPES.RADIO, icon: Circle, label: 'Radio', color: 'bg-pink-500' }
];

export default function PDFSignatureSystem() {
  const [selectedTool, setSelectedTool] = useState(null);
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfDataForBackend, setPdfDataForBackend] = useState(null);
  const [pages, setPages] = useState([]);
  const [signatureData, setSignatureData] = useState(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [scale, setScale] = useState(1.0);
  
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const currentImageFieldRef = useRef(null);

  // ✅ Load pdf.js script + sample PDF
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      loadSamplePDF();
    };

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const loadPDF = async (uint8Data) => {
    if (!window.pdfjsLib) {
      setTimeout(() => loadPDF(uint8Data), 100);
      return;
    }

    try {
      const dataCopy = new Uint8Array(uint8Data);
      
      // Store for backend
      setPdfDataForBackend(dataCopy);
      
      const loadingTask = window.pdfjsLib.getDocument({ data: dataCopy });
      const pdf = await loadingTask.promise;
      
      setPdfDoc(pdf);
      renderAllPages(pdf);
    } catch (error) {
      console.error('Error loading PDF:', error);
    }
  };

  const renderAllPages = async (pdf) => {
    const pagePromises = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
      pagePromises.push(renderPageToCanvas(pdf, i));
    }
    
    const renderedPages = await Promise.all(pagePromises);
    setPages(renderedPages);
  };

  const renderPageToCanvas = async (pdf, pageNum) => {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    return {
      pageNum,
      canvas,
      width: viewport.width,
      height: viewport.height
    };
  };

  // ✅ Re-render pages when scale changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pdfDoc) {
      renderAllPages(pdfDoc);
    }
  }, [scale]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') {
      alert('Please upload a PDF file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const arrayBuffer = event.target.result;
      const uint8Array = new Uint8Array(arrayBuffer);
      loadPDF(uint8Array);
    };
    reader.readAsArrayBuffer(file);
  };

  const loadSamplePDF = () => {
    const base64 = "JVBERi0xLjQKJeLjz9MKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL1Jlc291cmNlczw8L0ZvbnQ8PC9GMSA0IDAgUj4+Pj4vTWVkaWFCb3hbMCAwIDU5NSA4NDJdL0NvbnRlbnRzIDUgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCjUgMCBvYmoKPDwvTGVuZ3RoIDQ0Pj4Kc3RyZWFtCkJUCi9GMSA0OCBUZgoxMDAgNzAwIFRkCihTYW1wbGUgUERGKSBUagpFVAplbmRzdHJlYW0KZW5kb2JqCjIgMCBvYmoKPDwvVHlwZS9QYWdlcy9Db3VudCAxL0tpZHNbMyAwIFJdPj4KZW5kb2JqCjEgMCBvYmoKPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDIgMCBSPj4KZW5kb2JqCjYgMCBvYmoKPDwvUHJvZHVjZXIocGRmbGliKS9DcmVhdGlvbkRhdGUoRDoyMDI1MDEwMTEyMDAwMFopPj4KZW5kb2JqCnhyZWYKMCA3CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDI5OCAwMDAwMCBuIAowMDAwMDAwMjQ3IDAwMDAwIG4gCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDEyNiAwMDAwMCBuIAowMDAwMDAwMTk1IDAwMDAwIG4gCjAwMDAwMDAzNDcgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDcvUm9vdCAxIDAgUi9JbmZvIDYgMCBSPj4Kc3RhcnR4cmVmCjQyNQolJUVPRgo=";
    
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    loadPDF(bytes);
  };

  const handlePageClick = (e, pageNum, pageContainer) => {
    if (!selectedTool) return;

    const rect = pageContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const page = pages.find(p => p.pageNum === pageNum);
    if (!page) return;

    const relativeX = clickX / page.width;
    const relativeY = clickY / page.height;

    const newField = {
      id: Date.now(),
      type: selectedTool,
      page: pageNum,
      x: relativeX,
      y: relativeY,
      width: 0.2,
      height: 0.08,
      value: selectedTool === FIELD_TYPES.TEXT ? '' : 
             selectedTool === FIELD_TYPES.DATE ? new Date().toLocaleDateString() :
             selectedTool === FIELD_TYPES.CHECKBOX ? false :
             selectedTool === FIELD_TYPES.RADIO ? false : 
             null
    };

    setFields([...fields, newField]);
    setSelectedTool(null);
  };

  const handleFieldMouseDown = (e, fieldId) => {
    e.stopPropagation();
    setSelectedField(fieldId);
    setEditingField(null);
    
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const page = pages.find(p => p.pageNum === field.page);
    if (!page) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startFieldX = field.x * page.width;
    const startFieldY = field.y * page.height;

    const onMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      
      const newX = (startFieldX + deltaX) / page.width;
      const newY = (startFieldY + deltaY) / page.height;

      setFields(fields.map(f => 
        f.id === fieldId 
          ? { 
              ...f, 
              x: Math.max(0, Math.min(1 - f.width, newX)), 
              y: Math.max(0, Math.min(1 - f.height, newY)) 
            }
          : f
      ));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleFieldDoubleClick = (e, fieldId) => {
    e.stopPropagation();
    const field = fields.find(f => f.id === fieldId);
    if (field && (field.type === FIELD_TYPES.TEXT || field.type === FIELD_TYPES.DATE)) {
      setEditingField(fieldId);
    }
  };

  const handleFieldValueChange = (fieldId, newValue) => {
    setFields(fields.map(f => 
      f.id === fieldId ? { ...f, value: newValue } : f
    ));
  };

  const handleCheckboxToggle = (fieldId) => {
    setFields(fields.map(f => 
      f.id === fieldId ? { ...f, value: !f.value } : f
    ));
  };

  const handleImageUpload = (fieldId) => {
    currentImageFieldRef.current = fieldId;
    imageInputRef.current?.click();
  };

  const handleImageFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target.result;
      if (currentImageFieldRef.current) {
        setFields(fields.map(f => 
          f.id === currentImageFieldRef.current ? { ...f, value: imageData } : f
        ));
        currentImageFieldRef.current = null;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleResize = (e, fieldId, corner) => {
    e.stopPropagation();
    
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const page = pages.find(p => p.pageNum === field.page);
    if (!page) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startField = { ...field };

    const onMouseMove = (moveEvent) => {
      const deltaX = (moveEvent.clientX - startX) / page.width;
      const deltaY = (moveEvent.clientY - startY) / page.height;

      let newField = { ...startField };

      if (corner.includes('right')) {
        newField.width = Math.max(0.05, Math.min(1 - startField.x, startField.width + deltaX));
      }
      if (corner.includes('bottom')) {
        newField.height = Math.max(0.03, Math.min(1 - startField.y, startField.height + deltaY));
      }
      if (corner.includes('left')) {
        const newWidth = startField.width - deltaX;
        if (newWidth > 0.05 && startField.x + deltaX >= 0) {
          newField.x = startField.x + deltaX;
          newField.width = newWidth;
        }
      }
      if (corner.includes('top')) {
        const newHeight = startField.height - deltaY;
        if (newHeight > 0.03 && startField.y + deltaY >= 0) {
          newField.y = startField.y + deltaY;
          newField.height = newHeight;
        }
      }

      setFields(fields.map(f => f.id === fieldId ? newField : f));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const deleteField = (fieldId) => {
    setFields(fields.filter(f => f.id !== fieldId));
    setSelectedField(null);
  };

  const drawSignature = () => {
    setShowSignatureModal(true);
  };

  const handleSignatureDrawing = (e) => {
    if (!isDrawing.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const startDrawing = (e) => {
    isDrawing.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const saveSignature = () => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      setSignatureData(dataUrl);
      setShowSignatureModal(false);
    }
  };

  const clearSignature = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const handleSignPDF = async () => {
    if (!signatureData) {
      alert('Please draw a signature first');
      return;
    }

    const signatureFields = fields.filter(f => f.type === FIELD_TYPES.SIGNATURE);
    if (signatureFields.length === 0) {
      alert('Please place at least one signature field on the PDF');
      return;
    }

    if (!pdfDataForBackend) {
      alert('PDF data not loaded. Please upload a PDF first.');
      return;
    }

    setIsSigning(true);

    try {
      // Convert PDF data to base64 more reliably
      let pdfBase64 = '';
      const chunkSize = 0x8000; // Process in chunks to avoid call stack size exceeded
      
      for (let i = 0; i < pdfDataForBackend.length; i += chunkSize) {
        const chunk = pdfDataForBackend.subarray(i, i + chunkSize);
        pdfBase64 += String.fromCharCode.apply(null, Array.from(chunk));
      }
      pdfBase64 = btoa(pdfBase64);
      
      console.log('Sending PDF to backend:', {
        pdfSize: pdfDataForBackend.length,
        base64Size: pdfBase64.length,
        totalFields: fields.length,
        pages: pages.length
      });

      const response = await fetch(`${API_BASE_URL}/sign-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfId: 'uploaded-pdf-' + Date.now(),
          pdfBase64: pdfBase64,
          signatureImageBase64: signatureData.split(',')[1],
          coordinates: signatureFields,
          allFields: fields,
          totalPages: pages.length
        })
      });

      const result = await response.json();
      
      if (result.success) {
        const totalFields = fields.length; // ✅ now used
        const textFields = fields.filter(f => f.type === FIELD_TYPES.TEXT).length;
        const dateFields = fields.filter(f => f.type === FIELD_TYPES.DATE).length;
        const checkboxFields = fields.filter(f => f.type === FIELD_TYPES.CHECKBOX).length;
        
        alert(
          `PDF signed successfully!\n\n` +
          `Total Pages: ${pages.length}\n` +
          `Total Fields: ${totalFields}\n` +
          `Fields Added:\n- Signatures: ${signatureFields.length}\n` +
          `- Text: ${textFields}\n- Date: ${dateFields}\n- Checkbox: ${checkboxFields}\n\n` +
          `Original Hash: ${result.originalHash}\n` +
          `Signed Hash: ${result.signedHash}\n\nOpening signed PDF...`
        );
        window.open(result.signedPdfUrl, '_blank');
      } else {
        alert('Error signing PDF: ' + result.error);
      }
    } catch (error) {
      console.error('Full error:', error);
      alert('Error connecting to backend. Make sure the server is running.\n\nError: ' + error.message);
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-20 bg-white shadow-lg flex flex-col items-center py-4 space-y-3">
        <h3 className="text-xs font-bold text-gray-600 mb-2">TOOLS</h3>
        
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-3 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
          title="Upload PDF"
        >
          <Upload size={24} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileUpload}
          className="hidden"
        />
        
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageFileSelect}
          className="hidden"
        />
        
        <div className="w-full h-px bg-gray-200 my-2" />
        
        {TOOLS.map(tool => (
          <button
            key={tool.type}
            onClick={() => setSelectedTool(tool.type)}
            className={`p-3 rounded-lg transition-all ${
              selectedTool === tool.type 
                ? `${tool.color} text-white scale-110` 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}

            title={tool.label}
          >
            <tool.icon size={24} />
          </button>
        ))}
        
        <div className="flex-1" />
        
        <button
          onClick={drawSignature}
          className="p-3 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600"
          title="Draw Signature"
        >
          <PenTool size={24} />
        </button>
        
        <button
          onClick={handleSignPDF}
          disabled={isSigning}
          className="p-3 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
          title="Sign PDF"
        >
          <Download size={24} />
        </button>
      </div>

      <div className="flex-1 flex flex-col p-4 bg-gray-50">
        <div className="flex items-center justify-center gap-4 mb-4">
          <button
            onClick={() => setScale(s => Math.min(s + 0.2, 3))}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
          >
            <ZoomIn size={20} /> Zoom In
          </button>
          <span className="text-gray-700 font-medium">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(s => Math.max(s - 0.2, 0.5))}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
          >
            <ZoomOut size={20} /> Zoom Out
          </button>
          {pages.length > 0 && (
            <span className="text-gray-600 ml-4">
              {pages.length} page{pages.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        
        <div className="flex-1 overflow-auto flex justify-center">
          <div className="space-y-4 py-4">
            {pages.map((page) => (
              <div key={page.pageNum} className="relative">
                <div className="bg-white shadow-2xl rounded-lg overflow-visible relative">
                  <div
                    className="relative cursor-crosshair"
                    onClick={(e) => handlePageClick(e, page.pageNum, e.currentTarget)}
                    style={{ 
                      width: page.width,
                      height: page.height
                    }}
                  >
                    <img 
                      src={page.canvas.toDataURL()} 
                      alt={`Page ${page.pageNum}`}
                      className="absolute top-0 left-0"
                      style={{ width: page.width, height: page.height }}
                    />

                    {fields.filter(f => f.page === page.pageNum).map(field => (
                      <div
                        key={field.id}
                        onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                        onDoubleClick={(e) => handleFieldDoubleClick(e, field.id)}
                        style={{
                          position: 'absolute',
                          left: `${field.x * 100}%`,
                          top: `${field.y * 100}%`,
                          width: `${field.width * 100}%`,
                          height: `${field.height * 100}%`,
                          border: selectedField === field.id ? '2px dashed #3b82f6' : '2px dashed #9ca3af',
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          cursor: 'move',
                          zIndex: selectedField === field.id ? 10 : 5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden'
                        }}
                      >
                        {field.type === FIELD_TYPES.SIGNATURE && signatureData && (
                          <img 
                            src={signatureData} 
                            alt="Signature preview"
                            style={{
                              maxWidth: '90%',
                              maxHeight: '90%',
                              objectFit: 'contain',
                              pointerEvents: 'none'
                            }}
                          />
                        )}
                        
                        {field.type === FIELD_TYPES.TEXT && (
                          editingField === field.id ? (
                            <input
                              type="text"
                              value={field.value || ''}
                              onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                              onBlur={() => setEditingField(null)}
                              autoFocus
                              className="w-full h-full px-2 text-sm bg-white border-none outline-none"
                              style={{ fontSize: `${Math.min(field.height * page.height * 0.5, 16)}px` }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div 
                              className="w-full h-full px-2 flex items-center text-sm text-gray-700"
                              style={{ fontSize: `${Math.min(field.height * page.height * 0.5, 16)}px` }}
                            >
                              {field.value || 'Double-click to edit'}
                            </div>
                          )
                        )}
                        
                        {field.type === FIELD_TYPES.DATE && (
                          editingField === field.id ? (
                            <input
                              type="date"
                              value={field.value || ''}
                              onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                              onBlur={() => setEditingField(null)}
                              autoFocus
                              className="w-full h-full px-2 text-sm bg-white border-none outline-none"
                              style={{ fontSize: `${Math.min(field.height * page.height * 0.5, 16)}px` }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div 
                              className="w-full h-full px-2 flex items-center text-sm text-gray-700"
                              style={{ fontSize: `${Math.min(field.height * page.height * 0.5, 16)}px` }}
                            >
                              {field.value || 'Double-click to edit'}
                            </div>
                          )
                        )}
                        
                        {field.type === FIELD_TYPES.CHECKBOX && (
                          <div 
                            className="w-full h-full flex items-center justify-center cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCheckboxToggle(field.id);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <div 
                              className={`border-2 border-gray-600 rounded ${field.value ? 'bg-blue-500' : 'bg-white'}`}
                              style={{
                                width: `${Math.min(field.height * page.height * 0.6, 24)}px`,
                                height: `${Math.min(field.height * page.height * 0.6, 24)}px`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {field.value && (
                                <span className="text-white font-bold">✓</span>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {field.type === FIELD_TYPES.RADIO && (
                          <div 
                            className="w-full h-full flex items-center justify-center cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCheckboxToggle(field.id);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <div 
                              className={`border-2 border-gray-600 rounded-full ${field.value ? 'bg-blue-500' : 'bg-white'}`}
                              style={{
                                width: `${Math.min(field.height * page.height * 0.6, 24)}px`,
                                height: `${Math.min(field.height * page.height * 0.6, 24)}px`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {field.value && (
                                <div 
                                  className="bg-white rounded-full"
                                  style={{
                                    width: '60%',
                                    height: '60%'
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        )}
                        
                        {field.type === FIELD_TYPES.IMAGE && (
                          field.value ? (
                            <img 
                              src={field.value} 
                              alt="Uploaded"
                              className="w-full h-full object-contain cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleImageUpload(field.id);
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div 
                              className="w-full h-full flex flex-col items-center justify-center text-gray-400 text-xs cursor-pointer hover:bg-blue-200 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleImageUpload(field.id);
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <Upload size={20} className="mb-1" />
                              <span>Click to upload</span>
                            </div>
                          )
                        )}
                        
                        <div className="absolute top-0 left-0 bg-blue-500 text-white text-xs px-2 py-1 rounded-br pointer-events-none">
                          {field.type}
                        </div>

                        {selectedField === field.id && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteField(field.id);
                              }}
                              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600"
                            >
                              ×
                            </button>
                            
                            <div
                              onMouseDown={(e) => handleResize(e, field.id, 'top-left')}
                              className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 rounded-full cursor-nw-resize"
                            />
                            <div
                              onMouseDown={(e) => handleResize(e, field.id, 'top-right')}
                              className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full cursor-ne-resize"
                            />
                            <div
                              onMouseDown={(e) => handleResize(e, field.id, 'bottom-left')}
                              className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 rounded-full cursor-sw-resize"
                            />
                            <div
                              onMouseDown={(e) => handleResize(e, field.id, 'bottom-right')}
                              className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full cursor-se-resize"
                            />
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Preview-only page badge */}
                  <div
                    className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full pointer-events-none"
                  >
                    Page {page.pageNum} of {pages.length}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedTool && (
          <div className="text-center mt-4 bg-blue-500 text-white px-4 py-2 rounded-lg">
            Click on any page to place a {selectedTool} field
          </div>
        )}
        
        {signatureData && fields.filter(f => f.type === FIELD_TYPES.SIGNATURE).length > 0 && (
          <div className="text-center mt-2 bg-green-500 text-white px-4 py-2 rounded-lg">
            ✓ {fields.filter(f => f.type === FIELD_TYPES.SIGNATURE).length} signature field(s) placed
          </div>
        )}
      </div>

      {showSignatureModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h2 className="text-xl font-bold mb-4">Draw Your Signature</h2>
            <canvas
              ref={canvasRef}
              width={350}
              height={150}
              className="border-2 border-gray-300 rounded cursor-crosshair bg-white"
              onMouseDown={startDrawing}
              onMouseMove={handleSignatureDrawing}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={clearSignature}
                className="flex-1 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Clear
              </button>
              <button
                onClick={() => setShowSignatureModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={saveSignature}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
