
// ==================== CONFIGURAÇÃO DE UPLOADS ====================

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configura diretório de uploads
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Diretório de uploads criado:', uploadsDir);
}

// Configura multer para upload de arquivos - salva temporariamente em uploads/temp
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Salva temporariamente em uploads/temp - será movido depois para o diretório correto
    const tempDir = path.join(uploadsDir, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // Gera nome único para o arquivo
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB máximo (suporta vídeos)
  },
  fileFilter: function (req, file, cb) {
    // Tipos permitidos
    const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm', 'video/x-msvideo',
    'audio/ogg', 'audio/mpeg', 'audio/aac', 'audio/wav', 'audio/opus'];


    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Use: JPG, PNG, GIF, WEBP, PDF ou DOC/DOCX'));
    }
  }
});

module.exports = {
  upload,
  uploadsDir
};