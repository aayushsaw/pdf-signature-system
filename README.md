# PDF Signature System

A comprehensive web-based PDF signature and form filling system that allows users to interactively add signatures, text fields, dates, checkboxes, radio buttons, and images to PDF documents.

## 🚀 Features

### Core Functionality
- **Interactive PDF Editing**: Click-to-place fields on PDF pages with drag-and-drop positioning
- **Multiple Field Types**:
  - Signature fields with custom drawn signatures
  - Text input fields
  - Date picker fields
  - Checkbox fields
  - Radio button fields
  - Image upload fields
- **PDF Upload Support**: Upload your own PDFs or use the built-in sample PDF
- **Real-time Preview**: See field placements and content before signing
- **Zoom Controls**: Zoom in/out for precise field positioning
- **Field Resizing**: Resize fields by dragging corners
- **Field Editing**: Double-click text/date fields to edit content

### Security & Audit
- **Cryptographic Hashing**: SHA-256 hashing of original and signed PDFs
- **Audit Trail**: Complete logging of all signing operations in MongoDB
- **PDF Verification**: Verify signed PDFs against original hashes
- **Tamper Detection**: Detect any modifications to signed documents

### Technical Features
- **Cross-platform**: Works on desktop and mobile browsers
- **Responsive Design**: Modern UI with Tailwind CSS
- **RESTful API**: Clean backend API for PDF operations
- **File Management**: Automatic organization of signed PDFs
- **Error Handling**: Comprehensive error handling and user feedback

## 🏗️ Architecture

### Backend (Node.js/Express)
- **Framework**: Express.js with CORS support
- **PDF Processing**: pdf-lib for PDF manipulation
- **Database**: MongoDB for audit trail storage
- **File Storage**: Local file system for PDF storage
- **Security**: Input sanitization and validation

### Frontend (React)
- **Framework**: React 19 with hooks
- **PDF Rendering**: PDF.js for client-side PDF display
- **Styling**: Tailwind CSS for responsive design
- **Icons**: Lucide React icon library
- **Build Tool**: Create React App

## 📋 Prerequisites

- **Node.js** (v14 or higher)
- **MongoDB** (local installation or cloud service like MongoDB Atlas)
- **npm** or **yarn** package manager

## 🛠️ Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd pdf-signature-system
```

### 2. Backend Setup
```bash
cd backend
npm install
```

#### Environment Variables (Optional)
Create a `.env` file in the backend directory:
```env
PORT=3001
MONGO_URI=mongodb://localhost:27017
DB_NAME=pdf_signature_system
```

#### Start Backend Server
```bash
npm start
# For development with auto-reload:
npm run dev
```

### 3. Frontend Setup
```bash
cd ../pdf-signature-frontend
npm install
```

#### Environment Variables (Optional)
Create a `.env` file in the frontend directory:
```env
REACT_APP_API_BASE_URL=http://localhost:3001
```

#### Start Frontend Development Server
```bash
npm start
```

### 4. Database Setup
Ensure MongoDB is running locally or update the connection string for your MongoDB service.

## 🚀 Usage

### Basic Workflow
1. **Load PDF**: Upload a PDF file or use the sample PDF
2. **Draw Signature**: Click the signature button to draw your signature
3. **Place Fields**: Select field types from the toolbar and click on PDF pages to place them
4. **Edit Fields**: Double-click text/date fields to edit, drag to reposition, resize using corner handles
5. **Sign PDF**: Click the sign button to process and download the signed PDF

### Field Types
- **Signature**: Places your drawn signature on the PDF
- **Text**: Adds editable text fields
- **Date**: Adds date picker fields
- **Checkbox**: Adds checkable boxes
- **Radio**: Adds radio button fields
- **Image**: Allows image uploads to PDF

### API Endpoints

#### POST `/sign-pdf`
Signs a PDF with placed fields and signature.
```json
{
  "pdfId": "unique-pdf-identifier",
  "pdfBase64": "base64-encoded-pdf-data",
  "signatureImageBase64": "base64-encoded-signature-png",
  "allFields": [
    {
      "id": 1234567890,
      "type": "signature",
      "page": 1,
      "x": 0.1,
      "y": 0.2,
      "width": 0.2,
      "height": 0.08,
      "value": null
    }
  ]
}
```

#### GET `/audit/:pdfId`
Retrieves audit trail for a specific PDF.

#### POST `/verify`
Verifies a signed PDF against its original hash.

#### GET `/health`
Health check endpoint.

## 📁 Project Structure

```
pdf-signature-system/
├── backend/
│   ├── package.json
│   ├── server.js
│   ├── sample-pdfs/          # Sample PDF files
│   └── signed-pdfs/          # Generated signed PDFs
└── pdf-signature-frontend/
    ├── package.json
    ├── public/
    ├── src/
    │   ├── App.js            # Main React component
    │   ├── App.css
    │   ├── index.js
    │   └── ...
    └── build/                # Production build
```

## 🔧 Development

### Backend Development
- Uses `nodemon` for auto-restart during development
- PDF processing with `pdf-lib`
- MongoDB integration for audit logging
- File system operations for PDF storage

### Frontend Development
- React functional components with hooks
- PDF.js integration for rendering
- Canvas API for signature drawing
- Tailwind CSS for styling

### Building for Production
```bash
# Backend
cd backend
npm run build  # (if build script exists)

# Frontend
cd ../pdf-signature-frontend
npm run build
```

## 🚀 Deployment

### Live Demo
- **Frontend**: [pdf-signature-system.netlify.app](https://pdf-signature-system.netlify.app)
- **Backend API**: [pdf-signature-system.onrender.com](https://pdf-signature-system.onrender.com)

### Backend Deployment
- Compatible with services like Render, Heroku, Railway
- Set environment variables for MongoDB connection
- Ensure file system permissions for PDF storage

### Frontend Deployment
- Build with `npm run build`
- Deploy to Netlify, Vercel, or any static hosting service
- Configure API base URL environment variable

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🐛 Known Issues & Limitations

- Large PDF files may require increased server memory limits
- Some PDF formats may not be fully supported by pdf-lib
- Mobile touch interactions may need optimization
- Browser compatibility: Modern browsers with Canvas API support

## 🔮 Future Enhancements

- [ ] Multi-signature support
- [ ] PDF form field detection and auto-placement
- [ ] Cloud storage integration (Azure Blob, AWS S3)
- [ ] User authentication and session management
- [ ] Batch PDF processing
- [ ] Advanced PDF editing features
- [ ] Email integration for signed document delivery
- [ ] Digital certificate integration
- [ ] Audit trail export functionality

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the audit logs for troubleshooting
- Ensure all prerequisites are properly installed

---

**Built with ❤️ using React, Node.js, and modern web technologies**</content>
<parameter name="filePath">c:\Users\ASUS\Desktop\pdf-signature-system\README.md