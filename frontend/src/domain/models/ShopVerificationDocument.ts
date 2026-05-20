export type ShopVerificationDocumentType =
  | 'business_permit'
  | 'dti_sec_registration'
  | 'mayors_permit'
  | 'valid_government_id'

export interface ShopVerificationDocument {
  readonly id: string
  readonly shopIdentifier: string
  readonly documentType: ShopVerificationDocumentType
  readonly storagePath: string
  readonly fileName: string | null
  readonly fileSizeBytes: number | null
  readonly contentType: string | null
  readonly uploadedByIdentifier: string | null
  readonly uploadedAt: string
}

export interface ShopVerificationDocumentTypeDefinition {
  readonly documentType: ShopVerificationDocumentType
  readonly displayLabel: string
  readonly helperText: string
  readonly isRequired: boolean
}

export const shopVerificationDocumentTypeDefinitions: readonly ShopVerificationDocumentTypeDefinition[] =
  [
    {
      documentType: 'business_permit',
      displayLabel: 'Business permit',
      helperText:
        'Current business permit issued by the city or municipality where the shop operates.',
      isRequired: true,
    },
    {
      documentType: 'dti_sec_registration',
      displayLabel: 'DTI or SEC registration',
      helperText:
        'DTI certificate (sole proprietorship) or SEC registration (partnership/corporation).',
      isRequired: true,
    },
    {
      documentType: 'mayors_permit',
      displayLabel: "Mayor's permit",
      helperText:
        'Mayor\u2019s permit / business license for the current year.',
      isRequired: true,
    },
    {
      documentType: 'valid_government_id',
      displayLabel: 'Valid government ID',
      helperText:
        'Government-issued photo ID of the shop owner (passport, driver\u2019s license, UMID, PhilSys, etc.).',
      isRequired: true,
    },
  ]
