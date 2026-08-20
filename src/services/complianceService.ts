/**
 * Compliance Service
 * 
 * Centralized service for HIPAA compliance operations including:
 * - PHI encryption/decryption
 * - Patient consent management
 * - Clinical notes access control
 * - DEA Form 222 tracking
 * - Controlled substance logging
 */

import { encryptPHI, decryptPHI, hashForAudit, generateConsentToken } from '../utils/hipaaEncryption';
import {
  PatientConsent,
  ClinicalNote,
  DEAForm222,
  ControlledSubstanceLog,
  canAccessClinicalData,
  canCreateClinicalNotes,
  canOverrideInteractions,
  canSubmitDEA222,
} from '../types/compliance';
import { StaffRole, User } from '../data';

// In-memory stores (would be database tables in production)
let patientConsents: PatientConsent[] = [];
let clinicalNotes: ClinicalNote[] = [];
let deaForms222: DEAForm222[] = [];
let controlledSubstanceLogs: ControlledSubstanceLog[] = [];

/**
 * Compliance Service Class
 */
export class ComplianceService {
  
  // ==================== PATIENT CONSENT ====================
  
  /**
   * Record patient consent for HIPAA purposes
   */
  recordConsent(
    patientId: string,
    consentType: PatientConsent['consentType'],
    granted: boolean,
    staffId: string,
    notes?: string,
    signatureImage?: string
  ): PatientConsent {
    const consent: PatientConsent = {
      id: `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      patientId,
      consentType,
      granted,
      grantedDate: new Date().toISOString(),
      consentToken: generateConsentToken(),
      staffId,
      notes,
      signatureImage,
    };
    
    patientConsents.push(consent);
    return consent;
  }
  
  /**
   * Revoke previously granted consent
   */
  revokeConsent(consentId: string, staffId: string): PatientConsent | null {
    const consentIndex = patientConsents.findIndex(c => c.id === consentId);
    if (consentIndex === -1 || !patientConsents[consentIndex].granted) {
      return null;
    }
    
    patientConsents[consentIndex].revokedDate = new Date().toISOString();
    patientConsents[consentIndex].granted = false;
    
    return patientConsents[consentIndex];
  }
  
  /**
   * Check if patient has valid consent for a specific purpose
   */
  hasValidConsent(patientId: string, consentType: PatientConsent['consentType']): boolean {
    const consent = patientConsents.find(c => 
      c.patientId === patientId && 
      c.consentType === consentType && 
      c.granted && 
      !c.revokedDate &&
      (!c.expiryDate || new Date(c.expiryDate) > new Date())
    );
    
    return !!consent;
  }
  
  /**
   * Get all consents for a patient
   */
  getPatientConsents(patientId: string): PatientConsent[] {
    return patientConsents.filter(c => c.patientId === patientId);
  }
  
  // ==================== CLINICAL NOTES ====================
  
  /**
   * Create a clinical note (requires pharmacist role)
   */
  createClinicalNote(
    note: Omit<ClinicalNote, 'id' | 'createdAt'>,
    user: User
  ): ClinicalNote | null {
    // Check access control
    if (!canCreateClinicalNotes(user.role)) {
      console.warn(`User ${user.id} (${user.role}) attempted to create clinical note without permission`);
      return null;
    }
    
    // Encrypt the content if it's not already encrypted
    const encryptedContent = encryptPHI(note.content);
    
    const clinicalNote: ClinicalNote = {
      ...note,
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: encryptedContent,
      createdByIdentity: encryptPHI(`${user.id}:${user.name}`),
      createdAt: new Date().toISOString(),
    };
    
    clinicalNotes.push(clinicalNote);
    return clinicalNote;
  }
  
  /**
   * Get clinical notes for a patient (requires appropriate role)
   */
  getClinicalNotes(patientId: string, user: User, includePrivate: boolean = false): ClinicalNote[] {
    // Check access control
    if (!canAccessClinicalData(user.role)) {
      console.warn(`User ${user.id} (${user.role}) attempted to access clinical notes without permission`);
      return [];
    }
    
    let notes = clinicalNotes.filter(n => n.patientId === patientId);
    
    // Filter out private notes unless user is pharmacist or above
    if (!includePrivate || user.role === 'cashier' || user.role === 'manager') {
      notes = notes.filter(n => !n.isPrivate || user.role === 'pharmacist' || user.role === 'pharmacy_admin');
    }
    
    // Decrypt content for authorized users
    return notes.map(note => ({
      ...note,
      content: decryptPHI(note.content),
    }));
  }
  
  /**
   * Get a specific clinical note by ID
   */
  getClinicalNoteById(noteId: string, user: User): ClinicalNote | null {
    if (!canAccessClinicalData(user.role)) {
      return null;
    }
    
    const note = clinicalNotes.find(n => n.id === noteId);
    if (!note) return null;
    
    // Additional check for private notes
    if (note.isPrivate && user.role !== 'pharmacist' && user.role !== 'pharmacy_admin') {
      return null;
    }
    
    return {
      ...note,
      content: decryptPHI(note.content),
    };
  }
  
  // ==================== DEA FORM 222 ====================
  
  /**
   * Create a DEA Form 222 for C-II substance ordering
   */
  createDEAForm222(
    form: Omit<DEAForm222, 'id' | 'status' | 'orderDate'>,
    user: User
  ): DEAForm222 | null {
    // Check access control
    if (!canSubmitDEA222(user.role)) {
      console.warn(`User ${user.id} (${user.role}) attempted to submit DEA Form 222 without permission`);
      return null;
    }
    
    const deaForm: DEAForm222 = {
      ...form,
      id: `dea222_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      orderDate: new Date().toISOString(),
      status: 'draft',
    };
    
    deaForms222.push(deaForm);
    return deaForm;
  }
  
  /**
   * Submit a DEA Form 222
   */
  submitDEAForm222(formId: string, user: User): DEAForm222 | null {
    if (!canSubmitDEA222(user.role)) {
      return null;
    }
    
    const formIndex = deaForms222.findIndex(f => f.id === formId);
    if (formIndex === -1 || deaForms222[formIndex].status !== 'draft') {
      return null;
    }
    
    deaForms222[formIndex].status = 'submitted';
    deaForms222[formIndex].submittedDate = new Date().toISOString();
    
    return deaForms222[formIndex];
  }
  
  /**
   * Mark DEA Form 222 as received
   */
  receiveDEAForm222(formId: string, receivingStaffId: string): DEAForm222 | null {
    const formIndex = deaForms222.findIndex(f => f.id === formId);
    if (formIndex === -1 || deaForms222[formIndex].status !== 'submitted') {
      return null;
    }
    
    deaForms222[formIndex].status = 'received';
    deaForms222[formIndex].receivedDate = new Date().toISOString();
    deaForms222[formIndex].receivingStaffId = receivingStaffId;
    
    return deaForms222[formIndex];
  }
  
  /**
   * Get all DEA Forms 222
   */
  getDEAForms222(status?: DEAForm222['status']): DEAForm222[] {
    if (status) {
      return deaForms222.filter(f => f.status === status);
    }
    return deaForms222;
  }
  
  // ==================== CONTROLLED SUBSTANCE LOGGING ====================
  
  /**
   * Log daily controlled substance inventory (C-II)
   */
  logControlledSubstance(
    log: Omit<ControlledSubstanceLog, 'id' | 'discrepancy'>,
    user: User
  ): ControlledSubstanceLog | null {
    // Verify pharmacist role for controlled substance logging
    if (user.role !== 'pharmacist' && user.role !== 'pharmacy_admin') {
      console.warn(`User ${user.id} (${user.role}) attempted to log controlled substances without permission`);
      return null;
    }
    
    const discrepancy = log.closingBalance - (log.openingBalance + log.receipts - log.dispensed - log.wasted - log.transferred);
    
    const csLog: ControlledSubstanceLog = {
      ...log,
      id: `cs_log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      discrepancy,
    };
    
    controlledSubstanceLogs.push(csLog);
    return csLog;
  }
  
  /**
   * Get controlled substance logs for a date range
   */
  getControlledSubstanceLogs(
    ndc: string,
    startDate: string,
    endDate: string
  ): ControlledSubstanceLog[] {
    return controlledSubstanceLogs.filter(log => 
      log.ndc === ndc &&
      log.date >= startDate &&
      log.date <= endDate
    );
  }
  
  /**
   * Generate C-II daily report
   */
  generateC2DailyReport(date: string): Record<string, ControlledSubstanceLog> {
    const logsForDate = controlledSubstanceLogs.filter(log => log.date === date);
    const report: Record<string, ControlledSubstanceLog> = {};
    
    logsForDate.forEach(log => {
      report[log.ndc] = log;
    });
    
    return report;
  }
  
  // ==================== ACCESS CONTROL HELPERS ====================
  
  /**
   * Check if user can override a drug interaction
   */
  canUserOverrideInteraction(user: User): boolean {
    return canOverrideInteractions(user.role);
  }
  
  /**
   * Audit access to PHI (log for compliance)
   */
  auditPHIAccess(patientId: string, user: User, action: 'view' | 'modify' | 'export'): void {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      patientId: hashForAudit(patientId), // Hash for privacy
      userId: user.id,
      userRole: user.role,
      action,
      ipAddress: 'N/A', // Would come from request in production
    };
    
    // In production, this would be written to an immutable audit log
    console.log('[PHI AUDIT]', JSON.stringify(auditEntry));
  }
  
  // ==================== DATA INTEGRITY ====================
  
  /**
   * Verify data integrity using stored hash
   */
  verifyDataIntegrity(data: string, storedHash: string): boolean {
    const computedHash = hashForAudit(data);
    return computedHash === storedHash;
  }
}

// Export singleton instance
export const complianceService = new ComplianceService();
