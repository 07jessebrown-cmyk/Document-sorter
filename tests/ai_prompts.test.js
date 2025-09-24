const {
  buildMetadataPrompt,
  buildBatchMetadataPrompt,
  validateResponse,
  getPromptStats
} = require('../src/services/ai_prompts');

describe('AI Prompts Service', () => {
  describe('buildMetadataPrompt', () => {
    it('should build a valid prompt for single document', () => {
      const text = 'INVOICE #12345\nAcme Corporation\nAmount: $1,500';
      const prompt = buildMetadataPrompt(text);

      expect(prompt).toHaveProperty('messages');
      expect(prompt.messages).toHaveLength(2);
      expect(prompt.messages[0].role).toBe('system');
      expect(prompt.messages[1].role).toBe('user');
      expect(prompt.messages[1].content).toContain(text);
      expect(prompt.maxTokens).toBe(1000);
      expect(prompt.temperature).toBe(0.1);
      expect(prompt.model).toBe('gpt-3.5-turbo');
    });

    it('should include examples by default', () => {
      const text = 'Test document';
      const prompt = buildMetadataPrompt(text);

      expect(prompt.messages[0].content).toContain('EXAMPLES:');
      expect(prompt.messages[0].content).toContain('Example 1 - Invoice:');
    });

    it('should exclude examples when requested', () => {
      const text = 'Test document';
      const prompt = buildMetadataPrompt(text, { includeExamples: false });

      expect(prompt.messages[0].content).not.toContain('EXAMPLES:');
    });

    it('should truncate long text', () => {
      const longText = 'A'.repeat(5000);
      const prompt = buildMetadataPrompt(longText);

      expect(prompt.messages[1].content).toContain('[Text truncated...]');
      expect(prompt.messages[1].content.length).toBeLessThan(5000);
    });

    it('should use custom options', () => {
      const text = 'Test document';
      const prompt = buildMetadataPrompt(text, {
        model: 'gpt-4',
        maxTokens: 2000,
        includeExamples: false
      });

      expect(prompt.model).toBe('gpt-4');
      expect(prompt.maxTokens).toBe(2000);
      expect(prompt.messages[0].content).not.toContain('EXAMPLES:');
    });

    it('should include required JSON structure in system prompt', () => {
      const text = 'Test document';
      const prompt = buildMetadataPrompt(text);

      const systemPrompt = prompt.messages[0].content;
      expect(systemPrompt).toContain('clientName');
      expect(systemPrompt).toContain('clientConfidence');
      expect(systemPrompt).toContain('date');
      expect(systemPrompt).toContain('dateConfidence');
      expect(systemPrompt).toContain('docType');
      expect(systemPrompt).toContain('docTypeConfidence');
      expect(systemPrompt).toContain('snippets');
    });
  });

  describe('buildBatchMetadataPrompt', () => {
    it('should build a valid prompt for multiple documents', () => {
      const items = [
        { text: 'Document 1 content' },
        { text: 'Document 2 content' }
      ];
      const prompt = buildBatchMetadataPrompt(items);

      expect(prompt).toHaveProperty('messages');
      expect(prompt.messages).toHaveLength(2);
      expect(prompt.messages[0].role).toBe('system');
      expect(prompt.messages[1].role).toBe('user');
      expect(prompt.messages[1].content).toContain('Document 1:');
      expect(prompt.messages[1].content).toContain('Document 2:');
      expect(prompt.maxTokens).toBe(2000);
    });

    it('should filter out empty items', () => {
      const items = [
        { text: 'Valid document' },
        { text: '' },
        { text: '   ' },
        { text: 'Another valid document' }
      ];
      const prompt = buildBatchMetadataPrompt(items);

      expect(prompt.messages[1].content).toContain('Document 1:');
      expect(prompt.messages[1].content).toContain('Document 2:');
      expect(prompt.messages[1].content).not.toContain('Document 3:');
      expect(prompt.messages[1].content).not.toContain('Document 4:');
    });

    it('should throw error for no valid items', () => {
      const items = [
        { text: '' },
        { text: '   ' }
      ];

      expect(() => buildBatchMetadataPrompt(items)).toThrow('No valid items provided for batch processing');
    });

    it('should truncate long documents in batch', () => {
      const items = [
        { text: 'A'.repeat(2000) },
        { text: 'Short document' }
      ];
      const prompt = buildBatchMetadataPrompt(items);

      expect(prompt.messages[1].content).toContain('[Text truncated...]');
    });

    it('should use custom options', () => {
      const items = [{ text: 'Test document' }];
      const prompt = buildBatchMetadataPrompt(items, {
        model: 'gpt-4',
        maxTokens: 3000,
        includeExamples: true
      });

      expect(prompt.model).toBe('gpt-4');
      expect(prompt.maxTokens).toBe(3000);
      expect(prompt.messages[0].content).toContain('EXAMPLES:');
    });
  });

  describe('validateResponse', () => {
    it('should validate correct JSON response', () => {
      const validResponse = JSON.stringify({
        clientName: 'Acme Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95,
        snippets: ['Invoice #123', 'Acme Corp']
      });

      const result = validateResponse(validResponse);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeNull();
      expect(result.data).toEqual(JSON.parse(validResponse));
    });

    it('should validate response with null values', () => {
      const validResponse = JSON.stringify({
        clientName: null,
        clientConfidence: 0.0,
        date: null,
        dateConfidence: 0.0,
        docType: null,
        docTypeConfidence: 0.0,
        snippets: []
      });

      const result = validateResponse(validResponse);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should reject invalid JSON', () => {
      const invalidResponse = 'This is not JSON';

      const result = validateResponse(invalidResponse);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('No valid JSON object found');
      expect(result.data).toBeNull();
    });

    it('should reject JSON with missing fields', () => {
      const incompleteResponse = JSON.stringify({
        clientName: 'Acme Corp',
        clientConfidence: 0.9
        // Missing other required fields
      });

      const result = validateResponse(incompleteResponse);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('should reject JSON with wrong field types', () => {
      const wrongTypesResponse = JSON.stringify({
        clientName: 'Acme Corp',
        clientConfidence: '0.9', // Should be number
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95,
        snippets: 'not an array' // Should be array
      });

      const result = validateResponse(wrongTypesResponse);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Type validation errors');
    });

    it('should reject confidence scores outside 0-1 range', () => {
      const invalidConfidenceResponse = JSON.stringify({
        clientName: 'Acme Corp',
        clientConfidence: 1.5, // Invalid confidence
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95,
        snippets: []
      });

      const result = validateResponse(invalidConfidenceResponse);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('clientConfidence must be number between 0.0 and 1.0');
    });

    it('should extract JSON from response with extra text', () => {
      const responseWithExtraText = `Here's the analysis:\n${JSON.stringify({
        clientName: 'Acme Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.8,
        docType: 'Invoice',
        docTypeConfidence: 0.95,
        snippets: ['Invoice #123']
      })}\n\nThat's the result.`;

      const result = validateResponse(responseWithExtraText);

      expect(result.isValid).toBe(true);
      expect(result.data.clientName).toBe('Acme Corp');
    });

    it('should handle malformed JSON gracefully', () => {
      const malformedResponse = '{"clientName": "Acme Corp", "clientConfidence": 0.9,}'; // Trailing comma

      const result = validateResponse(malformedResponse);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('JSON parsing error');
    });
  });

  describe('getPromptStats', () => {
    it('should return prompt statistics', () => {
      const stats = getPromptStats();

      expect(stats).toHaveProperty('totalPromptsGenerated');
      expect(stats).toHaveProperty('averageTokensUsed');
      expect(stats).toHaveProperty('validationSuccessRate');
      expect(stats).toHaveProperty('lastUpdated');
      expect(typeof stats.totalPromptsGenerated).toBe('number');
      expect(typeof stats.averageTokensUsed).toBe('number');
      expect(typeof stats.validationSuccessRate).toBe('number');
      expect(typeof stats.lastUpdated).toBe('string');
    });
  });

  describe('Integration tests', () => {
    it('should work end-to-end with valid document', () => {
      const text = 'INVOICE #12345\nAcme Corporation\nInvoice Date: January 15, 2024\nAmount: $1,500.00';
      
      // Build prompt
      const prompt = buildMetadataPrompt(text);
      expect(prompt.messages).toHaveLength(2);
      
      // Simulate LLM response
      const mockResponse = JSON.stringify({
        clientName: 'Acme Corporation',
        clientConfidence: 0.95,
        date: '2024-01-15',
        dateConfidence: 0.90,
        docType: 'Invoice',
        docTypeConfidence: 0.98,
        snippets: ['INVOICE #12345', 'Acme Corporation', 'Invoice Date: January 15, 2024']
      });
      
      // Validate response
      const validation = validateResponse(mockResponse);
      expect(validation.isValid).toBe(true);
      expect(validation.data.clientName).toBe('Acme Corporation');
    });

    it('should handle batch processing end-to-end', () => {
      const items = [
        { text: 'Invoice from ABC Corp dated 2024-01-15' },
        { text: 'Contract with XYZ Ltd effective 2024-02-01' }
      ];
      
      // Build batch prompt
      const prompt = buildBatchMetadataPrompt(items);
      expect(prompt.messages[1].content).toContain('Document 1:');
      expect(prompt.messages[1].content).toContain('Document 2:');
      
      // Simulate batch response (this would be an array in real implementation)
      const mockResponse = JSON.stringify({
        clientName: 'ABC Corp',
        clientConfidence: 0.9,
        date: '2024-01-15',
        dateConfidence: 0.85,
        docType: 'Invoice',
        docTypeConfidence: 0.95,
        snippets: ['Invoice from ABC Corp']
      });
      
      // Validate response
      const validation = validateResponse(mockResponse);
      expect(validation.isValid).toBe(true);
    });
  });
});
