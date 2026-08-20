/**
 * Compliance Infrastructure Types and Interfaces
 * 
 * Defines types for HIPAA compliance, DEA forms, patient consent,
 * and role-based access control for clinical data.
 */

import { StaffRole } from '../data';

/**
 * Patient consent record for HIPAA compliance
 */
export interface PatientConsent {
  id: string;
  patientId: string;
  consentType: 'treatment' | 'payment' | 'operations' | 'research' | 'marketing';
  granted: boolean;
  grantedDate: string;
  expiryDate?: string;
  revokedDate?: string;
  consentToken: string; // Secure token for verification
  staffId: string; // Who recorded the consent
  notes?: string;
  signatureImage?: string; // Base64 encoded signature
}

/**
 * Clinical note with access control
 * Only pharmacists and above can create/view clinical notes
 */
export interface ClinicalNote {
  id: string;
  prescriptionId?: string;
  patientId: string;
  content: string; // Encrypted PHI
  createdBy: string; // Staff ID
  createdByIdentity: string; // Encrypted staff identity for audit
  createdAt: string;
  isPrivate: boolean; // Only visible to pharmacists
  category: 'clinical' | 'counseling' | 'adverse-event' | 'interaction-override' | 'other';
  relatedDrugNDC?: string;
  attachments?: string[]; // Storage URLs for scanned documents
}

/**
 * DEA Form 222 for controlled substance ordering (C-II substances)
 */
export interface DEAForm222 {
  id: string;
  formNumber: string; // Unique DEA form identifier
  pharmacyDEA: string; // Pharmacy's DEA number
  supplierDEA: string; // Supplier's DEA number
  supplierName: string;
  supplierAddress: string;
  orderDate: string;
  items: DEAForm222Item[];
  status: 'draft' | 'submitted' | 'received' | 'cancelled' | 'rejected';
  submittedDate?: string;
  receivedDate?: string;
  cancelledDate?: string;
  rejectedReason?: string;
  receivingStaffId?: string;
  notes?: string;
}

export interface DEAForm222Item {
  lineNumber: number;
  ndc: string;
  drugName: string;
  strength: string;
  dosageForm: string;
  quantityOrdered: number;
  quantityReceived?: number;
  unit: string; // e.g., 'mL', 'tablets', 'patches'
}

/**
 * Controlled substance inventory log (C-II daily tracking)
 */
export interface ControlledSubstanceLog {
  id: string;
  date: string; // YYYY-MM-DD
  ndc: string;
  drugName: string;
  openingBalance: number;
  receipts: number; // Received from suppliers
  dispensed: number; // Dispensed to patients
  wasted: number; // Wasted/destroyed with witness
  transferred: number; // Transferred out (negative) or in (positive)
  closingBalance: number;
  discrepancy: number; // Should be 0
  verifiedBy: string; // Pharmacist who verified
  witnessId?: string; // Witness for waste/discrepancy
  notes?: string;
}

/**
 * NCPDP Claim submission structure
 * Simplified version - real NCPDP D.0 is much more complex
 */
export interface NCPDPClaim {
  claimId: string;
  transactionCode: 'B1' | 'B3' | 'R1' | 'R3' | 'D1' | 'W1'; // B=Billing, R=Reversal, D=Refill, W=Cancel
  submitterId: string; // Pharmacy/NPI
  receiverId: string; // Payer ID
  patient: NCPDPPatient;
  prescriber: NCPDPPrescriber;
  pharmacy: NCPDPPharmacy;
  drug: NCPDPDrug;
  pricing: NCPDPPricing;
  insurance: NCPDPInsurance;
  submissionDate: string;
  status: 'pending' | 'accepted' | 'rejected' | 'paid' | 'denied';
  adjudication?: NCPDPAdjudication;
  rejectionCodes?: string[];
  resubmissionCount: number;
  priorAuthorization?: string;
}

export interface NCPDPPatient {
  patientId: string;
  firstName: string; // Encrypted
  lastName: string; // Encrypted
  dateOfBirth: string;
  gender: 'M' | 'F' | 'U';
  address?: string; // Encrypted
  phone?: string; // Encrypted
  memberID: string; // Insurance member ID
  groupID?: string;
  relationshipCode: '18' | '19' | '20' | '21' | '22'; // Self, spouse, child, etc.
}

export interface NCPDPPrescriber {
  npi: string;
  dea?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  specialty?: string;
}

export interface NCPDPPharmacy {
  npi: string;
  dea: string;
  name: string;
  address: string;
  phone: string;
  stateLicense: string;
}

export interface NCPDPDrug {
  ndc: string;
  drugName: string;
  strength: string;
  dosageForm: string;
  quantityDispensed: number;
  daysSupply: number;
  refillsAuthorized: number;
  dawCode: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'; // Dispense As Written
  prescriptionOrigin: '0' | '1' | '2' | '3' | '4'; // Original, refill, transfer, etc.
  writtenDate: string;
  fillDate: string;
}

export interface NCPDPPricing {
  ingredientCost: number;
  dispensingFee: number;
  totalAmount: number;
  usualAndCustomaryPrice: number;
  salesTax?: number;
}

export interface NCPDPInsurance {
  cardholderID: string;
  groupID: string;
  personCode: string;
  bin: string; // Bank Identification Number
  pcn: string; // Processor Control Number
  planName?: string;
  copayAmount?: number;
  deductibleAmount?: number;
}

export interface NCPDPAdjudication {
  paidAmount: number;
  patientPayAmount: number;
  deductibleAmount: number;
  copayAmount: number;
  coinsuranceAmount: number;
  rejectedAmount: number;
  otherCoverageAmount: number;
  incentiveAmount?: number;
  feeForUseAmount?: number;
  priorAuthorizationStatus?: 'approved' | 'required' | 'pending';
  messageCenter?: NCPDPMessage[];
}

export interface NCPDPMessage {
  messageType: 'info' | 'warning' | 'error';
  messageCode: string;
  messageText: string;
}

/**
 * Access control matrix for clinical data
 */
export const CLINICAL_ACCESS_MATRIX: Record<StaffRole, {
  canViewClinicalNotes: boolean;
  canCreateClinicalNotes: boolean;
  canOverrideInteractions: boolean;
  canViewPHI: boolean;
  canModifyPHI: boolean;
  canSubmitDEA222: boolean;
  canVerifyControlledSubstances: boolean;
}> = {
  super_admin: {
    canViewClinicalNotes: true,
    canCreateClinicalNotes: false,
    canOverrideInteractions: false,
    canViewPHI: true,
    canModifyPHI: false,
    canSubmitDEA222: false,
    canVerifyControlledSubstances: false,
  },
  pharmacy_admin: {
    canViewClinicalNotes: true,
    canCreateClinicalNotes: true,
    canOverrideInteractions: true,
    canViewPHI: true,
    canModifyPHI: true,
    canSubmitDEA222: true,
    canVerifyControlledSubstances: true,
  },
  pharmacist: {
    canViewClinicalNotes: true,
    canCreateClinicalNotes: true,
    canOverrideInteractions: true,
    canViewPHI: true,
    canModifyPHI: true,
    canSubmitDEA222: true,
    canVerifyControlledSubstances: true,
  },
  manager: {
    canViewClinicalNotes: true,
    canCreateClinicalNotes: false,
    canOverrideInteractions: false,
    canViewPHI: true,
    canModifyPHI: false,
    canSubmitDEA222: false,
    canVerifyControlledSubstances: false,
  },
  cashier: {
    canViewClinicalNotes: false,
    canCreateClinicalNotes: false,
    canOverrideInteractions: false,
    canViewPHI: false,
    canModifyPHI: false,
    canSubmitDEA222: false,
    canVerifyControlledSubstances: false,
  },
};

/**
 * Check if a staff member can access clinical data
 */
export function canAccessClinicalData(role: StaffRole): boolean {
  return CLINICAL_ACCESS_MATRIX[role].canViewPHI;
}

/**
 * Check if a staff member can create clinical notes
 */
export function canCreateClinicalNotes(role: StaffRole): boolean {
  return CLINICAL_ACCESS_MATRIX[role].canCreateClinicalNotes;
}

/**
 * Check if a staff member can override drug interactions
 */
export function canOverrideInteractions(role: StaffRole): boolean {
  return CLINICAL_ACCESS_MATRIX[role].canOverrideInteractions;
}

/**
 * Check if a staff member can submit DEA Form 222
 */
export function canSubmitDEA222(role: StaffRole): boolean {
  return CLINICAL_ACCESS_MATRIX[role].canSubmitDEA222;
}
