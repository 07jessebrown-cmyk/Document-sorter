// End-to-End tests for AI-enhanced document processing
const fs = require('fs');
const path = require('path');
const EnhancedParsingService = require('../src/services/enhancedParsingService');
const AITextService = require('../src/services/aiTextService');
const LLMClient = require('../src/services/llmClient');
const AICache = require('../src/services/aiCache');

// Mock external dependencies
jest.mock('pdf-parse', () => jest.fn());
jest.mock('mammoth', () => ({
  extractRawText: jest.fn()
}));
jest.mock('tesseract.js', () => ({
  recognize: jest.fn()
}));
jest.mock('sharp', () => jest.fn());

// Mock file system operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  accessSync: jest.fn(),
  mkdirSync: jest.fn(),
  renameSync: jest.fn(),
  statSync: jest.fn(),
  readFile: jest.fn(),
  constants: {
    F_OK: 0
  }
}));

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');

// Mock AITextService
const mockAITextService = {
  setLLMClient: jest.fn(),
  setCache: jest.fn(),
  extractMetadataAI: jest.fn(),
  getConfig: jest.fn(() => ({
    enabled: true,
    model: 'gpt-3.5-turbo',
    confidenceThreshold: 0.5,
    batchSize: 5,
    hasLLMClient: true,
    hasCache: true
  })),
  isReady: jest.fn(() => true)
};

jest.mock('../src/services/aiTextService', () => {
  return jest.fn().mockImplementation(() => mockAITextService);
});

describe('E2E AI-Enhanced Document Processing', () => {
  let enhancedService;
  let mockLLMClient;
  let mockCache;

  beforeEach(async () => {
    // Reset environment
    process.env.NODE_ENV = 'test';
    process.env.USE_AI = 'true';
    
    // Setup mocks
    jest.clearAllMocks();
    fs.mkdirSync.mockImplementation(() => {});
    fs.renameSync.mockImplementation(() => {});
    fs.statSync.mockImplementation(() => ({
      mtime: new Date('2024-01-15')
    }));

    // Create mock LLM client
    mockLLMClient = {
      callLLM: jest.fn().mockImplementation((params) => {
        console.log('Mock LLM called with:', params);
        return Promise.resolve({
          content: JSON.stringify({
            clientName: 'Advanced Technologies Inc.',
            clientConfidence: 0.95,
            date: '2024-01-15',
            dateConfidence: 0.9,
            docType: 'Service Agreement',
            docTypeConfidence: 0.98,
            snippets: ['Company: Advanced Technologies Inc.', 'Document Date: January 15, 2024', 'Type: Service Agreement']
          })
        });
      }),
      testConnection: jest.fn().mockResolvedValue(true),
      getConfig: jest.fn().mockReturnValue({ mockMode: true })
    };

    // Create mock cache
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      generateHash: jest.fn((text) => 'mock-hash-' + text.length),
      initialize: jest.fn().mockResolvedValue(),
      close: jest.fn().mockResolvedValue(),
      getStats: jest.fn().mockReturnValue({ hits: 0, misses: 0, size: 0 })
    };

    // Create enhanced parsing service
    enhancedService = new EnhancedParsingService({
      useAI: true,
      aiConfidenceThreshold: 0.5,
      aiBatchSize: 2
    });

    // Inject mocks
    enhancedService.llmClient = mockLLMClient;
    enhancedService.aiCache = mockCache;
    
    // Configure the mock to return the expected AI response
    mockAITextService.extractMetadataAI.mockImplementation((text, options) => {
      console.log('Mock AITextService.extractMetadataAI called with:', { text: text.substring(0, 50) + '...', options });
      return Promise.resolve({
        clientName: 'Advanced Technologies Inc.',
        clientConfidence: 0.95,
        date: '2024-01-15',
        dateConfidence: 0.9,
        docType: 'Service Agreement',
        docTypeConfidence: 0.98,
        snippets: ['Company: Advanced Technologies Inc.', 'Document Date: January 15, 2024', 'Type: Service Agreement']
      });
    });
    
    // Initialize AI services
    await enhancedService.initializeAIServices();
    
    // Debug: Check if AI service is properly configured
    console.log('AI Service Config:', enhancedService.aiTextService.getConfig());
    console.log('AI Service Ready:', enhancedService.aiTextService.isReady());
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      if (enhancedService) {
        await enhancedService.shutdown();
      }
      
      // Clear any timers that might be left over
      jest.clearAllTimers();
      
      // Reset mock implementations
      mockAITextService.extractMetadataAI.mockReset();
      mockLLMClient.callLLM.mockReset();
      mockCache.get.mockReset();
      mockCache.set.mockReset();
      
    } catch (error) {
      console.warn('Error in afterEach cleanup:', error.message);
    }
  });

  afterAll(async () => {
    jest.clearAllTimers();
    if (enhancedService && enhancedService.shutdown) await enhancedService.shutdown();
    if (mockCache && mockCache.close) await mockCache.close();
  });

  describe('Complete PDF Processing with AI Fallback', () => {
    it('should process PDF with no regex matches and show AI results in preview', async () => {
      // Mock PDF content that won't match regex patterns well
      const mockPdfContent = `
        Some complex business document
        This document contains complex technical specifications
        that require AI analysis for proper classification
        and metadata extraction
      `;
      
      pdfParse.mockResolvedValue({
        text: mockPdfContent,
        numpages: 1
      });
      
      // Mock file operations
      fs.readFile.mockResolvedValue(Buffer.from('mock pdf data'));
      fs.accessSync.mockImplementation(() => { throw new Error('File not found'); });
      
      // Mock cache to return null (no cached result)
      mockCache.get.mockResolvedValue(null);
      
      // Process document end-to-end
      const result = await processDocumentWithAI('/test/complex-document.pdf', enhancedService);
      
      console.log('E2E Test Result:', JSON.stringify(result, null, 2));
      console.log('AITextService.extractMetadataAI called:', mockAITextService.extractMetadataAI.mock.calls.length, 'times');
      console.log('AITextService.extractMetadataAI calls:', mockAITextService.extractMetadataAI.mock.calls);
      
      // Check what processWithAI would return
      const aiResult = await enhancedService.processWithAI(result.analysis.rawText, '/test/complex-document.pdf');
      console.log('Direct processWithAI result:', JSON.stringify(aiResult, null, 2));
      
      expect(result.success).toBe(true);
      expect(result.analysis.source).toBe('hybrid'); // AI + regex = hybrid
      expect(result.analysis.clientName).toBe('Advanced Technologies Inc.');
      expect(result.analysis.type).toBe('Service Agreement');
      expect(result.analysis.date).toBe('2024-01-15');
      expect(result.analysis.confidence).toBeGreaterThan(0.5);
      expect(result.analysis.snippets).toHaveLength(3);
      expect(result.finalPath).toContain('Advanced_Technologies_Inc');
      expect(result.finalPath).toContain('Service_Agreement');
      expect(result.finalPath).toContain('2024-01-15');
    });

    it('should process PDF with mixed regex/AI results', async () => {
      // Mock PDF content that's ambiguous enough to trigger AI
      const mockPdfContent = `
        Some complex business document
        This document contains mixed patterns requiring hybrid processing
        for optimal metadata extraction and classification
        Service details and terms that need AI analysis
        Additional complex information requiring intelligent processing
      `;
      
      pdfParse.mockResolvedValue({
        text: mockPdfContent,
        numpages: 1
      });
      
      fs.readFile.mockResolvedValue(Buffer.from('mock pdf data'));
      fs.accessSync.mockImplementation(() => { throw new Error('File not found'); });
      
      // Configure mock AI response for this test
      mockAITextService.extractMetadataAI.mockResolvedValue({
        clientName: 'Acme Corporation',
        clientConfidence: 0.98,
        date: '2024-01-15',
        dateConfidence: 0.95,
        docType: 'Invoice',
        docTypeConfidence: 0.99,
        snippets: ['INVOICE', 'Bill to: Acme Corporation', 'Date: 2024-01-15']
      });

      mockCache.get.mockResolvedValue(null);
      
      const result = await processDocumentWithAI('/test/mixed-document.pdf', enhancedService);
      
      expect(result.success).toBe(true);
      expect(result.analysis.source).toBe('hybrid');
      expect(result.analysis.clientName).toBe('Acme Corporation');
      expect(result.analysis.type).toBe('Invoice');
      expect(result.analysis.date).toBe('2024-01-15');
    });
  });

  describe('Complete DOCX Processing with AI Fallback', () => {
    it('should process DOCX with AI when regex fails', async () => {
      const mockDocxContent = `
        Complex business document
        This document contains technical specifications
        that require AI analysis for proper classification
        Project scope and deliverables information
        Budget and timeline details requiring intelligent processing
      `;
      
      mammoth.extractRawText.mockResolvedValue({
        value: mockDocxContent
      });
      
      fs.readFile.mockResolvedValue(Buffer.from('mock docx data'));
      fs.accessSync.mockImplementation(() => { throw new Error('File not found'); });
      
      // Configure mock AI response for this test
      mockAITextService.extractMetadataAI.mockResolvedValue({
        clientName: 'Tech Solutions LLC',
        clientConfidence: 0.92,
        date: '2024-03-20',
        dateConfidence: 0.88,
        docType: 'Proposal',
        docTypeConfidence: 0.96,
        snippets: ['Prepared for: Tech Solutions LLC', 'Proposal Date: March 20, 2024', 'Business Proposal']
      });

      mockCache.get.mockResolvedValue(null);
      
      const result = await processDocumentWithAI('/test/proposal.docx', enhancedService);
      
      expect(result.success).toBe(true);
      expect(result.analysis.source).toBe('hybrid'); // AI + regex = hybrid
      expect(result.analysis.clientName).toBe('Tech Solutions LLC');
      expect(result.analysis.type).toBe('Proposal');
      expect(result.analysis.date).toBe('2024-03-20');
      expect(result.finalPath).toContain('Tech_Solutions_LLC');
      expect(result.finalPath).toContain('Proposal');
    });
  });

  describe('Image OCR Processing with AI Enhancement', () => {
    it('should process image with OCR and AI enhancement', async () => {
      const mockOcrText = `
        Complex legal document
        This document contains legal language
        that requires AI analysis for proper extraction
        Terms and conditions information
        Additional complex content requiring intelligent processing
      `;
      
      // Mock sharp preprocessing
      const mockSharpInstance = {
        metadata: jest.fn().mockResolvedValue({ width: 1000, height: 1000 }),
        grayscale: jest.fn().mockReturnThis(),
        threshold: jest.fn().mockReturnThis(),
        resize: jest.fn().mockReturnThis(),
        png: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed image'))
      };
      sharp.mockReturnValue(mockSharpInstance);
      
      // Mock Tesseract OCR
      Tesseract.recognize.mockResolvedValue({
        data: { text: mockOcrText }
      });
      
      fs.readFile.mockResolvedValue(Buffer.from('mock image data'));
      fs.accessSync.mockImplementation(() => { throw new Error('File not found'); });
      
      // Configure mock AI response for this test
      mockAITextService.extractMetadataAI.mockResolvedValue({
        clientName: 'Global Enterprises',
        clientConfidence: 0.94,
        date: '2024-02-10',
        dateConfidence: 0.91,
        docType: 'Contract',
        docTypeConfidence: 0.97,
        snippets: ['Contract Agreement', 'Between: Global Enterprises', 'Effective Date: February 10, 2024']
      });

      mockCache.get.mockResolvedValue(null);
      
      const result = await processDocumentWithAI('/test/contract.png', enhancedService);
      
      expect(result.success).toBe(true);
      expect(result.analysis.source).toBe('hybrid'); // AI + regex = hybrid
      expect(result.analysis.clientName).toBe('Global Enterprises');
      expect(result.analysis.type).toBe('Contract');
      expect(result.analysis.date).toBe('2024-02-10');
    });
  });

  describe('Preview UI Integration', () => {
    it('should provide data for preview table with AI source and confidence', async () => {
      const mockPdfContent = 'Complex document requiring AI analysis';
      
      pdfParse.mockResolvedValue({
        text: mockPdfContent,
        numpages: 1
      });
      
      fs.readFile.mockResolvedValue(Buffer.from('mock pdf data'));
      fs.accessSync.mockImplementation(() => { throw new Error('File not found'); });
      
      // Configure mock AI response for this test
      mockAITextService.extractMetadataAI.mockResolvedValue({
        clientName: 'AI Detected Client',
        clientConfidence: 0.85,
        date: '2024-01-15',
        dateConfidence: 0.78,
        docType: 'Report',
        docTypeConfidence: 0.92,
        snippets: ['AI snippet 1', 'AI snippet 2']
      });

      mockCache.get.mockResolvedValue(null);
      
      const result = await processDocumentWithAI('/test/preview-test.pdf', enhancedService);
      
      // Verify preview data structure
      expect(result.previewData).toBeDefined();
      expect(result.previewData.source).toBe('Hybrid'); // AI + regex = Hybrid
      expect(result.previewData.confidence).toBeGreaterThan(0.5);
      expect(result.previewData.clientName).toBe('AI Detected Client');
      expect(result.previewData.documentType).toBe('Report');
      expect(result.previewData.date).toBe('2024-01-15');
      expect(result.previewData.snippets).toHaveLength(2);
    });

    it('should show confidence badges and source labels in preview', async () => {
      const mockPdfContent = 'Document for confidence testing';
      
      pdfParse.mockResolvedValue({
        text: mockPdfContent,
        numpages: 1
      });
      
      fs.readFile.mockResolvedValue(Buffer.from('mock pdf data'));
      fs.accessSync.mockImplementation(() => { throw new Error('File not found'); });
      
      // Configure mock AI response for this test
      mockAITextService.extractMetadataAI.mockResolvedValue({
        clientName: 'Test Client',
        clientConfidence: 0.3, // Low confidence
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.9,
        snippets: ['Test snippet']
      });

      mockCache.get.mockResolvedValue(null);
      
      const result = await processDocumentWithAI('/test/confidence-test.pdf', enhancedService);
      
      expect(result.previewData).toBeDefined();
      expect(result.previewData.clientConfidence).toBe(30); // Converted to percentage
      expect(result.previewData.dateConfidence).toBe(80); // Converted to percentage
      expect(result.previewData.docTypeConfidence).toBe(90); // Converted to percentage
      expect(result.previewData.hasLowConfidence).toBe(true); // Client confidence < 0.5
    });
  });

  describe('Error Recovery and Fallbacks', () => {
    it('should fall back to regex when AI service is unavailable', async () => {
      const mockPdfContent = 'INVOICE\nBill to: Fallback Corp\nDate: 2024-01-15\nAmount: $1,500.00';
      
      pdfParse.mockResolvedValue({
        text: mockPdfContent,
        numpages: 1
      });
      
      fs.readFile.mockResolvedValue(Buffer.from('mock pdf data'));
      fs.accessSync.mockImplementation(() => { throw new Error('File not found'); });
      
      // Configure mock AI service to fail (simulating AI unavailable)
      mockAITextService.extractMetadataAI.mockRejectedValue(new Error('AI service unavailable'));
      
      mockCache.get.mockResolvedValue(null);
      
      const result = await processDocumentWithAI('/test/ai-unavailable.pdf', enhancedService);
      
      expect(result.success).toBe(true);
      expect(result.analysis.source).toBe('regex');
      expect(result.analysis.clientName).toBe('Fallback Corp');
      expect(result.analysis.type).toBe('Invoice');
    });

    it('should handle malformed AI responses gracefully', async () => {
      const mockPdfContent = 'Document for malformed response testing';
      
      pdfParse.mockResolvedValue({
        text: mockPdfContent,
        numpages: 1
      });
      
      fs.readFile.mockResolvedValue(Buffer.from('mock pdf data'));
      fs.accessSync.mockImplementation(() => { throw new Error('File not found'); });
      
      // Configure mock AI response to return null (simulating malformed response)
      mockAITextService.extractMetadataAI.mockResolvedValue(null);

      mockCache.get.mockResolvedValue(null);
      
      const result = await processDocumentWithAI('/test/malformed-response.pdf', enhancedService);
      
      expect(result.success).toBe(true);
      expect(result.analysis.source).toBe('regex');
    });
  });

  describe('Performance and Concurrency', () => {
    it('should process multiple documents efficiently with AI', async () => {
      const documents = [
        '/test/doc1.pdf',
        '/test/doc2.pdf',
        '/test/doc3.pdf'
      ];

      // Mock PDF content for all documents
      pdfParse.mockResolvedValue({
        text: 'Complex document requiring AI analysis',
        numpages: 1
      });
      
      fs.readFile.mockResolvedValue(Buffer.from('mock pdf data'));
      fs.accessSync.mockImplementation(() => { throw new Error('File not found'); });
      
      const mockAIResponse = {
        content: JSON.stringify({
          clientName: 'AI Client',
          clientConfidence: 0.9,
          date: '2024-01-15',
          dateConfidence: 0.8,
          docType: 'Invoice',
          docTypeConfidence: 0.95,
          snippets: ['AI snippet']
        })
      };

      mockCache.get.mockResolvedValue(null);
      mockLLMClient.callLLM.mockResolvedValue(mockAIResponse);
      
      const startTime = Date.now();
      const results = await Promise.all(
        documents.map(doc => processDocumentWithAI(doc, enhancedService))
      );
      const endTime = Date.now();
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});

// Helper function to simulate complete document processing with AI
async function processDocumentWithAI(filePath, service = enhancedService) {
  try {
    // 1. Extract text based on file type
    const ext = path.extname(filePath).toLowerCase();
    let extractedText = '';
    
    if (ext === '.pdf') {
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);
      extractedText = pdfData.text;
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value;
    } else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
      const mockSharpInstance = {
        metadata: jest.fn().mockResolvedValue({ width: 1000, height: 1000 }),
        grayscale: jest.fn().mockReturnThis(),
        threshold: jest.fn().mockReturnThis(),
        resize: jest.fn().mockReturnThis(),
        png: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed image'))
      };
      sharp.mockReturnValue(mockSharpInstance);
      
      const preprocessedBuffer = await mockSharpInstance.toBuffer();
      const result = await Tesseract.recognize(preprocessedBuffer, 'eng');
      extractedText = result.data.text;
    }
    
    // 2. Analyze document with AI-enhanced service
    const analysis = await service.analyzeDocumentEnhanced(extractedText, filePath);
    
    // 3. Generate filename
    const fileName = generateFileName(analysis, ext);
    const folder = mapTypeToFolder(analysis.type);
    
    // 4. Handle file operations
    const destRoot = path.join(require('os').homedir(), 'Desktop', 'sorted_files', folder);
    fs.mkdirSync(destRoot, { recursive: true });
    
    let finalPath = path.join(destRoot, fileName);
    finalPath = ensureUniquePath(finalPath);
    
    fs.renameSync(filePath, finalPath);
    
    // 5. Prepare preview data
    const previewData = {
      source: analysis.source === 'ai' ? 'AI' : analysis.source === 'hybrid' ? 'Hybrid' : 'Regex',
      confidence: Math.round(analysis.confidence * 100),
      clientName: analysis.clientName || 'Unknown',
      documentType: analysis.type || 'Unclassified',
      date: analysis.date || 'Unknown',
      snippets: analysis.snippets || [],
      clientConfidence: Math.round((analysis.clientConfidence || 0) * 100),
      dateConfidence: Math.round((analysis.dateConfidence || 0) * 100),
      docTypeConfidence: Math.round((analysis.docTypeConfidence || 0) * 100),
      hasLowConfidence: (analysis.clientConfidence || 0) < 0.5 || (analysis.dateConfidence || 0) < 0.5 || (analysis.docTypeConfidence || 0) < 0.5
    };
    
    return { 
      success: true, 
      finalPath, 
      analysis,
      previewData
    };
    
  } catch (error) {
    console.error('processDocumentWithAI error:', error);
    return { 
      success: false, 
      error: error.message,
      analysis: null,
      previewData: null
    };
  }
}

// Helper functions
function generateFileName(documentData, extension) {
  const parts = [];
  
  let clientName = 'Client_NA';
  if (documentData.clientName && documentData.clientName.trim()) {
    clientName = documentData.clientName.trim();
  }
  parts.push(sanitizeComponent(clientName));
  
  let documentType = 'Unclassified';
  if (documentData.type && documentData.type.trim()) {
    documentType = documentData.type.trim();
  }
  parts.push(sanitizeComponent(documentType));
  
  let dateString = new Date().toISOString().split('T')[0];
  if (documentData.date && documentData.date.trim()) {
    dateString = documentData.date.trim();
  }
  parts.push(sanitizeComponent(dateString));
  
  const fileName = parts.filter(Boolean).join('_') + extension;
  return sanitizeFileName(fileName);
}

function sanitizeComponent(component) {
  if (!component || typeof component !== 'string') {
    return 'Unknown';
  }
  
  return component
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50) || 'Unknown';
}

function sanitizeFileName(fileName) {
  return fileName
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 200) || 'Unnamed_Document';
}

function mapTypeToFolder(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('invoice')) return 'Invoices';
  if (t.includes('resume')) return 'Resumes';
  if (t.includes('contract')) return 'Contracts';
  if (t.includes('statement')) return 'Statements';
  if (t.includes('proposal')) return 'Proposals';
  if (t.includes('report')) return 'Reports';
  return 'Unsorted';
}

function ensureUniquePath(targetPath) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const ext = path.extname(base);
  const name = base.slice(0, base.length - ext.length);
  let candidate = targetPath;
  let i = 1;
  
  while (true) {
    try {
      fs.accessSync(candidate, fs.constants.F_OK);
      candidate = path.join(dir, `${name}_${i}${ext}`);
      i += 1;
    } catch {
      return candidate;
    }
  }
}
