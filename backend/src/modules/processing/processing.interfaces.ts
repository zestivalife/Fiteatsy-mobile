import { StoredObject } from '../shared/storage.js';

export type ProcessingOutcomeStatus = 'completed' | 'failed' | 'review_required';

export type DocumentProcessingResult = {
  status: ProcessingOutcomeStatus;
  extractedTextRef?: string;
  reportType?: string;
  confidence?: number;
  error?: string;
};

export type ExtractedBiomarkerCandidate = {
  rawLabel: string;
  value: number;
  unit: string;
  referenceRange?: string;
  confidence: number;
};

export type BiomarkerExtractionResult = {
  status: ProcessingOutcomeStatus;
  candidates: ExtractedBiomarkerCandidate[];
  error?: string;
};

export type ClinicalValidationResult = {
  status: ProcessingOutcomeStatus;
  validationStatus: 'pending' | 'validated' | 'rejected' | 'review_required';
  confidence: number;
  notes: string[];
};

export type HealthIntelligencePreparationResult = {
  status: ProcessingOutcomeStatus;
  triggerAccepted: boolean;
  reason?: string;
};

export interface DocumentProcessor {
  processDocument(document: StoredObject): Promise<DocumentProcessingResult>;
}

export interface BiomarkerExtractor {
  extractBiomarkers(input: DocumentProcessingResult): Promise<BiomarkerExtractionResult>;
}

export interface ClinicalValidator {
  validateBiomarker(candidate: ExtractedBiomarkerCandidate): Promise<ClinicalValidationResult>;
}

export interface HealthIntelligenceEngine {
  enqueueRecalculation(input: {
    clientId: string;
    source: 'health_observation' | 'health_report' | 'biomarker_observation';
    sourceId: string;
  }): Promise<HealthIntelligencePreparationResult>;
}
