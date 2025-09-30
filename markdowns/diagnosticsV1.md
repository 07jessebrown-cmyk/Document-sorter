You are an AI coding agent. Your task is to generate a full diagnostic report of the failing AI features in this project.

### Instructions:
1. Review the following features and their implementations:
   - handwritingDetection
   - watermarkDetection
   - aiExtraction
   - ocrFallback
   - tableExtraction

2. For each feature:
   - Locate the main implementation file(s).
   - Check how the feature is invoked in the codebase.
   - Identify whether the feature is implemented, partially implemented, or stubbed.
   - Inspect the test cases for these features.
   - Determine if test data is valid and aligned with the feature logic.
   - Run tests individually and capture logs/outputs.

3. Generate a **diagnostic report** in this format:
   - **Feature Name**
     - Implementation status (complete / partial / missing)
     - Current behavior during tests
     - Root cause of failure (e.g., no output, misaligned test data, unimplemented logic)
     - Confidence level (high / medium / low)

4. At the end of the report, include:
   - A prioritized list of the most critical failing features.
   - Recommendations for what to fix first.
   - Any potential false positives (cases where tests may be unrealistic).

### Deliverable:
Output only the diagnostic report in Markdown format. Do not attempt to fix anything yet.