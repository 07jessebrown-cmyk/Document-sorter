# Document Sorter

An intelligent Electron desktop application that automatically renames and organizes documents using AI-enhanced text extraction and OCR technology.

## Features

- **Smart File Upload**: Drag-and-drop interface for easy document processing
- **AI-Powered Renaming**: Automatically generates descriptive filenames based on document content
- **OCR Integration**: Extracts text from images and PDFs using Tesseract.js
- **AI Fallback**: Uses Large Language Models for enhanced text extraction when OCR is insufficient
- **Handwriting Detection**: Specialized OCR for handwritten content and signatures
- **Table Extraction**: Intelligently extracts and processes tabular data
- **Preview Interface**: Review and approve suggested filenames before applying
- **Multi-language Support**: Supports English, Spanish, French, German, Italian, Portuguese, and Russian
- **Batch Processing**: Process multiple documents simultaneously

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/document-sorter.git
   cd document-sorter
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

## Development

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Available Scripts

- `npm start` - Start the Electron application
- `npm test` - Run the test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run build` - Build the application for production
- `npm run dist` - Create distribution packages

### Testing

Run the complete test suite:
```bash
npm test
```

Run specific test categories:
```bash
# Unit tests only
npm test -- tests/unit/

# Integration tests only
npm test -- tests/integration/

# AI-related tests
npm test -- tests/ai-integration.test.js
```

## Configuration

The application uses a configuration system located in `config/default.json`. Key settings include:

- **OCR Settings**: Language selection, worker pool size, confidence thresholds
- **AI Settings**: LLM client configuration, prompt templates, fallback options
- **Handwriting Detection**: Specialized OCR settings for handwritten content
- **Table Extraction**: Settings for processing tabular data

## Architecture

### Core Services
- **EnhancedParsingService**: Main orchestrator for document analysis
- **OCRService**: Handles text extraction from images and PDFs
- **HandwritingService**: Specialized OCR for handwritten content
- **TableExtractor**: Extracts and processes tabular data
- **LLMClient**: Interfaces with AI services for enhanced text extraction
- **ConfigService**: Manages application configuration

### File Structure
```
src/
├── main/           # Electron main process
├── renderer/       # Electron renderer process (UI)
└── services/       # Core business logic services
    ├── ai_prompts.js
    ├── aiTextService.js
    ├── configService.js
    ├── enhancedParsingService.js
    ├── handwritingService.js
    ├── ocrService.js
    └── tableExtractor.js
```

## API Keys and Environment

Create a `.env` file in the root directory for your API keys:
```bash
# Example .env file
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

**Important**: Never commit your `.env` file to version control. It's already included in `.gitignore`.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Testing Strategy

The project includes comprehensive testing:

- **Unit Tests**: Test individual service functions
- **Integration Tests**: Test service interactions
- **AI Integration Tests**: Test LLM client functionality
- **Performance Tests**: Test processing speed and memory usage
- **E2E Tests**: Test complete user workflows

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- OCR powered by [Tesseract.js](https://tesseract.projectnaptha.com/)
- AI integration with OpenAI and Anthropic APIs
- Testing with [Jest](https://jestjs.io/)

## Support

For support, please open an issue on GitHub or contact the development team.