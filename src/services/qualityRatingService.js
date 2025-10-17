/**
 * Enhanced Quality Rating Service
 * Provides comprehensive quality assessment with automated sub-metrics
 * Implements 1-5 scale with detailed analysis for root-cause identification
 */

class QualityRatingService {
  constructor(options = {}) {
    this.options = {
      minFilenameLength: 10,
      maxFilenameLength: 100,
      forbiddenPatterns: [
        /^Document\d*$/i,
        /^File\d*$/i,
        /^Untitled\d*$/i,
        /^New\s+Document\d*$/i,
        /^Scan\d*$/i
      ],
      requiredElements: ['date', 'type', 'identifier'],
      ...options
    };
  }

  /**
   * Rate AI suggestion quality with detailed sub-metrics
   * @param {Object} suggestion - AI suggestion data
   * @param {string} suggestion.originalFilename - Original filename
   * @param {string} suggestion.suggestedFilename - AI suggested filename
   * @param {Object} suggestion.analysisResult - AI analysis metadata
   * @param {string} suggestion.extractedText - Document text content
   * @returns {Object} Comprehensive quality rating
   */
  rateSuggestion(suggestion) {
    const {
      originalFilename,
      suggestedFilename,
      analysisResult,
      extractedText
    } = suggestion;

    // Initialize rating components
    const rating = {
      overall: 0,
      humanRating: null, // To be filled by human evaluator
      automatedMetrics: {
        accuracy: 0,
        format: 0,
        length: 0,
        creativity: 0,
        completeness: 0
      },
      issues: [],
      strengths: [],
      recommendations: [],
      metadata: {
        originalFilename,
        suggestedFilename,
        textLength: extractedText?.length || 0,
        timestamp: new Date().toISOString()
      }
    };

    // 1. Accuracy Assessment (0-1)
    rating.automatedMetrics.accuracy = this.assessAccuracy(suggestion);
    
    // 2. Format Assessment (0-1)
    rating.automatedMetrics.format = this.assessFormat(suggestedFilename);
    
    // 3. Length Assessment (0-1)
    rating.automatedMetrics.length = this.assessLength(suggestedFilename);
    
    // 4. Creativity Assessment (0-1)
    rating.automatedMetrics.creativity = this.assessCreativity(suggestion);
    
    // 5. Completeness Assessment (0-1)
    rating.automatedMetrics.completeness = this.assessCompleteness(suggestion);

    // Calculate overall automated score (weighted average)
    const weights = {
      accuracy: 0.35,
      format: 0.20,
      length: 0.15,
      creativity: 0.15,
      completeness: 0.15
    };

    rating.overall = Object.keys(rating.automatedMetrics).reduce((sum, metric) => {
      return sum + (rating.automatedMetrics[metric] * weights[metric]);
    }, 0);

    // Convert to 1-5 scale
    rating.overall = Math.round(rating.overall * 4) + 1;

    // Generate issues and recommendations
    this.generateIssuesAndRecommendations(rating, suggestion);

    return rating;
  }

  /**
   * Assess accuracy of AI suggestion
   */
  assessAccuracy(suggestion) {
    const { suggestedFilename, analysisResult, extractedText } = suggestion;
    let accuracy = 0.5; // Base accuracy

    // Check if filename contains extracted entities
    if (analysisResult) {
      const { type, clientName, date } = analysisResult;
      
      // Type accuracy
      if (type && suggestedFilename.toLowerCase().includes(type.toLowerCase())) {
        accuracy += 0.2;
      }
      
      // Client name accuracy
      if (clientName && clientName !== 'Unknown' && 
          suggestedFilename.toLowerCase().includes(clientName.toLowerCase().split(' ')[0])) {
        accuracy += 0.2;
      }
      
      // Date accuracy
      if (date && suggestedFilename.includes(date)) {
        accuracy += 0.1;
      }
    }

    // Check for generic/fallback patterns
    if (this.options.forbiddenPatterns.some(pattern => pattern.test(suggestedFilename))) {
      accuracy = 0.1; // Very low for generic names
    }

    return Math.min(accuracy, 1.0);
  }

  /**
   * Assess format quality of filename
   */
  assessFormat(filename) {
    let format = 0.5; // Base format score

    // Check for proper separators
    if (filename.includes('_') || filename.includes('-')) {
      format += 0.2;
    }

    // Check for proper case (not all caps or all lowercase)
    const hasMixedCase = /[A-Z]/.test(filename) && /[a-z]/.test(filename);
    if (hasMixedCase) {
      format += 0.1;
    }

    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*]/.test(filename);
    if (!invalidChars) {
      format += 0.2;
    }

    return Math.min(format, 1.0);
  }

  /**
   * Assess length appropriateness
   */
  assessLength(filename) {
    const length = filename.length;
    
    if (length < this.options.minFilenameLength) {
      return 0.2; // Too short
    } else if (length > this.options.maxFilenameLength) {
      return 0.3; // Too long
    } else if (length >= 20 && length <= 60) {
      return 1.0; // Optimal length
    } else {
      return 0.7; // Acceptable length
    }
  }

  /**
   * Assess creativity and uniqueness
   */
  assessCreativity(suggestion) {
    const { suggestedFilename, originalFilename } = suggestion;
    let creativity = 0.5; // Base creativity

    // Check if filename is significantly different from original
    const similarity = this.calculateSimilarity(originalFilename, suggestedFilename);
    if (similarity < 0.3) {
      creativity += 0.3; // Good differentiation
    }

    // Check for descriptive elements
    const descriptiveWords = ['invoice', 'contract', 'report', 'agreement', 'proposal', 'statement'];
    const hasDescriptiveWords = descriptiveWords.some(word => 
      suggestedFilename.toLowerCase().includes(word)
    );
    if (hasDescriptiveWords) {
      creativity += 0.2;
    }

    return Math.min(creativity, 1.0);
  }

  /**
   * Assess completeness of information
   */
  assessCompleteness(suggestion) {
    const { suggestedFilename, analysisResult } = suggestion;
    let completeness = 0.2; // Base completeness

    // Check for required elements
    const hasDate = /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{4}/.test(suggestedFilename);
    const hasType = /invoice|contract|report|agreement|proposal|statement|notes/i.test(suggestedFilename);
    const hasIdentifier = /[A-Za-z]{3,}/.test(suggestedFilename);

    if (hasDate) completeness += 0.3;
    if (hasType) completeness += 0.3;
    if (hasIdentifier) completeness += 0.2;

    return Math.min(completeness, 1.0);
  }

  /**
   * Generate issues and recommendations
   */
  generateIssuesAndRecommendations(rating, suggestion) {
    const { suggestedFilename, analysisResult } = suggestion;

    // Length issues
    if (rating.automatedMetrics.length < 0.5) {
      if (suggestedFilename.length < this.options.minFilenameLength) {
        rating.issues.push('Filename too short');
        rating.recommendations.push('Include more descriptive elements');
      } else if (suggestedFilename.length > this.options.maxFilenameLength) {
        rating.issues.push('Filename too long');
        rating.recommendations.push('Shorten filename while keeping key information');
      }
    }

    // Format issues
    if (rating.automatedMetrics.format < 0.5) {
      rating.issues.push('Poor filename format');
      rating.recommendations.push('Use underscores or hyphens as separators');
    }

    // Accuracy issues
    if (rating.automatedMetrics.accuracy < 0.5) {
      rating.issues.push('Low accuracy');
      rating.recommendations.push('Improve entity extraction and matching');
    }

    // Completeness issues
    if (rating.automatedMetrics.completeness < 0.5) {
      rating.issues.push('Incomplete information');
      rating.recommendations.push('Include date, document type, and key identifier');
    }

    // Generic name issues
    if (this.options.forbiddenPatterns.some(pattern => pattern.test(suggestedFilename))) {
      rating.issues.push('Generic filename');
      rating.recommendations.push('Use specific document information instead of generic terms');
    }

    // Generate strengths
    if (rating.automatedMetrics.accuracy > 0.7) {
      rating.strengths.push('High accuracy');
    }
    if (rating.automatedMetrics.format > 0.7) {
      rating.strengths.push('Good format');
    }
    if (rating.automatedMetrics.length > 0.7) {
      rating.strengths.push('Appropriate length');
    }
    if (rating.automatedMetrics.creativity > 0.7) {
      rating.strengths.push('Creative naming');
    }
    if (rating.automatedMetrics.completeness > 0.7) {
      rating.strengths.push('Complete information');
    }
  }

  /**
   * Calculate string similarity (simple implementation)
   */
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Batch rate multiple suggestions
   */
  rateSuggestions(suggestions) {
    return suggestions.map(suggestion => this.rateSuggestion(suggestion));
  }

  /**
   * Generate quality summary report
   */
  generateQualityReport(ratings) {
    const total = ratings.length;
    const avgOverall = ratings.reduce((sum, r) => sum + r.overall, 0) / total;
    
    const avgMetrics = {
      accuracy: ratings.reduce((sum, r) => sum + r.automatedMetrics.accuracy, 0) / total,
      format: ratings.reduce((sum, r) => sum + r.automatedMetrics.format, 0) / total,
      length: ratings.reduce((sum, r) => sum + r.automatedMetrics.length, 0) / total,
      creativity: ratings.reduce((sum, r) => sum + r.automatedMetrics.creativity, 0) / total,
      completeness: ratings.reduce((sum, r) => sum + r.automatedMetrics.completeness, 0) / total
    };

    const distribution = {
      excellent: ratings.filter(r => r.overall >= 5).length,
      good: ratings.filter(r => r.overall === 4).length,
      mediocre: ratings.filter(r => r.overall === 3).length,
      bad: ratings.filter(r => r.overall === 2).length,
      terrible: ratings.filter(r => r.overall === 1).length
    };

    return {
      summary: {
        totalSuggestions: total,
        averageOverall: avgOverall.toFixed(2),
        averageMetrics: avgMetrics,
        distribution: distribution,
        successRate: ((distribution.excellent + distribution.good) / total * 100).toFixed(1) + '%'
      },
      recommendations: this.generateOverallRecommendations(avgMetrics, distribution)
    };
  }

  /**
   * Generate overall recommendations based on metrics
   */
  generateOverallRecommendations(avgMetrics, distribution) {
    const recommendations = [];

    if (avgMetrics.accuracy < 0.6) {
      recommendations.push('Improve entity extraction accuracy');
    }
    if (avgMetrics.format < 0.6) {
      recommendations.push('Standardize filename formatting rules');
    }
    if (avgMetrics.length < 0.6) {
      recommendations.push('Optimize filename length constraints');
    }
    if (avgMetrics.creativity < 0.6) {
      recommendations.push('Enhance creative naming patterns');
    }
    if (avgMetrics.completeness < 0.6) {
      recommendations.push('Ensure all required elements are included');
    }

    if (distribution.terrible > distribution.excellent) {
      recommendations.push('Focus on fundamental improvements before optimization');
    }

    return recommendations;
  }
}

module.exports = QualityRatingService;
